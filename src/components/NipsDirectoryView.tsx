import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Menu,
  RefreshCw,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import {
  type EventKindEntry,
  type NipCategory,
  type NipSummary,
  type ParsedNipDocument,
} from '../lib/nipsParser';
import { classifyEventKind } from '../sdk/nip01';
import { SDK_MODULE_MANIFEST } from '../sdk/index';
import { CodeBlock } from './CodeBlock';
import { MarkdownRenderer, renderInlineMarkdown } from './MarkdownRenderer';

interface NipsDirectoryViewProps {
  nips: NipSummary[];
  eventKinds: EventKindEntry[];
  selectedNipId: string;
  onSelectNip: (nipId: string) => void;
  onOpenSdkModule: (moduleId: string) => void;
  onOpenPlayground: (tab?: 'signer' | 'nip19' | 'relays' | 'filters' | 'delivery') => void;
  onSyncUpstream: () => void;
  syncing: boolean;
  indexLoading: boolean;
  fetchedAt?: string;
  fromFallback?: boolean;
}

type StatusFilter = 'all' | 'active' | 'sdk' | 'unrecommended';
type ReaderMode = 'guide' | 'spec' | 'sdk';

const CATEGORIES: Array<'All Categories' | NipCategory> = [
  'All Categories',
  'Core Protocol',
  'Identity & Signing',
  'Relays & Sync',
  'Social & Content',
  'Messaging & Privacy',
  'Media & Storage',
  'Payments & Zaps',
  'Groups & Apps',
];

function playgroundTabForNip(
  nipId: string,
): 'signer' | 'nip19' | 'relays' | 'filters' | 'delivery' {
  const id = nipId.toUpperCase();
  if (id === '19' || id === '21') return 'nip19';
  if (id === '65' || id === '11') return 'relays';
  if (id === '70' || id === '17' || id === '59' || id === '5A' || id === '92') return 'delivery';
  return 'signer';
}

export function NipsDirectoryView({
  nips,
  eventKinds,
  selectedNipId,
  onSelectNip,
  onOpenSdkModule,
  onOpenPlayground,
  onSyncUpstream,
  syncing,
  indexLoading,
  fetchedAt,
  fromFallback,
}: NipsDirectoryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<'All Categories' | NipCategory>('All Categories');
  const [readerMode, setReaderMode] = useState<ReaderMode>('guide');
  const [mobileListOpen, setMobileListOpen] = useState(false);

  const [doc, setDoc] = useState<ParsedNipDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => nips.find((n) => n.id === selectedNipId) ?? null,
    [nips, selectedNipId],
  );

  const filteredNips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nips.filter((nip) => {
      if (statusFilter === 'active' && nip.unrecommended) return false;
      if (statusFilter === 'unrecommended' && !nip.unrecommended) return false;
      if (statusFilter === 'sdk' && nip.sdkModules.length === 0) return false;
      if (categoryFilter !== 'All Categories' && nip.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        nip.id.toLowerCase().includes(q) ||
        `nip-${nip.id.toLowerCase()}`.includes(q) ||
        nip.title.toLowerCase().includes(q) ||
        nip.category.toLowerCase().includes(q)
      );
    });
  }, [nips, search, statusFilter, categoryFilter]);

  const relatedEventKinds = useMemo(
    () =>
      eventKinds.filter((entry) =>
        entry.nips.some((ref) => ref.id.toUpperCase() === selectedNipId.toUpperCase()),
      ),
    [eventKinds, selectedNipId],
  );

  const matchingSdkModules = useMemo(
    () =>
      SDK_MODULE_MANIFEST.filter((mod) =>
        mod.nips.some((id) => id.toUpperCase() === selectedNipId.toUpperCase()),
      ).sort((a, b) => (a.origin === b.origin ? 0 : a.origin === 'nip-contract' ? -1 : 1)),
    [selectedNipId],
  );

  const sdkModuleOriginById = useMemo(
    () => new Map(SDK_MODULE_MANIFEST.map((m) => [m.id, m.origin])),
    [],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadDoc() {
      setDocLoading(true);
      setDocError(null);
      try {
        const res = await fetch(`/api/nips/${encodeURIComponent(selectedNipId)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (active) {
          setDoc(data as ParsedNipDocument);
        }
      } catch (err) {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          setDoc(null);
          setDocError(err instanceof Error ? err.message : 'Unable to fetch specification');
        }
      } finally {
        if (active) setDocLoading(false);
      }
    }

    loadDoc();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedNipId]);

  const handleChooseNip = (id: string) => {
    onSelectNip(id);
    setMobileListOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-3 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-900">
            Official NIPs ({filteredNips.length})
          </div>
          <button
            type="button"
            onClick={onSyncUpstream}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-colors"
            aria-label="Refresh NIPs from official GitHub repository"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{syncing ? 'Syncing' : 'Refresh'}</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <label htmlFor="nip-sidebar-search" className="sr-only">
            Search official NIPs
          </label>
          <input
            id="nip-sidebar-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search NIP-01, blossom, zaps..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-md bg-slate-100 border border-slate-200/70">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['sdk', 'In SDK'],
              ['unrecommended', 'Legacy'],
            ] as Array<[StatusFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                statusFilter === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="nip-category-select" className="sr-only">
            Filter NIPs by category
          </label>
          <select
            id="nip-category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'All Categories' | NipCategory)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav aria-label="Official NIPs list" className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {indexLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="h-3.5 w-16 bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-44 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredNips.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs font-medium text-slate-700">No NIPs match your filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setCategoryFilter('All Categories');
              }}
              className="text-xs font-medium text-indigo-700 hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          filteredNips.map((nip) => {
            const isSelected = nip.id === selectedNipId;
            return (
              <button
                key={nip.id}
                type="button"
                onClick={() => handleChooseNip(nip.id)}
                className={`w-full text-left px-4 py-2.5 transition-colors flex items-start gap-3 ${
                  isSelected
                    ? 'bg-indigo-50/75 text-indigo-950'
                    : 'bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span
                  className={`font-mono text-xs font-semibold tabular-nums pt-0.5 w-7 shrink-0 ${
                    isSelected ? 'text-indigo-700' : 'text-slate-400'
                  }`}
                >
                  {nip.id}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[13px] leading-snug font-medium truncate ${
                      nip.unrecommended ? 'line-through text-slate-400' : isSelected ? 'text-slate-950' : 'text-slate-800'
                    }`}
                  >
                    {nip.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    <span>{nip.category}</span>
                    {nip.sdkModules.length > 0 && (() => {
                      const hasCore = nip.sdkModules.some(
                        (id) => sdkModuleOriginById.get(id) === 'nip-contract',
                      );
                      const hasAddon = nip.sdkModules.some(
                        (id) => sdkModuleOriginById.get(id) === 'sdk-extension',
                      );
                      return (
                        <>
                          <span className="mx-1" aria-hidden="true">·</span>
                          <span
                            className={
                              !hasCore && hasAddon
                                ? 'text-amber-800 font-medium'
                                : 'text-indigo-700 font-medium'
                            }
                          >
                            {hasCore && hasAddon ? 'SDK + Add-On' : hasAddon ? 'SDK Add-On' : 'SDK'}
                          </span>
                        </>
                      );
                    })()}
                    {nip.unrecommended && (
                      <>
                        <span className="mx-1" aria-hidden="true">·</span>
                        <span className="text-amber-700">Unrecommended</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </nav>

      {fetchedAt && (
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">
          <span>Source: nostr-protocol/nips</span>
          <span className="mx-1" aria-hidden="true">·</span>
          <span>{fromFallback ? 'Offline Snapshot' : 'Live Synced'}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto flex min-h-[calc(100vh-57px)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[280px] shrink-0 border-r border-slate-200 bg-white sticky top-[57px] h-[calc(100vh-57px)]">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileListOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileListOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 w-[300px] max-w-[85vw] bg-white h-full shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-900">Browse NIPs</span>
              <button
                type="button"
                onClick={() => setMobileListOpen(false)}
                aria-label="Close NIPs navigation drawer"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{sidebarContent}</div>
          </div>
        </div>
      )}

      {/* Main Reader Area */}
      <div className="flex-1 min-w-0 flex">
        <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-10 py-8">
          {/* Mobile NIP picker trigger */}
          <div className="lg:hidden mb-5">
            <button
              type="button"
              onClick={() => setMobileListOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
              <span>Browse All {nips.length} NIPs</span>
            </button>
          </div>

          {docLoading ? (
            <div className="max-w-3xl space-y-6">
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
              <div className="h-9 w-2/3 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
              <div className="h-48 w-full bg-slate-100 rounded-lg animate-pulse" />
            </div>
          ) : docError ? (
            <div className="max-w-2xl p-6 rounded-lg border border-red-200 bg-white space-y-3">
              <h1 className="text-lg font-semibold text-slate-900">
                Unable to load NIP-{selectedNipId}
              </h1>
              <p className="text-sm text-red-700">{docError}</p>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectNip(selectedNipId)}
                  className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Retry Upstream Fetch
                </button>
                <a
                  href={`https://github.com/nostr-protocol/nips/blob/master/${selectedNipId}.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
                >
                  View directly on GitHub
                </a>
              </div>
            </div>
          ) : doc ? (
            <article className="max-w-[820px] space-y-7">
              {/* Breadcrumb & Document Header */}
              <header className="space-y-4 pb-6 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>nostr-protocol/nips</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-mono text-slate-700">{doc.file}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{doc.statuses.join(', ')}</span>
                  {selectedSummary && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{selectedSummary.category}</span>
                    </>
                  )}
                  {matchingSdkModules.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-700 font-medium">
                        {matchingSdkModules.every((m) => m.origin === 'sdk-extension')
                          ? `SDK Add-On (${matchingSdkModules.map((m) => m.file).join(', ')})`
                          : `Implemented in SDK (${matchingSdkModules
                              .map((m) =>
                                m.origin === 'sdk-extension' ? `${m.file} add-on` : m.file,
                              )
                              .join(', ')})`}
                      </span>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {selectedSummary ? `NIP-${doc.id}: ${selectedSummary.title}` : doc.title}
                  </h1>
                  {selectedSummary?.unrecommended && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                      <strong className="font-semibold">Unrecommended by official NIPs repository:</strong>{' '}
                      {selectedSummary.unrecommendedReason || 'This specification is marked unrecommended or superseded.'}
                    </p>
                  )}
                </div>

                {/* Mode Switcher & Contextual Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80">
                    {(
                      [
                        ['guide', 'Human-Readable Guide'],
                        ['spec', 'Official Spec'],
                        ['sdk', `SDK Examples (${matchingSdkModules.length})`],
                      ] as Array<[ReaderMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setReaderMode(mode)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          readerMode === mode
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenPlayground(playgroundTabForNip(doc.id))}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Test in Playground</span>
                    </button>
                    <a
                      href={doc.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                    >
                      <span>GitHub Source</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </header>

              {/* MODE 1: Human-Readable Developer Guide */}
              {readerMode === 'guide' && (
                <div className="space-y-8">
                  <section className="space-y-3">
                    <h2 className="text-lg font-semibold text-slate-900">Plain-Language Summary</h2>
                    <p className="text-[15px] leading-7 text-slate-700 max-w-[72ch]">
                      {renderInlineMarkdown(doc.overview, handleChooseNip)}
                    </p>
                  </section>

                  {/* Structured Protocol Facts Grid */}
                  <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-200 py-5">
                    <div>
                      <div className="text-xs text-slate-500">Specification Status</div>
                      <div className="text-sm font-semibold text-slate-900 mt-1 capitalize">
                        {selectedSummary?.unrecommended ? 'Unrecommended' : doc.statuses.join(' · ')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Event Kinds Defined</div>
                      <div className="text-sm font-semibold font-mono text-slate-900 mt-1 tabular-nums">
                        {relatedEventKinds.length > 0
                          ? relatedEventKinds.map((k) => k.kind).slice(0, 6).join(', ')
                          : doc.referencedKinds.length > 0
                            ? doc.referencedKinds.slice(0, 6).join(', ')
                            : 'Protocol / Encoding'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">TypeScript SDK Coverage</div>
                      <div className="text-sm font-semibold text-slate-900 mt-1">
                        {matchingSdkModules.length > 0
                          ? matchingSdkModules
                              .map((m) =>
                                m.origin === 'sdk-extension' ? `${m.file} (Add-On)` : m.file,
                              )
                              .join(', ')
                          : 'Compatible via NIP-01 core'}
                      </div>
                    </div>
                  </section>

                  {/* Event Kinds Defined by this NIP */}
                  {relatedEventKinds.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Event Kinds & Storage Lifecycle
                      </h2>
                      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80">
                              <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 w-28">Kind</th>
                              <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Purpose</th>
                              <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 w-36">Storage Rule</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {relatedEventKinds.map((entry, idx) => (
                              <tr key={`${entry.kind}-${idx}`}>
                                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {entry.kind}
                                </td>
                                <td className="px-4 py-2.5 text-slate-700">{entry.description}</td>
                                <td className="px-4 py-2.5 text-xs text-slate-600 capitalize">
                                  {entry.numericKind !== null
                                    ? classifyEventKind(entry.numericKind)
                                    : entry.storageClass}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* Key Takeaways extracted directly from spec */}
                  {doc.keyTakeaways.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="text-lg font-semibold text-slate-900">Key Rules & Implementation Notes</h2>
                      <ul className="space-y-2.5 max-w-[72ch]">
                        {doc.keyTakeaways.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
                            <span className="font-mono text-xs font-semibold text-indigo-700 pt-0.5 tabular-nums">
                              0{idx + 1}.
                            </span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Quick SDK Integration Recipe if covered */}
                  {matchingSdkModules.length > 0 && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold text-slate-900">
                          {matchingSdkModules[0].origin === 'sdk-extension'
                            ? 'TypeScript SDK Add-On Quickstart'
                            : 'TypeScript SDK Quickstart'}
                        </h2>
                        <button
                          type="button"
                          onClick={() => onOpenSdkModule(matchingSdkModules[0].id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                        >
                          <span>Inspect {matchingSdkModules[0].file}</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      {matchingSdkModules[0].origin === 'sdk-extension' && (
                        <p className="text-xs text-amber-950 bg-amber-50/70 border border-amber-200 rounded-lg px-3.5 py-2.5 leading-relaxed">
                          <strong className="font-semibold">
                            SDK Engineering Add-On (not part of the official NIP document):
                          </strong>{' '}
                          {matchingSdkModules[0].engineeringNote}
                        </p>
                      )}
                      <CodeBlock
                        code={matchingSdkModules[0].exampleCode}
                        language="typescript"
                        title={`@nostrspec/sdk — ${matchingSdkModules[0].file}${matchingSdkModules[0].origin === 'sdk-extension' ? ' (SDK Add-On)' : ''}`}
                      />
                    </section>
                  )}

                  {/* Full Specification Rendered Below */}
                  <section className="pt-4 border-t border-slate-200 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Complete Official Specification
                      </h2>
                      <span className="text-xs text-slate-500 font-mono">
                        nostr-protocol/nips/{doc.file}
                      </span>
                    </div>
                    <MarkdownRenderer blocks={doc.blocks} onSelectNip={handleChooseNip} />
                  </section>
                </div>
              )}

              {/* MODE 2: Full Official Spec */}
              {readerMode === 'spec' && (
                <div className="space-y-6">
                  <MarkdownRenderer blocks={doc.blocks} onSelectNip={handleChooseNip} />
                </div>
              )}

              {/* MODE 3: SDK Examples */}
              {readerMode === 'sdk' && (
                <div className="space-y-6">
                  {matchingSdkModules.length > 0 ? (
                    matchingSdkModules.map((mod) => (
                      <section key={mod.id} className="space-y-3 pb-6 border-b border-slate-200 last:border-b-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-xs text-slate-500">
                              <span className="font-mono text-slate-700">src/sdk/{mod.file}</span>
                              <span className="mx-1.5" aria-hidden="true">·</span>
                              <span
                                className={
                                  mod.origin === 'sdk-extension'
                                    ? 'text-amber-800 font-medium'
                                    : 'text-slate-700 font-medium'
                                }
                              >
                                {mod.origin === 'sdk-extension'
                                  ? 'SDK Engineering Add-On (not from official NIPs)'
                                  : 'Official NIP Contract'}
                              </span>
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">{mod.title}</h2>
                            <p className="text-sm text-slate-600">{mod.summary}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenSdkModule(mod.id)}
                            className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-50 whitespace-nowrap shrink-0"
                          >
                            View {mod.file}
                          </button>
                        </div>
                        {mod.origin === 'sdk-extension' && mod.engineeringNote && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950 leading-relaxed">
                            <strong className="font-semibold">Added SDK Policy:</strong>{' '}
                            {mod.engineeringNote}
                          </div>
                        )}
                        <CodeBlock code={mod.exampleCode} language="typescript" title={mod.file} />
                      </section>
                    ))
                  ) : (
                    <section className="space-y-4">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Building NIP-{doc.id} Events with Core SDK Primitives
                      </h2>
                      <p className="text-sm text-slate-600 max-w-[70ch]">
                        Every Nostr NIP builds on NIP-01 events. Use <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">finalizeEvent</code> and{' '}
                        <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">RelayPool</code> from{' '}
                        <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">@nostrspec/sdk</code> to construct, sign, verify, and publish NIP-{doc.id} payloads.
                      </p>
                      <CodeBlock
                        language="typescript"
                        title={`nip-${doc.id.toLowerCase()}-example.ts`}
                        code={`import { generateSecretKey, finalizeEvent, verifyEvent, RelayPool } from './sdk';

const secretKey = generateSecretKey();
const event = finalizeEvent({
  kind: ${relatedEventKinds[0]?.numericKind ?? doc.referencedKinds[0] ?? 1},
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'NIP-${doc.id} payload',
}, secretKey);

if (!verifyEvent(event)) {
  throw new Error('Signature verification failed');
}

const pool = new RelayPool();
const results = await pool.publish(['wss://relay.damus.io'], event);
console.log(results);
pool.closeAll();`}
                      />
                    </section>
                  )}

                  {doc.codeExamples.length > 0 && (
                    <section className="space-y-4 pt-2">
                      <h2 className="text-base font-semibold text-slate-900">
                        Wire Examples from Official {doc.file}
                      </h2>
                      {doc.codeExamples.slice(0, 4).map((ex, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="text-xs font-medium text-slate-500">{ex.context}</div>
                          <CodeBlock code={ex.code} language={ex.language} />
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )}
            </article>
          ) : null}
        </main>

        {/* Right Sticky Table of Contents (Wide Desktop) */}
        {doc && doc.headings.length > 0 && readerMode !== 'sdk' && (
          <aside className="hidden xl:block w-[240px] shrink-0 py-8 pr-6">
            <div className="sticky top-[88px] space-y-3">
              <div className="text-xs font-semibold text-slate-900">On this page</div>
              <nav aria-label="Document sections" className="space-y-1.5 border-l border-slate-200 pl-3.5">
                {doc.headings.slice(0, 18).map((heading) => (
                  <a
                    key={heading.slug}
                    href={`#${heading.slug}`}
                    className={`block text-xs leading-snug text-slate-500 hover:text-indigo-700 transition-colors truncate ${
                      heading.level === 3 ? 'pl-3' : ''
                    }`}
                  >
                    {heading.text.replace(/`/g, '')}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
