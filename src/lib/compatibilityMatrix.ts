import { ECOSYSTEM_BRIDGES } from '../data/roadmapData';
import type { OperationContract } from '../registry/operations';
import type { SdkModuleManifest } from '../sdk/index';
import type { NipCategory, NipSummary } from './nipsParser';

export type NipCoverageStatus = 'core-sdk' | 'addon-only' | 'missing' | 'legacy';

export interface NipCompatibilityRow {
  nip: NipSummary;
  status: NipCoverageStatus;
  coreModules: string[];
  addonModules: string[];
  allModuleIds: string[];
  operations: string[];
  roadmapBridges: Array<{ id: number; title: string; phaseId: string }>;
}

export interface CategoryCoverageStat {
  category: NipCategory;
  activeTotal: number;
  coreCovered: number;
  addonOnlyCovered: number;
  missingCount: number;
  legacyCount: number;
  coveragePercent: number;
}

export interface ModuleCoverageStat {
  module: SdkModuleManifest;
  coveredNipIds: string[];
  operationCount: number;
}

export interface CompatibilityReport {
  totalNips: number;
  activeNips: number;
  legacyNips: number;
  coreCoveredCount: number;
  addonOnlyCount: number;
  totalCoveredActiveCount: number;
  missingActiveCount: number;
  activeCoveragePercent: number;
  coreCoveragePercent: number;
  rows: NipCompatibilityRow[];
  missingRows: NipCompatibilityRow[];
  categories: CategoryCoverageStat[];
  modules: ModuleCoverageStat[];
}

const CATEGORY_ORDER: NipCategory[] = [
  'Core Protocol',
  'Identity & Signing',
  'Relays & Sync',
  'Social & Content',
  'Messaging & Privacy',
  'Media & Storage',
  'Payments & Zaps',
  'Groups & Apps',
];

export function buildCompatibilityReport(
  nips: NipSummary[],
  sdkModules: SdkModuleManifest[],
  operations: OperationContract[],
): CompatibilityReport {
  const coreModuleSet = new Set(
    sdkModules.filter((m) => m.origin === 'nip-contract').map((m) => m.id),
  );
  const addonModuleSet = new Set(
    sdkModules.filter((m) => m.origin === 'sdk-extension').map((m) => m.id),
  );

  // Map NIP ID -> module IDs directly from SDK_MODULE_MANIFEST (single source of truth)
  const modulesByNip = new Map<string, string[]>();
  for (const mod of sdkModules) {
    for (const rawNip of mod.nips) {
      const nipId = rawNip.toUpperCase();
      const existing = modulesByNip.get(nipId) ?? [];
      if (!existing.includes(mod.id)) {
        existing.push(mod.id);
      }
      modulesByNip.set(nipId, existing);
    }
  }

  // Map NIP ID -> API operations
  const opsByNip = new Map<string, string[]>();
  for (const op of operations) {
    for (const rawNip of op.nips) {
      const nipId = rawNip.toUpperCase();
      const existing = opsByNip.get(nipId) ?? [];
      if (!existing.includes(op.id)) existing.push(op.id);
      opsByNip.set(nipId, existing);
    }
  }

  // Map NIP ID -> Roadmap Ecosystem Bridges (shows which missing features are already planned)
  const bridgesByNip = new Map<string, Array<{ id: number; title: string; phaseId: string }>>();
  for (const bridge of ECOSYSTEM_BRIDGES) {
    for (const rawNip of bridge.nips) {
      const nipId = rawNip.toUpperCase();
      const existing = bridgesByNip.get(nipId) ?? [];
      existing.push({ id: bridge.id, title: bridge.bridgeTitle, phaseId: bridge.phaseId });
      bridgesByNip.set(nipId, existing);
    }
  }

  const rows: NipCompatibilityRow[] = nips.map((nip) => {
    const nipKey = nip.id.toUpperCase();
    const mergedModules = Array.from(
      new Set([...(modulesByNip.get(nipKey) ?? []), ...nip.sdkModules]),
    );
    const coreModules = mergedModules.filter((id) => coreModuleSet.has(id));
    const addonModules = mergedModules.filter((id) => addonModuleSet.has(id));

    let status: NipCoverageStatus;
    if (nip.unrecommended) {
      status = 'legacy';
    } else if (coreModules.length > 0) {
      status = 'core-sdk';
    } else if (addonModules.length > 0) {
      status = 'addon-only';
    } else {
      status = 'missing';
    }

    return {
      nip,
      status,
      coreModules,
      addonModules,
      allModuleIds: mergedModules,
      operations: opsByNip.get(nipKey) ?? [],
      roadmapBridges: bridgesByNip.get(nipKey) ?? [],
    };
  });

  const activeRows = rows.filter((r) => r.status !== 'legacy');
  const legacyNips = rows.length - activeRows.length;
  const coreCoveredCount = activeRows.filter((r) => r.status === 'core-sdk').length;
  const addonOnlyCount = activeRows.filter((r) => r.status === 'addon-only').length;
  const totalCoveredActiveCount = coreCoveredCount + addonOnlyCount;
  const missingRows = activeRows.filter((r) => r.status === 'missing');
  const missingActiveCount = missingRows.length;

  const activeCoveragePercent =
    activeRows.length > 0 ? Math.round((totalCoveredActiveCount / activeRows.length) * 100) : 0;
  const coreCoveragePercent =
    activeRows.length > 0 ? Math.round((coreCoveredCount / activeRows.length) * 100) : 0;

  const categories: CategoryCoverageStat[] = CATEGORY_ORDER.map((category) => {
    const catRows = rows.filter((r) => r.nip.category === category);
    const catActive = catRows.filter((r) => r.status !== 'legacy');
    const coreCovered = catActive.filter((r) => r.status === 'core-sdk').length;
    const addonOnlyCovered = catActive.filter((r) => r.status === 'addon-only').length;
    const missingCount = catActive.filter((r) => r.status === 'missing').length;
    const legacyCount = catRows.length - catActive.length;
    const coveragePercent =
      catActive.length > 0
        ? Math.round(((coreCovered + addonOnlyCovered) / catActive.length) * 100)
        : 0;

    return {
      category,
      activeTotal: catActive.length,
      coreCovered,
      addonOnlyCovered,
      missingCount,
      legacyCount,
      coveragePercent,
    };
  }).filter((stat) => stat.activeTotal > 0 || stat.legacyCount > 0);

  const modules: ModuleCoverageStat[] = sdkModules.map((mod) => ({
    module: mod,
    coveredNipIds: mod.nips.map((n) => n.toUpperCase()),
    operationCount: operations.filter((op) => op.sdkModuleId === mod.id).length,
  }));

  return {
    totalNips: rows.length,
    activeNips: activeRows.length,
    legacyNips,
    coreCoveredCount,
    addonOnlyCount,
    totalCoveredActiveCount,
    missingActiveCount,
    activeCoveragePercent,
    coreCoveragePercent,
    rows,
    missingRows,
    categories,
    modules,
  };
}
