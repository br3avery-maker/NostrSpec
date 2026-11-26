import assert from 'node:assert/strict';
import test from 'node:test';
import { OPERATION_REGISTRY } from '../registry/operations';
import { SDK_MODULE_MANIFEST } from '../sdk/index';
import { buildCompatibilityReport } from './compatibilityMatrix';
import { buildGlobalSearchIndex, fuzzyTokenScore, runGlobalSearch } from './globalSearch';
import type { EventKindEntry, NipSummary } from './nipsParser';

const SAMPLE_NIPS: NipSummary[] = [
  {
    id: '01',
    file: '01.md',
    title: 'Basic protocol flow description',
    category: 'Core Protocol',
    unrecommended: false,
    sdkModules: ['nip01', 'relay', 'signer'],
    githubUrl: 'https://github.com/nostr-protocol/nips/blob/master/01.md',
  },
  {
    id: '04',
    file: '04.md',
    title: 'Encrypted Direct Message',
    category: 'Messaging & Privacy',
    unrecommended: true,
    unrecommendedReason: 'Superseded by NIP-17',
    sdkModules: [],
    githubUrl: 'https://github.com/nostr-protocol/nips/blob/master/04.md',
  },
  {
    id: '57',
    file: '57.md',
    title: 'Lightning Zaps',
    category: 'Payments & Zaps',
    unrecommended: false,
    sdkModules: [],
    githubUrl: 'https://github.com/nostr-protocol/nips/blob/master/57.md',
  },
  {
    id: '65',
    file: '65.md',
    title: 'Relay List Metadata',
    category: 'Relays & Sync',
    unrecommended: false,
    sdkModules: ['nip65', 'delivery'],
    githubUrl: 'https://github.com/nostr-protocol/nips/blob/master/65.md',
  },
  {
    id: '70',
    file: '70.md',
    title: 'Protected Events',
    category: 'Core Protocol',
    unrecommended: false,
    sdkModules: ['delivery'],
    githubUrl: 'https://github.com/nostr-protocol/nips/blob/master/70.md',
  },
  {
    id: 'B7',
    file: 'B7.md',
    title: 'Blossom',
    category: 'Media & Storage',
    unrecommended: false,
    sdkModules: ['auth', 'blossom'],
    githubUrl: 'https://github.com/nostr-protocol/nips/blob/master/B7.md',
  },
];

const SAMPLE_KINDS: EventKindEntry[] = [
  {
    kind: '10002',
    numericKind: 10002,
    description: 'Relay List Metadata',
    storageClass: 'replaceable',
    deprecated: false,
    nips: [{ id: '65', label: 'NIP-65' }],
  },
  {
    kind: '30023',
    numericKind: 30023,
    description: 'Long-form Content',
    storageClass: 'addressable',
    deprecated: false,
    nips: [{ id: '23', label: 'NIP-23' }],
  },
];

test('fuzzyTokenScore ranks exact/prefix matches above typo and subsequence matches', () => {
  const exact = fuzzyTokenScore('blossom', 'Blossom');
  const prefix = fuzzyTokenScore('bloss', 'Blossom');
  const typo = fuzzyTokenScore('blosm', 'Blossom');
  const subseq = fuzzyTokenScore('rlylst', 'Relay List Metadata');
  const miss = fuzzyTokenScore('zzzzz', 'Relay List Metadata');

  assert.equal(exact, 100);
  assert.ok(prefix > typo, `Expected prefix (${prefix}) > typo (${typo})`);
  assert.ok(typo > 0, 'Expected typo "blosm" to match "Blossom"');
  assert.ok(subseq > 0, 'Expected subsequence "rlylst" to match "Relay List Metadata"');
  assert.equal(miss, 0);
});

test('runGlobalSearch finds NIPs, event kinds, SDK symbols, and operations with fuzzy queries', () => {
  const index = buildGlobalSearchIndex({
    nips: SAMPLE_NIPS,
    eventKinds: SAMPLE_KINDS,
    sdkModules: SDK_MODULE_MANIFEST,
    operations: OPERATION_REGISTRY,
  });

  // Kind numeric lookup
  const kindResults = runGlobalSearch(index, '30023');
  assert.ok(kindResults.some((r) => r.entry.type === 'kind' && r.entry.targetId === '30023'));

  // Typo-tolerant NIP + SDK lookup
  const blossomResults = runGlobalSearch(index, 'blosm');
  assert.ok(blossomResults.some((r) => r.entry.type === 'nip' && r.entry.targetId === 'B7'));
  assert.ok(blossomResults.some((r) => r.entry.type === 'sdk' && r.entry.targetId === 'blossom'));

  // Symbol-level SDK doc search
  const symbolResults = runGlobalSearch(index, 'planRelayDelivery');
  assert.ok(symbolResults.some((r) => r.entry.type === 'sdk' && r.entry.targetId === 'delivery'));

  // Type filter narrows cleanly
  const nipOnly = runGlobalSearch(index, 'protected', { typeFilter: 'nip' });
  assert.ok(nipOnly.length > 0);
  assert.ok(nipOnly.every((r) => r.entry.type === 'nip'));
  assert.equal(nipOnly[0].entry.targetId, '70');

  // Empty query returns curated quick-jump entries
  const defaults = runGlobalSearch(index, '');
  assert.ok(defaults.length > 0);
});

test('buildCompatibilityReport separates core NIP contracts, add-on-only coverage, missing NIPs, and legacy NIPs', () => {
  const report = buildCompatibilityReport(SAMPLE_NIPS, SDK_MODULE_MANIFEST, OPERATION_REGISTRY);

  assert.equal(report.totalNips, 6);
  assert.equal(report.activeNips, 5);
  assert.equal(report.legacyNips, 1);

  // NIP-01 (core), NIP-65 (core + add-on), NIP-B7 (core auth + add-on blossom) => 3 core-sdk
  assert.equal(report.coreCoveredCount, 3);
  // NIP-70 (delivery add-on only) => 1 addon-only
  assert.equal(report.addonOnlyCount, 1);
  // NIP-57 (Lightning Zaps) => 1 missing active NIP
  assert.equal(report.missingActiveCount, 1);
  assert.equal(report.missingRows[0].nip.id, '57');
  assert.equal(report.activeCoveragePercent, 80); // 4 of 5 active NIPs covered
  assert.equal(report.coreCoveragePercent, 60); // 3 of 5 active NIPs covered by core modules

  const nip70 = report.rows.find((r) => r.nip.id === '70')!;
  assert.equal(nip70.status, 'addon-only');
  assert.deepEqual(nip70.coreModules, []);
  assert.deepEqual(nip70.addonModules, ['delivery']);

  const nip57 = report.rows.find((r) => r.nip.id === '57')!;
  assert.equal(nip57.status, 'missing');
  assert.ok(
    nip57.roadmapBridges.length > 0,
    'Expected NIP-57 gap to cross-link to Ecosystem Bridges roadmap',
  );
});
