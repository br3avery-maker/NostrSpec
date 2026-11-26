import type { OperationContract } from '../registry/operations';
import type { SdkModuleManifest, SdkModuleOrigin } from '../sdk/index';
import type { EventKindEntry, NipSummary } from './nipsParser';

export type SearchEntryType = 'nip' | 'kind' | 'sdk' | 'operation';

export interface GlobalSearchEntry {
  uid: string;
  type: SearchEntryType;
  targetId: string;
  title: string;
  subtitle: string;
  meta: string;
  origin?: SdkModuleOrigin;
  primaryText: string;
  secondaryText: string;
  boost: number;
}

export interface RankedSearchResult {
  entry: GlobalSearchEntry;
  score: number;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Bounded Damerau-Levenshtein distance for short typo-tolerant word matching.
 */
function editDistance(a: string, b: string, maxDist = 2): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxDist) return maxDist + 1;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Scores a single query token against a target string using:
 * 1. Exact match (100)
 * 2. Word-boundary / prefix match (78-92)
 * 3. Contiguous substring match (62-75)
 * 4. Typo-tolerant word edit distance <= 2 for tokens >= 4 chars (40-56)
 * 5. Ordered character subsequence match with compactness bonus (22-48)
 */
export function fuzzyTokenScore(token: string, rawTarget: string): number {
  const t = token.toLowerCase().trim();
  if (!t) return 0;

  const targetNorm = normalize(rawTarget);
  if (!targetNorm) return 0;

  if (targetNorm === t) return 100;

  const words = targetNorm.split(' ');
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === t) return i === 0 ? 96 : 90;
    if (w.startsWith(t)) {
      const ratio = t.length / w.length;
      return Math.round(78 + ratio * 14);
    }
  }

  const substrIdx = targetNorm.indexOf(t);
  if (substrIdx !== -1) {
    return substrIdx === 0 ? 84 : Math.max(62, 74 - Math.min(substrIdx, 12));
  }

  // Compact match ignores hyphens/spaces (e.g. "nip01" matches "NIP-01", "kind10002" matches "kind 10002")
  const tCompact = compact(t);
  const targetCompact = compact(rawTarget);
  if (tCompact.length >= 2 && targetCompact.includes(tCompact)) {
    return targetCompact.startsWith(tCompact) ? 80 : 64;
  }

  // Typo-tolerant word match (Levenshtein <= 2 for words >= 4 chars)
  if (tCompact.length >= 4) {
    const maxDist = tCompact.length >= 6 ? 2 : 1;
    let bestDist = maxDist + 1;
    for (const w of words) {
      if (w.length < 3) continue;
      const dist = editDistance(tCompact, w, maxDist);
      if (dist < bestDist) bestDist = dist;
      // Also check prefix slice for partial typo words (e.g. "blosm" vs "blossom")
      if (w.length > tCompact.length + 1) {
        const prefixDist = editDistance(tCompact, w.slice(0, tCompact.length + 1), maxDist);
        if (prefixDist < bestDist) bestDist = prefixDist;
      }
    }
    if (bestDist <= maxDist) {
      return bestDist === 1 ? 56 : 44;
    }
  }

  // Ordered subsequence fuzzy match (e.g. "rlylst" -> "relay list", "gftwrp" -> "gift wrap")
  if (tCompact.length >= 3) {
    let qi = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    let consecutive = 0;
    let maxConsecutive = 0;

    for (let ti = 0; ti < targetCompact.length && qi < tCompact.length; ti++) {
      if (targetCompact[ti] === tCompact[qi]) {
        if (firstMatch === -1) firstMatch = ti;
        if (lastMatch === ti - 1) {
          consecutive += 1;
        } else {
          consecutive = 1;
        }
        if (consecutive > maxConsecutive) maxConsecutive = consecutive;
        lastMatch = ti;
        qi += 1;
      }
    }

    if (qi === tCompact.length) {
      const span = lastMatch - firstMatch + 1;
      const density = tCompact.length / span;
      if (density >= 0.35 || maxConsecutive >= 2) {
        return Math.round(24 + density * 24 + Math.min(maxConsecutive * 2, 8));
      }
    }
  }

  return 0;
}

/**
 * Multi-token fuzzy scorer across primary (title/id) and secondary (summary/symbols/tags) fields.
 */
export function fuzzyMatchEntry(query: string, entry: GlobalSearchEntry): number {
  const tokens = normalize(query)
    .split(' ')
    .filter((tok) => tok.length > 0);
  if (tokens.length === 0) return entry.boost;

  let totalScore = 0;
  for (const token of tokens) {
    const primary = fuzzyTokenScore(token, entry.primaryText);
    const secondary = fuzzyTokenScore(token, entry.secondaryText) * 0.72;
    const best = Math.max(primary, secondary);
    if (best === 0) {
      return 0;
    }
    totalScore += best;
  }

  const average = totalScore / tokens.length;
  // Exact full-phrase bonus
  const fullNorm = normalize(query);
  const phraseBonus =
    normalize(entry.primaryText).includes(fullNorm) && fullNorm.length >= 2 ? 15 : 0;

  return Math.round(average + phraseBonus + entry.boost * 0.08);
}

export function buildGlobalSearchIndex(params: {
  nips: NipSummary[];
  eventKinds: EventKindEntry[];
  sdkModules: SdkModuleManifest[];
  operations: OperationContract[];
}): GlobalSearchEntry[] {
  const entries: GlobalSearchEntry[] = [];
  const sdkOriginById = new Map(params.sdkModules.map((m) => [m.id, m.origin]));

  for (const nip of params.nips) {
    const hasCore = nip.sdkModules.some((id) => sdkOriginById.get(id) === 'nip-contract');
    const hasAddon = nip.sdkModules.some((id) => sdkOriginById.get(id) === 'sdk-extension');
    const coverageLabel = hasCore
      ? hasAddon
        ? 'SDK + Add-On'
        : 'Core SDK'
      : hasAddon
        ? 'SDK Add-On'
        : nip.unrecommended
          ? 'Unrecommended'
          : 'Spec Only';

    entries.push({
      uid: `nip:${nip.id}`,
      type: 'nip',
      targetId: nip.id,
      title: `NIP-${nip.id}: ${nip.title}`,
      subtitle: `${nip.category} · ${coverageLabel}`,
      meta: `NIP-${nip.id}`,
      primaryText: `NIP-${nip.id} NIP${nip.id} ${nip.id} ${nip.title}`,
      secondaryText: `${nip.category} ${nip.sdkModules.join(' ')} ${coverageLabel}`,
      boost: nip.unrecommended ? 10 : hasCore ? 42 : 30,
    });
  }

  for (const kind of params.eventKinds) {
    const nipRefs = kind.nips.map((n) => `NIP-${n.id}`).join(', ');
    entries.push({
      uid: `kind:${kind.kind}:${kind.description}`,
      type: 'kind',
      targetId: kind.kind,
      title: `Kind ${kind.kind} — ${kind.description}`,
      subtitle: `${kind.storageClass} storage${nipRefs ? ` · ${nipRefs}` : ''}`,
      meta: `Kind ${kind.kind}`,
      primaryText: `kind ${kind.kind} ${kind.kind} ${kind.description}`,
      secondaryText: `${kind.storageClass} ${nipRefs}`,
      boost: 25,
    });
  }

  for (const mod of params.sdkModules) {
    const symbolNames = mod.symbols.map((s) => `${s.name} ${s.summary}`).join(' ');
    entries.push({
      uid: `sdk:${mod.id}`,
      type: 'sdk',
      targetId: mod.id,
      title: `${mod.file} — ${mod.title}`,
      subtitle:
        mod.origin === 'sdk-extension'
          ? `SDK Add-On (not official NIP text) · ${mod.nips.map((n) => `NIP-${n}`).join(', ')}`
          : `Official NIP Contract · ${mod.nips.map((n) => `NIP-${n}`).join(', ')}`,
      meta: mod.file,
      origin: mod.origin,
      primaryText: `${mod.file} ${mod.id} ${mod.title}`,
      secondaryText: `${mod.summary} ${symbolNames} ${mod.nips.map((n) => `NIP-${n}`).join(' ')}`,
      boost: mod.origin === 'nip-contract' ? 45 : 38,
    });
  }

  for (const op of params.operations) {
    entries.push({
      uid: `op:${op.id}`,
      type: 'operation',
      targetId: op.id,
      title: op.title,
      subtitle: `${op.breadcrumb.join(' / ')} · ${op.mcpToolName}`,
      meta: op.id,
      origin: op.origin,
      primaryText: `${op.title} ${op.id} ${op.mcpToolName}`,
      secondaryText: `${op.summary} ${op.breadcrumb.join(' ')} ${op.nips.map((n) => `NIP-${n}`).join(' ')} ${op.sdkSymbols.join(' ')}`,
      boost: 36,
    });
  }

  return entries;
}

export function runGlobalSearch(
  entries: GlobalSearchEntry[],
  query: string,
  options?: { typeFilter?: SearchEntryType | 'all'; limit?: number },
): RankedSearchResult[] {
  const typeFilter = options?.typeFilter ?? 'all';
  const limit = options?.limit ?? 24;
  const trimmed = query.trim();

  const pool =
    typeFilter === 'all' ? entries : entries.filter((entry) => entry.type === typeFilter);

  if (!trimmed) {
    // Curated high-signal default jump list when modal opens with empty query
    return [...pool]
      .sort((a, b) => b.boost - a.boost || a.title.localeCompare(b.title))
      .slice(0, Math.min(limit, 12))
      .map((entry) => ({ entry, score: entry.boost }));
  }

  const ranked: RankedSearchResult[] = [];
  for (const entry of pool) {
    const score = fuzzyMatchEntry(trimmed, entry);
    if (score > 0) {
      ranked.push({ entry, score });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  return ranked.slice(0, limit);
}
