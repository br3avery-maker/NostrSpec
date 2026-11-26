import { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Download, Search } from 'lucide-react';
import {
  ECOSYSTEM_BRIDGES,
  exportRoadmapAsMarkdown,
  ROADMAP_PHASES,
  STRATEGIC_COMBINATIONS,
  WORKFLOW_STAGES,
} from '../data/roadmapData';

interface RoadmapViewProps {
  onSelectNip: (nipId: string) => void;
  onOpenSdkModule: (moduleId: string) => void;
}

type SectionView = 'all' | 'roadmap' | 'bridges';
type BridgeTierFilter = 'all' | 'core' | 'extended';

export function RoadmapView({ onSelectNip, onOpenSdkModule }: RoadmapViewProps) {
  const [sectionView, setSectionView] = useState<SectionView>('all');
  const [bridgeTier, setBridgeTier] = useState<BridgeTierFilter>('all');
  const [bridgeSearch, setBridgeSearch] = useState('');
  const [copiedMd, setCopiedMd] = useState(false);

  const filteredBridges = useMemo(() => {
    const q = bridgeSearch.trim().toLowerCase();
    return ECOSYSTEM_BRIDGES.filter((bridge) => {
      if (bridgeTier !== 'all' && bridge.tier !== bridgeTier) return false;
      if (!q) return true;
      return (
        bridge.wallTitle.toLowerCase().includes(q) ||
        bridge.bridgeTitle.toLowerCase().includes(q) ||
        bridge.wallSummary.toLowerCase().includes(q) ||
        bridge.bridgeSummary.toLowerCase().includes(q) ||
        bridge.sdkPrimitives.some((p) => p.toLowerCase().includes(q)) ||
        bridge.nips.some((n) => `nip-${n.toLowerCase()}`.includes(q) || n.toLowerCase().includes(q))
      );
    });
  }, [bridgeTier, bridgeSearch]);

  const handleDownloadMarkdown = () => {
    const content = exportRoadmapAsMarkdown();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nostrspec-roadmap-and-bridges.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(exportRoadmapAsMarkdown());
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-slate-200">
        <div className="space-y-2 max-w-3xl">
          <div className="text-xs text-slate-500">
            <span>NostrSpec</span>
            <span className="mx-1.5" aria-hidden="true">/</span>
            <span>Spec-First Architecture & Product Direction</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            SDK Roadmap & 12 Ecosystem Bridges
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Built spec-first from the official <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">nostr-protocol/nips</code> contracts instead of extracting an SDK out of an app later. Every bridge maps a real wall facing non-technical people directly to the clean SDK primitives required to tear it down.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {copiedMd ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Copied Markdown</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Roadmap (.md)</span>
          </button>
        </div>
      </header>

      {/* Section Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80">
          {(
            [
              ['all', 'All Sections'],
              ['roadmap', `Phased Roadmap (${ROADMAP_PHASES.length})`],
              ['bridges', `Ecosystem Bridges (${ECOSYSTEM_BRIDGES.length})`],
            ] as Array<[SectionView, string]>
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => setSectionView(view)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                sectionView === view
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 tabular-nums">
          <span>6 Phases</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>14 Milestones</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>12 Bridges</span>
        </div>
      </div>

      {/* Unified 4-Stage Workflow */}
      {sectionView !== 'bridges' && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              Unified Four-Stage Architecture Workflow
            </h2>
            <p className="text-sm text-slate-600 max-w-3xl">
              Every bridge shares the same clean boundary: the SDK computes deterministic protocol structure and unsigned templates while cryptographic signing stays strictly inside the user’s signer.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {WORKFLOW_STAGES.map((stage) => (
              <div
                key={stage.step}
                className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="text-xs font-mono font-semibold text-indigo-700 tabular-nums">
                    Stage {stage.step}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{stage.title}</h3>
                  <p className="text-xs leading-relaxed text-slate-600">{stage.humanLayer}</p>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-medium text-slate-500">SDK Responsibility</div>
                  <p className="text-xs text-slate-800 mt-1 leading-relaxed">{stage.sdkLayer}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Phased Roadmap & Milestones */}
      {(sectionView === 'all' || sectionView === 'roadmap') && (
        <section className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">
              Phased Roadmap & Milestones (Phases 0–5)
            </h2>
            <p className="text-sm text-slate-600 max-w-3xl">
              Sequenced so each phase builds cleanly on the SDK layer below it—no tangled app routers or post-hoc code recovery.
            </p>
          </div>

          <div className="space-y-4">
            {ROADMAP_PHASES.map((phase) => (
              <article
                key={phase.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        Phase {phase.number}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-medium ${
                          phase.status === 'Completed'
                            ? 'text-emerald-700'
                            : phase.status === 'Next'
                              ? 'text-indigo-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {phase.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{phase.bridgeRef}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{phase.title}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono">
                    {phase.nips.map((nipId) => (
                      <button
                        key={nipId}
                        type="button"
                        onClick={() => onSelectNip(nipId)}
                        className="text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2"
                      >
                        NIP-{nipId}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <p className="text-sm text-slate-700 leading-relaxed max-w-4xl">{phase.goal}</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {phase.milestones.map((milestone) => (
                      <div key={milestone.id} className="space-y-2">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-semibold text-indigo-700 tabular-nums">
                            {milestone.id}
                          </span>
                          <h4 className="text-sm font-semibold text-slate-900">
                            {milestone.title}
                          </h4>
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-600 leading-relaxed list-disc pl-4 marker:text-slate-300">
                          {milestone.deliverables.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="text-slate-600">
                      <span className="font-semibold text-slate-800">Milestone Gate: </span>
                      <span>{phase.exitCriterion}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {phase.sdkModules.slice(0, 3).map((modId) => (
                        <button
                          key={modId}
                          type="button"
                          onClick={() => onOpenSdkModule(modId)}
                          className="inline-flex items-center gap-1 font-mono text-indigo-700 hover:text-indigo-900 hover:underline whitespace-nowrap"
                        >
                          <span>{modId}.ts</span>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* All 12 Ecosystem Bridges */}
      {(sectionView === 'all' || sectionView === 'bridges') && (
        <section className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">
                12 Ecosystem Bridges (Walls Worth Tearing Down)
              </h2>
              <p className="text-sm text-slate-600 max-w-3xl">
                Concrete use cases for non-CS creators and communities, mapped directly to the underlying SDK primitives we need to build.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <label htmlFor="bridge-search" className="sr-only">
                  Search ecosystem bridges
                </label>
                <input
                  id="bridge-search"
                  type="search"
                  value={bridgeSearch}
                  onChange={(e) => setBridgeSearch(e.target.value)}
                  placeholder="Filter bridges, NIPs, primitives..."
                  className="w-full sm:w-56 pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="inline-flex items-center p-1 rounded-md bg-slate-100 border border-slate-200/80">
                {(
                  [
                    ['all', 'All (12)'],
                    ['core', 'Core (1–5)'],
                    ['extended', 'Beyond Feed (6–12)'],
                  ] as Array<[BridgeTierFilter, string]>
                ).map(([tier, label]) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setBridgeTier(tier)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      bridgeTier === tier
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredBridges.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">No ecosystem bridges match your filter.</p>
              <button
                type="button"
                onClick={() => {
                  setBridgeSearch('');
                  setBridgeTier('all');
                }}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredBridges.map((bridge) => (
                <article
                  key={bridge.id}
                  className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                        Bridge {String(bridge.id).padStart(2, '0')}
                      </span>
                      <span>
                        {bridge.tier === 'core' ? 'Core Roadmap' : 'Beyond the Feed'}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="capitalize">{bridge.phaseId.replace('-', ' ')}</span>
                      </span>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">{bridge.wallTitle}</div>
                      <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                        {bridge.bridgeTitle}
                      </h3>
                    </div>

                    <div className="space-y-2 text-xs leading-relaxed">
                      <p className="text-slate-600">
                        <strong className="font-semibold text-slate-800">The wall: </strong>
                        {bridge.wallSummary}
                      </p>
                      <p className="text-slate-700">
                        <strong className="font-semibold text-slate-900">The bridge: </strong>
                        {bridge.bridgeSummary}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div>
                      <div className="text-[11px] font-medium text-slate-500">
                        SDK Primitives Required
                      </div>
                      <div className="text-xs text-slate-800 mt-1">
                        {bridge.sdkPrimitives.join(' · ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono">
                      {bridge.nips.map((nipId) => (
                        <button
                          key={nipId}
                          type="button"
                          onClick={() => onSelectNip(nipId)}
                          className="text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2"
                        >
                          NIP-{nipId}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* High-Leverage Combinations */}
          <div className="pt-4 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              High-Leverage Product Combinations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STRATEGIC_COMBINATIONS.map((combo) => (
                <div
                  key={combo.id}
                  className="bg-white border border-slate-200 rounded-lg p-5 space-y-2"
                >
                  <div className="text-xs font-mono text-indigo-700 tabular-nums">
                    Bridges {combo.bridges.join(' + ')}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">{combo.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{combo.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
