import { useMemo, useState } from 'react';
import { ArrowRight, Check, Minus, Search } from 'lucide-react';
import {
  buildCompatibilityReport,
  type NipCompatibilityRow,
} from '../lib/compatibilityMatrix';
import type { NipCategory, NipSummary } from '../lib/nipsParser';
import { OPERATION_REGISTRY } from '../registry/operations';
import { SDK_MODULE_MANIFEST } from '../sdk/index';

interface CompatibilityViewProps {
  nips: NipSummary[];
  loading: boolean;
  onSelectNip: (nipId: string) => void;
  onOpenSdkModule: (moduleId: string) => void;
  onOpenRoadmap: () => void;
}

type DashboardMode = 'matrix' | 'gaps';
type CoverageFilter = 'active' | 'implemented' | 'missing' | 'all';

function statusText(row: NipCompatibilityRow): { label: string; className: string } {
  switch (row.status) {
    case 'core-sdk':
      return { label: 'Core SDK', className: 'text-emerald-700 font-medium' };
    case 'addon-only':
      return { label: 'Add-On Only', className: 'text-amber-800 font-medium' };
    case 'missing':
      return { label: 'Missing', className: 'text-slate-500' };
    case 'legacy':
      return { label: 'Legacy', className: 'text-slate-400' };
  }
}

export function CompatibilityView({
  nips,
  loading,
  onSelectNip,
  onOpenSdkModule,
  onOpenRoadmap,
}: CompatibilityViewProps) {
  const [mode, setMode] = useState<DashboardMode>('matrix');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('active');
  const [selectedCategory, setSelectedCategory] = useState<'All' | NipCategory>('All');
  const [search, setSearch] = useState('');

  const report = useMemo(
    () => buildCompatibilityReport(nips, SDK_MODULE_MANIFEST, OPERATION_REGISTRY),
    [nips],
  );

  const coreModules = useMemo(
    () => SDK_MODULE_MANIFEST.filter((m) => m.origin === 'nip-contract'),
    [],
  );
  const addonModules = useMemo(
    () => SDK_MODULE_MANIFEST.filter((m) => m.origin === 'sdk-extension'),
    [],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return report.rows.filter((row) => {
      if (mode === 'gaps' && row.status !== 'missing') return false;
      if (mode === 'matrix') {
        if (coverageFilter === 'active' && row.status === 'legacy') return false;
        if (
          coverageFilter === 'implemented' &&
          row.status !== 'core-sdk' &&
          row.status !== 'addon-only'
        ) {
          return false;
        }
        if (coverageFilter === 'missing' && row.status !== 'missing') return false;
      }
      if (selectedCategory !== 'All' && row.nip.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        row.nip.id.toLowerCase().includes(q) ||
        `nip-${row.nip.id.toLowerCase()}`.includes(q) ||
        row.nip.title.toLowerCase().includes(q) ||
        row.nip.category.toLowerCase().includes(q) ||
        row.allModuleIds.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [report.rows, mode, coverageFilter, selectedCategory, search]);

  const missingByCategory = useMemo(() => {
    const groups = new Map<NipCategory, NipCompatibilityRow[]>();
    for (const row of filteredRows) {
      if (row.status !== 'missing') continue;
      const list = groups.get(row.nip.category) ?? [];
      list.push(row);
      groups.set(row.nip.category, list);
    }
    return Array.from(groups.entries());
  }, [filteredRows]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500">
            <span>nostr-protocol/nips</span>
            <span className="mx-1.5" aria-hidden="true">×</span>
            <span className="font-mono text-slate-700">@nostrspec/sdk</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            NIP Compatibility &amp; Gap Map
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
            Visualizes which official NIPs are covered across Core NIP Contract modules vs. added SDK Engineering Add-On layers, and surfaces every unimplemented active specification so gaps stay explicit.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setMode('matrix')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              mode === 'matrix'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Coverage Matrix
          </button>
          <button
            type="button"
            onClick={() => setMode('gaps')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              mode === 'gaps'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Missing Features ({report.missingActiveCount})
          </button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-64 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      ) : (
        <>
          {/* Headline KPI Strip */}
          <section
            aria-label="Coverage summary metrics"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
              <div className="text-xs text-slate-500">Active Official NIPs</div>
              <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {report.activeNips}
              </div>
              <div className="text-[11px] text-slate-500">
                {report.legacyNips} unrecommended excluded
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
              <div className="text-xs text-slate-500">Core NIP Contracts</div>
              <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
                {report.coreCoveredCount}
                <span className="text-sm font-normal text-slate-500 ml-1.5">
                  ({report.coreCoveragePercent}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Across {coreModules.length} official-contract modules
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
              <div className="text-xs text-slate-500">SDK Add-On Coverage</div>
              <div className="text-2xl font-bold text-amber-800 font-mono tabular-nums">
                +{report.addonOnlyCount}
                <span className="text-sm font-normal text-slate-500 ml-1.5">
                  ({report.activeCoveragePercent}% total)
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Added layers (not official NIP text)
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
              <div className="text-xs text-slate-500">Missing Active NIPs</div>
              <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {report.missingActiveCount}
              </div>
              <div className="text-[11px] text-slate-500">
                No dedicated module yet (usable via NIP-01)
              </div>
            </div>
          </section>

          {/* Category Coverage Breakdown (Clickable Filter) */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Coverage by Protocol Category
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any category to filter the matrix or missing features list below.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" aria-hidden="true" />
                  <span>Core NIP Contract</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" aria-hidden="true" />
                  <span>SDK Add-On Only</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 inline-block" aria-hidden="true" />
                  <span>Missing</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {report.categories.map((cat) => {
                const isSelected = selectedCategory === cat.category;
                const corePct =
                  cat.activeTotal > 0 ? (cat.coreCovered / cat.activeTotal) * 100 : 0;
                const addonPct =
                  cat.activeTotal > 0 ? (cat.addonOnlyCovered / cat.activeTotal) * 100 : 0;

                return (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() =>
                      setSelectedCategory(isSelected ? 'All' : cat.category)
                    }
                    className={`text-left p-3.5 rounded-lg border transition-colors space-y-2 ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50/50'
                        : 'border-slate-200 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {cat.category}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                        {cat.coveragePercent}%
                      </span>
                    </div>

                    {/* Stacked Coverage Bar */}
                    <svg
                      viewBox="0 0 100 8"
                      preserveAspectRatio="none"
                      className="h-2 w-full rounded-full bg-slate-100 block"
                      aria-hidden="true"
                    >
                      <rect x="0" y="0" width="100" height="8" className="fill-slate-100" />
                      {corePct > 0 && (
                        <rect x="0" y="0" width={corePct} height="8" className="fill-emerald-600" />
                      )}
                      {addonPct > 0 && (
                        <rect
                          x={corePct}
                          y="0"
                          width={addonPct}
                          height="8"
                          className="fill-amber-500"
                        />
                      )}
                    </svg>

                    <div className="text-[11px] text-slate-500 tabular-nums">
                      <span>{cat.coreCovered + cat.addonOnlyCovered} covered</span>
                      <span className="mx-1" aria-hidden="true">·</span>
                      <span className={cat.missingCount > 0 ? 'text-slate-700 font-medium' : ''}>
                        {cat.missingCount} missing
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Filter Toolbar */}
          <section className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="compat-filter-input" className="sr-only">
                  Filter NIP compatibility rows
                </label>
                <input
                  id="compat-filter-input"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter NIP-57, zaps, delivery.ts..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {selectedCategory !== 'All' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                >
                  Category: {selectedCategory} ×
                </button>
              )}
            </div>

            {mode === 'matrix' && (
              <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 border border-slate-200/80 self-start md:self-auto">
                {(
                  [
                    ['active', 'Active NIPs'],
                    ['implemented', 'Implemented'],
                    ['missing', 'Missing'],
                    ['all', 'All + Legacy'],
                  ] as Array<[CoverageFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCoverageFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      coverageFilter === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* MODE 1: NIP × SDK Module Coverage Matrix */}
          {mode === 'matrix' ? (
            <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th
                        rowSpan={2}
                        className="px-4 py-2.5 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 min-w-[260px] border-r border-slate-200"
                      >
                        Official NIP ({filteredRows.length})
                      </th>
                      <th
                        rowSpan={2}
                        className="px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200"
                      >
                        Status
                      </th>
                      <th
                        colSpan={coreModules.length}
                        className="px-3 py-1.5 text-center font-semibold text-emerald-900 bg-emerald-50/60 border-b border-r border-slate-200"
                      >
                        Core NIP Contracts
                      </th>
                      <th
                        colSpan={addonModules.length}
                        className="px-3 py-1.5 text-center font-semibold text-amber-900 bg-amber-50/70 border-b border-slate-200"
                      >
                        SDK Engineering Add-Ons (Not Official NIP Text)
                      </th>
                    </tr>
                    <tr className="border-b border-slate-200 bg-slate-50/90">
                      {coreModules.map((mod) => (
                        <th
                          key={mod.id}
                          className="px-2 py-2 text-center font-mono font-semibold text-slate-700 whitespace-nowrap border-r border-slate-100 last:border-r-slate-200"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenSdkModule(mod.id)}
                            className="hover:text-indigo-700 hover:underline"
                          >
                            {mod.id}
                          </button>
                        </th>
                      ))}
                      {addonModules.map((mod) => (
                        <th
                          key={mod.id}
                          className="px-2 py-2 text-center font-mono font-semibold text-amber-900 whitespace-nowrap border-r border-slate-100 last:border-r-0"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenSdkModule(mod.id)}
                            className="hover:text-indigo-700 hover:underline"
                          >
                            {mod.id}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2 + coreModules.length + addonModules.length}
                          className="px-4 py-10 text-center text-slate-500"
                        >
                          No NIPs match your current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const st = statusText(row);
                        return (
                          <tr key={row.nip.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-2.5 sticky left-0 bg-white border-r border-slate-200">
                              <button
                                type="button"
                                onClick={() => onSelectNip(row.nip.id)}
                                className="text-left group"
                              >
                                <div className="flex items-baseline gap-2">
                                  <span className="font-mono font-semibold text-indigo-700 group-hover:underline tabular-nums">
                                    NIP-{row.nip.id}
                                  </span>
                                  <span
                                    className={`font-medium truncate max-w-[200px] ${
                                      row.status === 'legacy'
                                        ? 'line-through text-slate-400'
                                        : 'text-slate-900'
                                    }`}
                                  >
                                    {row.nip.title}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {row.nip.category}
                                </div>
                              </button>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap border-r border-slate-200">
                              <span className={st.className}>{st.label}</span>
                            </td>
                            {coreModules.map((mod) => {
                              const covered = row.coreModules.includes(mod.id);
                              return (
                                <td
                                  key={mod.id}
                                  className="px-2 py-2.5 text-center border-r border-slate-100 last:border-r-slate-200"
                                >
                                  {covered ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenSdkModule(mod.id)}
                                      aria-label={`NIP-${row.nip.id} implemented in ${mod.file}`}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <Minus
                                      className="w-3 h-3 text-slate-200 mx-auto"
                                      aria-hidden="true"
                                    />
                                  )}
                                </td>
                              );
                            })}
                            {addonModules.map((mod) => {
                              const covered = row.addonModules.includes(mod.id);
                              return (
                                <td
                                  key={mod.id}
                                  className="px-2 py-2.5 text-center border-r border-slate-100 last:border-r-0"
                                >
                                  {covered ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenSdkModule(mod.id)}
                                      aria-label={`NIP-${row.nip.id} extended by SDK add-on ${mod.file}`}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <Minus
                                      className="w-3 h-3 text-slate-200 mx-auto"
                                      aria-hidden="true"
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            /* MODE 2: Missing Features Map */
            <section className="space-y-6">
              {missingByCategory.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-600">
                  No missing active NIPs match your current filter.
                </div>
              ) : (
                missingByCategory.map(([category, rows]) => (
                  <div
                    key={category}
                    className="bg-white border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">{category}</h2>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {rows.length} unimplemented {rows.length === 1 ? 'NIP' : 'NIPs'}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <div
                          key={row.nip.id}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                NIP-{row.nip.id}
                              </span>
                              <span className="text-sm font-medium text-slate-900">
                                {row.nip.title}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              <span>No dedicated SDK module yet</span>
                              {row.roadmapBridges.length > 0 && (
                                <>
                                  <span className="mx-1.5" aria-hidden="true">·</span>
                                  <button
                                    type="button"
                                    onClick={onOpenRoadmap}
                                    className="text-indigo-700 hover:underline font-medium"
                                  >
                                    Tracked on Roadmap ({row.roadmapBridges[0].title})
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelectNip(row.nip.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 whitespace-nowrap shrink-0 self-start sm:self-auto"
                          >
                            <span>Read Spec</span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
