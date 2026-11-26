import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Boxes, Code2, Hash, Search, X } from 'lucide-react';
import {
  buildGlobalSearchIndex,
  runGlobalSearch,
  type GlobalSearchEntry,
  type SearchEntryType,
} from '../lib/globalSearch';
import type { EventKindEntry, NipSummary } from '../lib/nipsParser';
import { OPERATION_REGISTRY } from '../registry/operations';
import { SDK_MODULE_MANIFEST } from '../sdk/index';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  nips: NipSummary[];
  eventKinds: EventKindEntry[];
  onSelectNip: (nipId: string) => void;
  onSelectKind: (kind: string) => void;
  onOpenSdkModule: (moduleId: string) => void;
  onSelectOperation: (operationId: string) => void;
}

const TYPE_TABS: Array<{ id: SearchEntryType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'nip', label: 'NIPs' },
  { id: 'kind', label: 'Event Kinds' },
  { id: 'sdk', label: 'SDK Modules' },
  { id: 'operation', label: 'API Ops' },
];

function EntryIcon({ type }: { type: SearchEntryType }) {
  switch (type) {
    case 'nip':
      return <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />;
    case 'kind':
      return <Hash className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />;
    case 'sdk':
      return <Boxes className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />;
    case 'operation':
      return <Code2 className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />;
  }
}

function entryTypeLabel(type: SearchEntryType): string {
  switch (type) {
    case 'nip':
      return 'NIP';
    case 'kind':
      return 'Event Kind';
    case 'sdk':
      return 'SDK Module';
    case 'operation':
      return 'API Operation';
  }
}

export function GlobalSearchModal({
  open,
  onClose,
  nips,
  eventKinds,
  onSelectNip,
  onSelectKind,
  onOpenSdkModule,
  onSelectOperation,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<SearchEntryType | 'all'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () =>
      buildGlobalSearchIndex({
        nips,
        eventKinds,
        sdkModules: SDK_MODULE_MANIFEST,
        operations: OPERATION_REGISTRY,
      }),
    [nips, eventKinds],
  );

  const results = useMemo(
    () => runGlobalSearch(entries, query, { typeFilter, limit: 24 }),
    [entries, query, typeFilter],
  );

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, typeFilter]);

  const handleSelectEntry = (entry: GlobalSearchEntry) => {
    switch (entry.type) {
      case 'nip':
        onSelectNip(entry.targetId);
        break;
      case 'kind':
        onSelectKind(entry.targetId);
        break;
      case 'sdk':
        onOpenSdkModule(entry.targetId);
        break;
      case 'operation':
        onSelectOperation(entry.targetId);
        break;
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Global fuzzy search"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) =>
            results.length === 0 ? 0 : (prev - 1 + results.length) % results.length,
          );
        } else if (e.key === 'Enter' && results[activeIndex]) {
          e.preventDefault();
          handleSelectEntry(results[activeIndex].entry);
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Search Dialog Surface */}
      <div className="relative z-10 w-full max-w-[660px] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[76vh]">
        {/* Input Row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <label htmlFor="global-fuzzy-search-input" className="sr-only">
            Fuzzy search across NIPs, event kinds, SDK modules, and API operations
          </label>
          <input
            ref={inputRef}
            id="global-fuzzy-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fuzzy search NIPs, event kinds (e.g. 10002), SDK symbols, or API ops..."
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-slate-500 hover:text-slate-900 px-1.5 py-0.5"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close global search"
            className="p-1 text-slate-400 hover:text-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-4 py-2 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1">
            {TYPE_TABS.map((tab) => {
              const active = typeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-950 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap shrink-0 tabular-nums">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {results.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-800">
                No matches for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-slate-500">
                Try a NIP number (01, 65, B7), an event kind (30023), a symbol (planRelayDelivery), or a typo-tolerant keyword (blosm, zaps).
              </p>
            </div>
          ) : (
            results.map(({ entry }, idx) => {
              const isHighlighted = idx === activeIndex;
              return (
                <button
                  key={entry.uid}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelectEntry(entry)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    isHighlighted ? 'bg-indigo-50/75' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="pt-0.5">
                    <EntryIcon type={entry.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          isHighlighted ? 'text-indigo-950' : 'text-slate-900'
                        }`}
                      >
                        {entry.title}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap shrink-0">
                        {entryTypeLabel(entry.type)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {entry.subtitle}
                    </div>
                  </div>
                  <ArrowRight
                    className={`w-3.5 h-3.5 shrink-0 mt-1 transition-opacity ${
                      isHighlighted ? 'text-indigo-600 opacity-100' : 'opacity-0'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono text-slate-700">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="font-mono text-slate-700">↵</kbd> Jump to doc
            </span>
            <span>
              <kbd className="font-mono text-slate-700">Esc</kbd> Close
            </span>
          </div>
          <span className="hidden sm:inline">
            Fuzzy matches NIPs, event kinds, SDK symbols &amp; operations
          </span>
        </div>
      </div>
    </div>
  );
}
