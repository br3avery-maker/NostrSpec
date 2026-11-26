import { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import type { EventKindEntry, WireMessageEntry } from '../lib/nipsParser';

interface EventKindsViewProps {
  eventKinds: EventKindEntry[];
  wireMessages: WireMessageEntry[];
  onSelectNip: (nipId: string) => void;
  loading: boolean;
  initialSearch?: string;
}

type StorageFilter = 'all' | 'regular' | 'replaceable' | 'ephemeral' | 'addressable';

const STORAGE_RULES: Record<Exclude<StorageFilter, 'all'>, { label: string; range: string; rule: string }> = {
  regular: {
    label: 'Regular',
    range: '1, 2, 4–9999',
    rule: 'Retained independently by Event ID',
  },
  replaceable: {
    label: 'Replaceable',
    range: '0, 3, 10000–19999',
    rule: 'Kind + Author; newer created_at replaces older',
  },
  ephemeral: {
    label: 'Ephemeral',
    range: '20000–29999',
    rule: 'Relays forward live without persisting to disk',
  },
  addressable: {
    label: 'Addressable',
    range: '30000–39999',
    rule: 'Kind + Author + first d-tag value',
  },
};

export function EventKindsView({
  eventKinds,
  wireMessages,
  onSelectNip,
  loading,
  initialSearch = '',
}: EventKindsViewProps) {
  const [activeTab, setActiveTab] = useState<'kinds' | 'wire'>('kinds');
  const [search, setSearch] = useState(initialSearch);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('all');

  const filteredKinds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eventKinds.filter((entry) => {
      if (storageFilter !== 'all' && entry.storageClass !== storageFilter) {
        return false;
      }
      if (!q) return true;
      return (
        entry.kind.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.nips.some((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      );
    });
  }, [eventKinds, search, storageFilter]);

  const clientToRelay = useMemo(
    () => wireMessages.filter((m) => m.direction === 'client-to-relay'),
    [wireMessages],
  );
  const relayToClient = useMemo(
    () => wireMessages.filter((m) => m.direction === 'relay-to-client'),
    [wireMessages],
  );

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500">
            <span>nostr-protocol/nips</span>
            <span className="mx-1.5" aria-hidden="true">/</span>
            <span>README.md Registry</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Event Kinds & Wire Protocol Registry
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Parsed directly from the official Nostr NIPs repository and classified automatically using NIP-01 storage and replacement rules.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('kinds')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'kinds'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Event Kinds ({eventKinds.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('wire')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'wire'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Wire Messages ({wireMessages.length})
          </button>
        </div>
      </div>

      {activeTab === 'kinds' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.keys(STORAGE_RULES) as Array<Exclude<StorageFilter, 'all'>>).map((key) => {
              const info = STORAGE_RULES[key];
              const count = eventKinds.filter((e) => e.storageClass === key).length;
              const isSelected = storageFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStorageFilter(isSelected ? 'all' : key)}
                  className={`text-left p-4 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-400'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{info.label}</span>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">{count} kinds</span>
                  </div>
                  <div className="text-xs font-mono text-indigo-700 mt-1 tabular-nums">{info.range}</div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{info.rule}</p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <label htmlFor="kind-search" className="sr-only">
                Search event kinds by number, description, or NIP
              </label>
              <input
                id="kind-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by kind (e.g. 10002), description, or NIP..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/80 overflow-x-auto">
              {(['all', 'regular', 'replaceable', 'ephemeral', 'addressable'] as StorageFilter[]).map(
                (filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStorageFilter(filter)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                      storageFilter === filter
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {filter}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 w-32">Kind</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600">Description</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 w-36">NIP-01 Storage</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-600 w-44">Specification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, idx) => (
                      <tr key={idx} className="h-11">
                        <td className="px-4 py-2.5"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-2.5"><div className="h-4 w-56 bg-slate-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-2.5"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-2.5"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse" /></td>
                      </tr>
                    ))
                  ) : filteredKinds.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                        <p className="text-sm font-medium text-slate-700">No event kinds match your filter.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setStorageFilter('all');
                          }}
                          className="mt-3 px-3.5 py-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
                        >
                          Clear Filters
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredKinds.map((entry, idx) => (
                      <tr
                        key={`${entry.kind}-${idx}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {entry.kind}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          <span className={entry.deprecated ? 'line-through text-slate-400' : ''}>
                            {entry.description}
                          </span>
                          {entry.deprecated && (
                            <span className="ml-2 text-xs text-amber-700 font-medium">Deprecated</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 capitalize whitespace-nowrap">
                          {entry.storageClass}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {entry.nips.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              {entry.nips.map((ref, refIdx) =>
                                ref.external ? (
                                  <span key={refIdx} className="text-xs text-slate-500">
                                    {ref.label}
                                  </span>
                                ) : (
                                  <button
                                    key={refIdx}
                                    type="button"
                                    onClick={() => onSelectNip(ref.id)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2"
                                  >
                                    <span>{ref.label}</span>
                                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                ),
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { title: 'Client to Relay Messages', subtitle: 'Sent from Nostr clients over WebSocket', rows: clientToRelay },
            { title: 'Relay to Client Messages', subtitle: 'Returned by relays for subscriptions and publishes', rows: relayToClient },
          ].map((group) => (
            <section key={group.title} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70">
                <h2 className="text-base font-semibold text-slate-900">{group.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{group.subtitle}</p>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 w-28">Verb</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Behavior</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 w-24">Spec</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.rows.map((msg, idx) => (
                    <tr key={`${msg.type}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {msg.type}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-sm">{msg.description}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {msg.nips.map((ref) => (
                          <button
                            key={ref.id}
                            type="button"
                            onClick={() => onSelectNip(ref.id)}
                            className="text-xs font-medium text-indigo-700 hover:underline underline-offset-2 mr-2"
                          >
                            {ref.label}
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
