import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECOSYSTEM_BRIDGES,
  exportRoadmapAsMarkdown,
  ROADMAP_PHASES,
  STRATEGIC_COMBINATIONS,
  WORKFLOW_STAGES,
} from './roadmapData';

test('roadmapData contains all 4 workflow stages, 6 phases (0..5), and 12 bridges', () => {
  assert.equal(WORKFLOW_STAGES.length, 4);
  assert.equal(ROADMAP_PHASES.length, 6);
  assert.deepEqual(
    ROADMAP_PHASES.map((p) => p.number),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(ECOSYSTEM_BRIDGES.length, 12);
  assert.equal(
    ECOSYSTEM_BRIDGES.filter((b) => b.tier === 'core').length,
    5,
  );
  assert.equal(
    ECOSYSTEM_BRIDGES.filter((b) => b.tier === 'extended').length,
    7,
  );
  assert.equal(STRATEGIC_COMBINATIONS.length, 3);
});

test('all NIP references across phases and bridges use valid 2-character official NIP IDs', () => {
  const validId = /^[0-9A-Z]{2}$/;
  for (const phase of ROADMAP_PHASES) {
    for (const id of phase.nips) {
      assert.match(id, validId, `Invalid phase NIP ID: ${id}`);
    }
  }
  for (const bridge of ECOSYSTEM_BRIDGES) {
    for (const id of bridge.nips) {
      assert.match(id, validId, `Invalid bridge NIP ID: ${id}`);
    }
  }
});

test('exportRoadmapAsMarkdown renders every phase and all 12 bridges cleanly', () => {
  const md = exportRoadmapAsMarkdown();
  assert.match(md, /Phase 0: Protocol Foundation/);
  assert.match(md, /Phase 5: Plain-English Intent-to-Blueprint Composer/);
  assert.match(md, /Bridge 1:/);
  assert.match(md, /Bridge 12:/);
  assert.match(md, /M1\.1 — Deterministic Protocol Automators/);
});
