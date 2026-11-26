import assert from 'node:assert/strict';
import test from 'node:test';
import { SDK_MODULE_MANIFEST, decode, finalizeEvent, generateSecretKey, parseRelayListEvent, planRelayDelivery, verifyEvent } from '../sdk/index';
import {
  generateCliInvocation,
  generateConformanceSuite,
  generateHttpRequestExample,
  generateMcpToolsManifest,
  generateOpenApiSpec,
  generateTypeScriptInterface,
} from './generators';
import { OPERATION_REGISTRY } from './operations';

test('OPERATION_REGISTRY enforces unique IDs, valid cross-references, and explicit add-on notes', () => {
  const ids = new Set<string>();
  const sdkModuleIds = new Set(SDK_MODULE_MANIFEST.map((m) => m.id));
  const mcpNames = new Set<string>();

  assert.ok(OPERATION_REGISTRY.length >= 10, 'Expected at least 10 documented operations');

  for (const op of OPERATION_REGISTRY) {
    assert.ok(!ids.has(op.id), `Duplicate operation ID: ${op.id}`);
    ids.add(op.id);

    assert.ok(!mcpNames.has(op.mcpToolName), `Duplicate MCP tool name: ${op.mcpToolName}`);
    mcpNames.add(op.mcpToolName);

    assert.ok(sdkModuleIds.has(op.sdkModuleId), `Unknown sdkModuleId ${op.sdkModuleId} in ${op.id}`);
    assert.ok(op.parameters.length > 0, `Operation ${op.id} must define parameters`);
    assert.ok(op.returns.fields.length > 0, `Operation ${op.id} must define return fields`);
    assert.ok(op.errors.length > 0, `Operation ${op.id} must define error conditions`);
    assert.ok(op.testVectors.length > 0, `Operation ${op.id} must define conformance test vectors`);

    for (const lang of ['typescript', 'python', 'rust', 'go', 'csharp'] as const) {
      assert.ok(op.examples[lang].trim().length > 10, `Missing ${lang} example in ${op.id}`);
    }

    if (op.origin === 'sdk-extension') {
      assert.ok(
        typeof op.engineeringNote === 'string' && op.engineeringNote.length > 20,
        `SDK extension operation ${op.id} must include an explicit engineeringNote`,
      );
    }
  }

  for (const op of OPERATION_REGISTRY) {
    for (const rel of op.relatedIds) {
      assert.ok(ids.has(rel), `Operation ${op.id} references missing relatedId ${rel}`);
    }
  }
});

test('generateOpenApiSpec produces a valid OpenAPI 3.1.0 document covering every operation', () => {
  const spec = generateOpenApiSpec(OPERATION_REGISTRY) as {
    openapi: string;
    paths: Record<string, Record<string, { operationId: string; requestBody?: { content: { 'application/json': { schema: { required: string[] } } } } }>>;
  };

  assert.equal(spec.openapi, '3.1.0');

  for (const op of OPERATION_REGISTRY) {
    const pathItem = spec.paths[op.http.path];
    assert.ok(pathItem, `Missing OpenAPI path ${op.http.path}`);
    const methodObj = pathItem[op.http.method.toLowerCase()];
    assert.ok(methodObj, `Missing method ${op.http.method} on ${op.http.path}`);
    assert.equal(methodObj.operationId, op.id);

    const expectedRequired = op.parameters.filter((p) => p.required).map((p) => p.name);
    assert.deepEqual(
      methodObj.requestBody?.content['application/json'].schema.required,
      expectedRequired,
    );
  }
});

test('generateMcpToolsManifest, CLI, HTTP, TypeScript interfaces, and conformance suite stay in sync', () => {
  const mcp = generateMcpToolsManifest(OPERATION_REGISTRY);
  assert.equal(mcp.tools.length, OPERATION_REGISTRY.length);
  assert.equal(mcp.tools[0].name, OPERATION_REGISTRY[0].mcpToolName);

  const publishOp = OPERATION_REGISTRY.find((o) => o.id === 'events.publish')!;
  const cli = generateCliInvocation(publishOp);
  assert.ok(cli.startsWith('nostrspec events publish'));
  assert.ok(cli.includes('--kind 1'));
  assert.ok(cli.includes('--content "Hello Nostr!"'));

  const http = generateHttpRequestExample(publishOp);
  assert.ok(http.includes('POST "https://api.nostrspec.example/v1/events/publish"'));

  const tsIface = generateTypeScriptInterface(publishOp);
  assert.ok(tsIface.includes('export interface EventsPublishInput'));
  assert.ok(tsIface.includes('export interface EventsPublishOutput'));

  const suite = generateConformanceSuite(OPERATION_REGISTRY);
  assert.equal(suite.operations.length, OPERATION_REGISTRY.length);
  assert.ok(suite.vectorCount >= OPERATION_REGISTRY.length);
});

test('live @nostrspec/sdk execution matches shared conformance vectors from OPERATION_REGISTRY', () => {
  // 1. identity.decode vector
  const decodeOp = OPERATION_REGISTRY.find((o) => o.id === 'identity.decode')!;
  const decodeVec = decodeOp.testVectors[0];
  const decoded = decode(String(decodeVec.input.entity));
  assert.equal(decoded.type, decodeVec.expected.type);
  assert.equal(decoded.data, decodeVec.expected.data);

  // 2. relays.parseList vector
  const parseOp = OPERATION_REGISTRY.find((o) => o.id === 'relays.parseList')!;
  const parseVec = parseOp.testVectors[0];
  const parsed = parseRelayListEvent(parseVec.input.event as { kind: number; tags: string[][] });
  assert.equal(parsed.endpoints.length, parseVec.expected.validCount);
  assert.equal(parsed.invalidEntries.length, parseVec.expected.invalidCount);

  // 3. events.verify tampered vector
  const verifyOp = OPERATION_REGISTRY.find((o) => o.id === 'events.verify')!;
  const verifyVec = verifyOp.testVectors[0];
  assert.equal(verifyEvent(verifyVec.input.event as never), verifyVec.expected.valid);

  // 4. delivery.plan gift-wrap non-widening invariant
  const deliveryOp = OPERATION_REGISTRY.find((o) => o.id === 'delivery.plan')!;
  const deliveryVec = deliveryOp.testVectors[0];
  const sk = generateSecretKey();
  const giftWrap = finalizeEvent(
    {
      kind: Number(deliveryVec.input.kind),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', '1'.repeat(64)]],
      content: 'ciphertext',
    },
    sk,
  );
  const plan = planRelayDelivery(giftWrap, {
    allowedRelays: ['wss://relay.damus.io'],
    defaults: deliveryVec.input.defaults as string[],
    signedLists: [],
  });
  assert.equal(plan.mode, deliveryVec.expected.mode);
  assert.equal(plan.targets.length, deliveryVec.expected.targetCount);
});
