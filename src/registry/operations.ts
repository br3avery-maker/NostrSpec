import type { SdkModuleOrigin } from '../sdk/index';

export type TargetLanguage = 'typescript' | 'python' | 'rust' | 'go' | 'csharp' | 'cli' | 'http';

export type CompatibilityState = 'implemented' | 'generated' | 'illustrative';

export interface OperationParameter {
  name: string;
  type: string;
  jsonType: 'string' | 'integer' | 'boolean' | 'array' | 'object';
  itemsType?: 'string' | 'integer' | 'object' | 'array';
  required: boolean;
  description: string;
  example: unknown;
}

export interface OperationReturnField {
  name: string;
  type: string;
  jsonType: 'string' | 'integer' | 'boolean' | 'array' | 'object';
  description: string;
}

export interface OperationError {
  code: string;
  httpStatus: number;
  condition: string;
  recovery: string;
}

export interface ConformanceTestVector {
  id: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export interface OperationContract {
  id: string;
  group: 'Events' | 'Identity' | 'Relays' | 'Delivery & Auth' | 'Storage & Publishing';
  subgroup: string;
  breadcrumb: [string, string, string];
  title: string;
  summary: string;
  origin: SdkModuleOrigin;
  engineeringNote?: string;
  nips: string[];
  eventKinds: number[];
  sdkModuleId: string;
  sdkSymbols: string[];
  playgroundTab: 'signer' | 'nip19' | 'relays' | 'filters' | 'delivery';
  http: {
    method: 'POST' | 'GET';
    path: string;
  };
  cli: {
    command: string;
  };
  mcpToolName: string;
  parameters: OperationParameter[];
  returns: {
    summary: string;
    fields: OperationReturnField[];
  };
  dependencies: string[];
  errors: OperationError[];
  relatedIds: string[];
  examples: {
    typescript: string;
    python: string;
    rust: string;
    go: string;
    csharp: string;
  };
  testVectors: ConformanceTestVector[];
  compatibility: {
    typescript: CompatibilityState;
    openapi: CompatibilityState;
    mcp: CompatibilityState;
    cli: CompatibilityState;
    python: CompatibilityState;
    rust: CompatibilityState;
    go: CompatibilityState;
    csharpUnity: CompatibilityState;
  };
}

export const LANGUAGE_META: Record<
  TargetLanguage,
  {
    label: string;
    codeLanguage: string;
    maturity: CompatibilityState;
    statusNote: string;
  }
> = {
  typescript: {
    label: 'TypeScript',
    codeLanguage: 'typescript',
    maturity: 'implemented',
    statusNote: 'Implemented in @nostrspec/sdk — live verified TypeScript signatures.',
  },
  python: {
    label: 'Python',
    codeLanguage: 'python',
    maturity: 'illustrative',
    statusNote: 'Derived from this operation contract — not a published Python SDK yet.',
  },
  rust: {
    label: 'Rust',
    codeLanguage: 'rust',
    maturity: 'illustrative',
    statusNote: 'Derived from this operation contract — not a published Rust crate yet.',
  },
  go: {
    label: 'Go',
    codeLanguage: 'go',
    maturity: 'illustrative',
    statusNote: 'Derived from this operation contract — not a published Go module yet.',
  },
  csharp: {
    label: 'C#',
    codeLanguage: 'csharp',
    maturity: 'illustrative',
    statusNote: 'Derived from this operation contract (.NET / Unity) — not a published package yet.',
  },
  cli: {
    label: 'CLI',
    codeLanguage: 'bash',
    maturity: 'generated',
    statusNote: 'Generated live from the machine-readable Operation Registry schema.',
  },
  http: {
    label: 'HTTP',
    codeLanguage: 'bash',
    maturity: 'generated',
    statusNote: 'Generated live from the OpenAPI 3.1 operation contract.',
  },
};

export const OPERATION_REGISTRY: OperationContract[] = [
  {
    id: 'events.publish',
    group: 'Events',
    subgroup: 'Publishing',
    breadcrumb: ['Events', 'Publishing', 'Create a note'],
    title: 'Publish an event',
    summary: 'Create, sign, and publish a NIP-01 event to one or more configured relays and inspect per-relay OK acknowledgments.',
    origin: 'nip-contract',
    nips: ['01'],
    eventKinds: [1],
    sdkModuleId: 'nip01',
    sdkSymbols: ['createTextNoteTemplate', 'finalizeEvent', 'RelayPool.publish'],
    playgroundTab: 'signer',
    http: { method: 'POST', path: '/v1/events/publish' },
    cli: { command: 'nostrspec events publish' },
    mcpToolName: 'nostr_publish_event',
    parameters: [
      {
        name: 'kind',
        type: 'Integer',
        jsonType: 'integer',
        required: true,
        description: 'NIP-01 event kind integer (0–65535), e.g. 1 for a short text note.',
        example: 1,
      },
      {
        name: 'content',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Arbitrary UTF-8 string payload for the event.',
        example: 'Hello Nostr!',
      },
      {
        name: 'tags',
        type: 'Array<string[]>',
        jsonType: 'array',
        itemsType: 'array',
        required: false,
        description: 'Ordered array of string arrays; tag order directly affects the SHA-256 event ID.',
        example: [['t', 'nostr']],
      },
      {
        name: 'relays',
        type: 'Array<string>',
        jsonType: 'array',
        itemsType: 'string',
        required: true,
        description: 'Target wss:// relay URLs to transmit the signed EVENT frame to.',
        example: ['wss://relay.damus.io', 'wss://nos.lol'],
      },
    ],
    returns: {
      summary: 'Signed immutable NIP-01 event and per-relay publication results.',
      fields: [
        { name: 'event', type: 'NostrEvent', jsonType: 'object', description: 'Complete signed event containing id, pubkey, created_at, kind, tags, content, and sig.' },
        { name: 'results', type: 'RelayPublishResult[]', jsonType: 'array', description: 'Per-relay outcome with relay URL, accepted boolean, and relay OK message.' },
      ],
    },
    dependencies: ['secp256k1 BIP-340 Schnorr', 'SHA-256', 'WebSocket (wss://)'],
    errors: [
      {
        code: 'INVALID_EVENT_KIND',
        httpStatus: 400,
        condition: 'kind is outside 0–65535 or not an integer.',
        recovery: 'Supply a valid NIP-01 integer kind before signing.',
      },
      {
        code: 'SIGNER_REJECTED',
        httpStatus: 401,
        condition: 'Configured signer refused to sign the template.',
        recovery: 'Surface rejection distinctly to the user without retrying in a loop.',
      },
      {
        code: 'ALL_RELAYS_FAILED',
        httpStatus: 502,
        condition: 'Every target relay timed out, disconnected, or returned OK false.',
        recovery: 'Preserve the signed event ID for bounded retry rather than re-signing a duplicate timestamp.',
      },
    ],
    relatedIds: ['events.sign', 'events.verify', 'events.query', 'delivery.plan'],
    examples: {
      typescript: `import { finalizeEvent, RelayPool, generateSecretKey } from '@nostrspec/sdk';

const secretKey = generateSecretKey();
const evt = finalizeEvent(
  {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['t', 'nostr']],
    content: 'Hello Nostr!',
  },
  secretKey,
);

const pool = new RelayPool();
const results = await pool.publish(['wss://relay.damus.io', 'wss://nos.lol'], evt);
console.log(evt.id, results);
pool.closeAll();`,
      python: `from nostrspec import NostrClient

async with NostrClient(relays=["wss://relay.damus.io", "wss://nos.lol"]) as nostr:
    evt = await nostr.events.create(
        kind=1,
        content="Hello Nostr!",
        tags=[["t", "nostr"]],
    )
    results = await nostr.publish(evt)
    print(evt.id, results)`,
      rust: `use nostrspec::{NostrClient, EventDraft};

let nostr = NostrClient::connect(&["wss://relay.damus.io", "wss://nos.lol"]).await?;
let evt = nostr.events().create(EventDraft {
    kind: 1,
    content: "Hello Nostr!".into(),
    tags: vec![vec!["t".into(), "nostr".into()]],
}).await?;

let results = nostr.publish(&evt).await?;
println!("{} -> {:?}", evt.id, results);`,
      go: `evt, err := nostr.Events.Create(ctx, nostrspec.CreateEventInput{
    Kind:    1,
    Content: "Hello Nostr!",
    Tags:    [][]string{{"t", "nostr"}},
})
if err != nil {
    return err
}

results, err := nostr.Publish(ctx, evt, []string{
    "wss://relay.damus.io",
    "wss://nos.lol",
})`,
      csharp: `var evt = await nostr.Events.CreateAsync(
    kind: 1,
    content: "Hello Nostr!",
    tags: new[] { new[] { "t", "nostr" } }
);

var results = await nostr.PublishAsync(evt);`,
    },
    testVectors: [
      {
        id: 'publish-note-valid',
        title: 'Publish valid kind:1 note',
        description: 'Canonical serialization uses [0, pubkey, created_at, 1, tags, content] and yields a 64-char hex ID and 128-char BIP-340 sig.',
        input: {
          kind: 1,
          content: 'Hello Nostr!',
          tags: [['t', 'nostr']],
          relays: ['wss://relay.damus.io'],
        },
        expected: {
          eventKind: 1,
          storageClass: 'regular',
          idLength: 64,
          sigLength: 128,
        },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'events.sign',
    group: 'Events',
    subgroup: 'Cryptography',
    breadcrumb: ['Events', 'Cryptography', 'Sign event'],
    title: 'Sign an event',
    summary: 'Compute the canonical NIP-01 SHA-256 event ID and BIP-340 Schnorr signature through the active signer boundary without implicitly publishing.',
    origin: 'nip-contract',
    nips: ['01', '07'],
    eventKinds: [0, 1, 3, 7, 30023],
    sdkModuleId: 'signer',
    sdkSymbols: ['LocalKeySigner', 'Nip07BrowserSigner', 'finalizeEvent'],
    playgroundTab: 'signer',
    http: { method: 'POST', path: '/v1/events/sign' },
    cli: { command: 'nostrspec events sign' },
    mcpToolName: 'nostr_sign_event',
    parameters: [
      {
        name: 'kind',
        type: 'Integer',
        jsonType: 'integer',
        required: true,
        description: 'NIP-01 kind number in 0–65535.',
        example: 1,
      },
      {
        name: 'created_at',
        type: 'Integer',
        jsonType: 'integer',
        required: true,
        description: 'Unix timestamp in seconds (never milliseconds).',
        example: 1735689600,
      },
      {
        name: 'tags',
        type: 'Array<string[]>',
        jsonType: 'array',
        itemsType: 'array',
        required: true,
        description: 'Exact ordered array of string tags.',
        example: [],
      },
      {
        name: 'content',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Event content string; lone UTF-16 surrogates are rejected.',
        example: 'Signed via NostrSigner boundary',
      },
    ],
    returns: {
      summary: 'Frozen signed NostrEvent verified against the requested template.',
      fields: [
        { name: 'id', type: 'Hex32', jsonType: 'string', description: '64-char lowercase hex SHA-256 hash of canonical serialization.' },
        { name: 'pubkey', type: 'Hex32', jsonType: 'string', description: '64-char lowercase hex x-only secp256k1 public key.' },
        { name: 'sig', type: 'Hex64', jsonType: 'string', description: '128-char lowercase hex BIP-340 Schnorr signature.' },
      ],
    },
    dependencies: ['secp256k1 BIP-340 Schnorr', 'SHA-256', 'Optional NIP-07 window.nostr'],
    errors: [
      {
        code: 'SIGNER_UNAVAILABLE',
        httpStatus: 400,
        condition: 'No signer is configured or window.nostr is absent on this origin.',
        recovery: 'Fall back to ReadOnlySigner mode and prompt user to connect a signer.',
      },
      {
        code: 'TEMPLATE_TAMPERED_BY_SIGNER',
        httpStatus: 422,
        condition: 'External signer returned an event whose kind, tags, content, or author does not match the requested template.',
        recovery: 'Reject the response immediately and never publish it.',
      },
    ],
    relatedIds: ['events.verify', 'events.publish', 'identity.encode'],
    examples: {
      typescript: `import { Nip07BrowserSigner, LocalKeySigner, generateSecretKey } from '@nostrspec/sdk';

const signer = Nip07BrowserSigner.isAvailable()
  ? new Nip07BrowserSigner()
  : new LocalKeySigner(generateSecretKey());

const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Signed via NostrSigner boundary',
});`,
      python: `signed = await nostr.signer.sign_event({
    "kind": 1,
    "created_at": 1735689600,
    "tags": [],
    "content": "Signed via NostrSigner boundary",
})`,
      rust: `let signed = nostr.signer().sign_event(EventTemplate {
    kind: 1,
    created_at: 1735689600,
    tags: vec![],
    content: "Signed via NostrSigner boundary".into(),
}).await?;`,
      go: `signed, err := nostr.Signer.SignEvent(ctx, nostrspec.EventTemplate{
    Kind:      1,
    CreatedAt: 1735689600,
    Tags:      [][]string{},
    Content:   "Signed via NostrSigner boundary",
})`,
      csharp: `var signed = await nostr.Signer.SignEventAsync(new EventTemplate(
    Kind: 1,
    CreatedAt: 1735689600,
    Tags: Array.Empty<string[]>(),
    Content: "Signed via NostrSigner boundary"
));`,
    },
    testVectors: [
      {
        id: 'sign-timestamp-seconds',
        title: 'Reject millisecond timestamps or lone surrogates',
        description: 'Signing requires integer seconds and valid UTF-8 strings.',
        input: { kind: 1, created_at: 1735689600, tags: [], content: 'hello' },
        expected: { verified: true, immutable: true },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'events.verify',
    group: 'Events',
    subgroup: 'Cryptography',
    breadcrumb: ['Events', 'Cryptography', 'Verify event'],
    title: 'Verify an event',
    summary: 'Reconstruct the 7 canonical NIP-01 fields, recompute the SHA-256 event ID, and verify the BIP-340 Schnorr signature without trusting cached flags.',
    origin: 'nip-contract',
    nips: ['01'],
    eventKinds: [0, 1, 3, 10002, 30023],
    sdkModuleId: 'nip01',
    sdkSymbols: ['verifyEvent', 'getEventHash', 'classifyEventKind'],
    playgroundTab: 'signer',
    http: { method: 'POST', path: '/v1/events/verify' },
    cli: { command: 'nostrspec events verify' },
    mcpToolName: 'nostr_verify_event',
    parameters: [
      {
        name: 'event',
        type: 'NostrEvent',
        jsonType: 'object',
        required: true,
        description: 'Untrusted event JSON object with id, pubkey, created_at, kind, tags, content, and sig.',
        example: {
          id: '0'.repeat(64),
          pubkey: '1'.repeat(64),
          created_at: 1735689600,
          kind: 1,
          tags: [],
          content: 'Hello',
          sig: '2'.repeat(128),
        },
      },
    ],
    returns: {
      summary: 'Cryptographic validity result and NIP-01 storage lifecycle classification.',
      fields: [
        { name: 'valid', type: 'Boolean', jsonType: 'boolean', description: 'True only when structural shape, SHA-256 id, and BIP-340 signature all pass.' },
        { name: 'storageClass', type: 'String', jsonType: 'string', description: 'One of regular, replaceable, ephemeral, or addressable.' },
      ],
    },
    dependencies: ['secp256k1 BIP-340 Schnorr', 'SHA-256'],
    errors: [
      {
        code: 'HASH_MISMATCH',
        httpStatus: 422,
        condition: 'Recomputed SHA-256 over [0, pubkey, created_at, kind, tags, content] does not equal event.id.',
        recovery: 'Discard the event as corrupted or tampered.',
      },
      {
        code: 'INVALID_SIGNATURE',
        httpStatus: 422,
        condition: 'BIP-340 Schnorr verification fails for event.id under event.pubkey.',
        recovery: 'Drop the event before indexing or rendering.',
      },
    ],
    relatedIds: ['events.sign', 'events.publish', 'events.query'],
    examples: {
      typescript: `import { verifyEvent, classifyEventKind } from '@nostrspec/sdk';

const valid = verifyEvent(incomingEvent);
if (!valid) {
  throw new Error('Rejected untrusted event');
}
console.log('Storage class:', classifyEventKind(incomingEvent.kind));`,
      python: `result = nostr.events.verify(incoming_event)
if not result.valid:
    raise ValueError("Rejected untrusted event")`,
      rust: `let valid = nostr.events().verify(&incoming_event)?;
assert!(valid, "Rejected untrusted event");`,
      go: `if ok := nostrspec.VerifyEvent(incomingEvent); !ok {
    return errors.New("rejected untrusted event")
}`,
      csharp: `bool isValid = nostr.Events.Verify(incomingEvent);
if (!isValid) throw new InvalidOperationException("Rejected untrusted event");`,
    },
    testVectors: [
      {
        id: 'verify-tampered-content',
        title: 'Reject mutated content even if id/sig look well-formed',
        description: 'Changing a single character of content invalidates the SHA-256 ID and BIP-340 signature.',
        input: {
          event: {
            id: 'a'.repeat(64),
            pubkey: 'b'.repeat(64),
            created_at: 1735689600,
            kind: 1,
            tags: [],
            content: 'tampered',
            sig: 'c'.repeat(128),
          },
        },
        expected: { valid: false },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'events.query',
    group: 'Events',
    subgroup: 'Querying',
    breadcrumb: ['Events', 'Querying', 'Query events'],
    title: 'Query events from relays',
    summary: 'Fetch bounded stored events matching a NIP-01 filter across relays with client-side filter verification, signature checks, and honest per-relay failure reporting.',
    origin: 'sdk-extension',
    engineeringNote:
      'Uses standard NIP-01 REQ/EVENT/EOSE wire messages, layered with SDK Add-On policies (client-side matchFilter re-verification, maxEvents memory caps, and honest per-relay status reports instead of empty arrays on failure).',
    nips: ['01'],
    eventKinds: [0, 1, 3, 10002, 30023],
    sdkModuleId: 'relay',
    sdkSymbols: ['RelayPool.queryWithReport', 'queryRelayDetailed', 'fetchReplaceableBatch'],
    playgroundTab: 'filters',
    http: { method: 'POST', path: '/v1/events/query' },
    cli: { command: 'nostrspec events query' },
    mcpToolName: 'nostr_query_events',
    parameters: [
      {
        name: 'relays',
        type: 'Array<string>',
        jsonType: 'array',
        itemsType: 'string',
        required: true,
        description: 'Explicit list of wss:// relays to query.',
        example: ['wss://relay.damus.io'],
      },
      {
        name: 'filter',
        type: 'NostrFilter',
        jsonType: 'object',
        required: true,
        description: 'NIP-01 filter object (authors, kinds, ids, since, until, limit, #t/#p/#d tags).',
        example: { kinds: [1], '#t': ['nostr'], limit: 10 },
      },
      {
        name: 'maxEvents',
        type: 'Integer',
        jsonType: 'integer',
        required: false,
        description: 'Hard client-side cap per relay to guard memory against misbehaving relays.',
        example: 50,
      },
    ],
    returns: {
      summary: 'Deduplicated verified events alongside succeeded and failed relay lists.',
      fields: [
        { name: 'events', type: 'NostrEvent[]', jsonType: 'array', description: 'Signature-verified, filter-matched events sorted newest-first.' },
        { name: 'succeededRelays', type: 'string[]', jsonType: 'array', description: 'Relays that completed with EOSE or reached maxEvents cleanly.' },
        { name: 'failedRelays', type: 'string[]', jsonType: 'array', description: 'Relays that timed out, errored, or closed before EOSE.' },
      ],
    },
    dependencies: ['WebSocket (wss://)', 'NIP-01 Filter Evaluator', 'BIP-340 Verifier'],
    errors: [
      {
        code: 'RELAY_TIMEOUT',
        httpStatus: 504,
        condition: 'Relay did not send EOSE within timeoutMs.',
        recovery: 'Inspect failedRelays and show partial/offline state rather than claiming no events exist.',
      },
      {
        code: 'RELAY_CLOSED_SUBSCRIPTION',
        httpStatus: 502,
        condition: 'Relay returned CLOSED (e.g., auth-required or rate-limited).',
        recovery: 'Preserve CLOSED reason and apply bounded backoff.',
      },
    ],
    relatedIds: ['events.verify', 'events.publish', 'relays.parseList'],
    examples: {
      typescript: `import { RelayPool } from '@nostrspec/sdk';

const pool = new RelayPool();
const report = await pool.queryWithReport(
  ['wss://relay.damus.io'],
  { kinds: [1], '#t': ['nostr'], limit: 10 },
  { maxEvents: 50, timeoutMs: 6000 },
);

console.log(report.events.length, report.succeededRelays, report.failedRelays);
pool.closeAll();`,
      python: `report = await nostr.events.query(
    relays=["wss://relay.damus.io"],
    filter={"kinds": [1], "#t": ["nostr"], "limit": 10},
    max_events=50,
)`,
      rust: `let report = nostr.events().query(
    &["wss://relay.damus.io"],
    Filter::new().kinds([1]).hashtag("nostr").limit(10),
).await?;`,
      go: `report, err := nostr.Events.Query(ctx, nostrspec.QueryInput{
    Relays:    []string{"wss://relay.damus.io"},
    Filter:    nostrspec.Filter{Kinds: []int{1}, Limit: 10},
    MaxEvents: 50,
})`,
      csharp: `var report = await nostr.Events.QueryAsync(
    relays: new[] { "wss://relay.damus.io" },
    filter: new NostrFilter { Kinds = new[] { 1 }, Limit = 10 },
    maxEvents: 50
);`,
    },
    testVectors: [
      {
        id: 'query-drops-off-filter-events',
        title: 'Drop relay events that do not match requested filter',
        description: 'Even if a relay sends a valid signed kind:7 event during a kind:1 query, client-side matchFilter drops it.',
        input: { filter: { kinds: [1], limit: 10 }, receivedKinds: [1, 7] },
        expected: { acceptedKinds: [1], droppedCount: 1 },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'identity.encode',
    group: 'Identity',
    subgroup: 'Bech32 & TLV',
    breadcrumb: ['Identity', 'Bech32 & TLV', 'Encode entity'],
    title: 'Encode a NIP-19 entity',
    summary: 'Encode hex public keys, event IDs, or addressable coordinates with optional relay hints into human-shareable Bech32 entities (npub, note, nprofile, nevent, naddr).',
    origin: 'nip-contract',
    nips: ['19', '21'],
    eventKinds: [],
    sdkModuleId: 'nip19',
    sdkSymbols: ['npubEncode', 'nprofileEncode', 'neventEncode', 'naddrEncode'],
    playgroundTab: 'nip19',
    http: { method: 'POST', path: '/v1/identity/encode' },
    cli: { command: 'nostrspec identity encode' },
    mcpToolName: 'nostr_encode_nip19',
    parameters: [
      {
        name: 'type',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Target entity prefix: npub, note, nprofile, nevent, or naddr.',
        example: 'naddr',
      },
      {
        name: 'pubkey',
        type: 'Hex32',
        jsonType: 'string',
        required: true,
        description: '64-character lowercase hex public key.',
        example: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
      },
      {
        name: 'identifier',
        type: 'String',
        jsonType: 'string',
        required: false,
        description: 'Addressable d-tag identifier (required for naddr).',
        example: 'nostr-architecture',
      },
      {
        name: 'kind',
        type: 'Integer',
        jsonType: 'integer',
        required: false,
        description: 'Event kind (required for naddr; optional for nevent).',
        example: 30023,
      },
      {
        name: 'relays',
        type: 'Array<string>',
        jsonType: 'array',
        itemsType: 'string',
        required: false,
        description: 'Optional routing hint relay URLs.',
        example: ['wss://relay.damus.io'],
      },
    ],
    returns: {
      summary: 'Bech32-encoded NIP-19 identifier and NIP-21 nostr: URI.',
      fields: [
        { name: 'bech32', type: 'String', jsonType: 'string', description: 'Checksummed Bech32 string (e.g. naddr1...).' },
        { name: 'uri', type: 'String', jsonType: 'string', description: 'NIP-21 nostr:<bech32> URI.' },
      ],
    },
    dependencies: ['Bech32 (BIP-173)', 'NIP-19 TLV Codec'],
    errors: [
      {
        code: 'INVALID_HEX_KEY',
        httpStatus: 400,
        condition: 'pubkey or event id is not 64 lowercase hex characters.',
        recovery: 'Convert Bech32 keys to lowercase 32-byte hex before encoding.',
      },
    ],
    relatedIds: ['identity.decode', 'events.sign'],
    examples: {
      typescript: `import { naddrEncode } from '@nostrspec/sdk';

const naddr = naddrEncode({
  identifier: 'nostr-architecture',
  pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
  kind: 30023,
  relays: ['wss://relay.damus.io'],
});
console.log(\`nostr:\${naddr}\`);`,
      python: `naddr = nostr.identity.encode_naddr(
    identifier="nostr-architecture",
    pubkey="3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    kind=30023,
    relays=["wss://relay.damus.io"],
)`,
      rust: `let naddr = nostrspec::nip19::naddr_encode(&AddressPointer {
    identifier: "nostr-architecture".into(),
    pubkey: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d".into(),
    kind: 30023,
    relays: vec!["wss://relay.damus.io".into()],
})?;`,
      go: `naddr, err := nostrspec.EncodeNaddr(nostrspec.AddressPointer{
    Identifier: "nostr-architecture",
    Pubkey:     "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    Kind:       30023,
    Relays:     []string{"wss://relay.damus.io"},
})`,
      csharp: `var naddr = nostr.Identity.EncodeAddress(
    identifier: "nostr-architecture",
    pubkey: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    kind: 30023,
    relays: new[] { "wss://relay.damus.io" }
);`,
    },
    testVectors: [
      {
        id: 'encode-npub-fiatjaf',
        title: 'Official NIP-19 npub vector',
        description: 'Encodes standard 32-byte hex pubkey into its canonical Bech32 npub string.',
        input: {
          type: 'npub',
          pubkey: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
        },
        expected: {
          bech32: 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
        },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'identity.decode',
    group: 'Identity',
    subgroup: 'Bech32 & TLV',
    breadcrumb: ['Identity', 'Bech32 & TLV', 'Decode entity'],
    title: 'Decode a NIP-19 entity',
    summary: 'Validate the Bech32 checksum, strip optional nostr: URI prefixes, and decode bare keys or TLV pointers into hex identifiers suitable for NIP-01 filters.',
    origin: 'nip-contract',
    nips: ['19', '21'],
    eventKinds: [],
    sdkModuleId: 'nip19',
    sdkSymbols: ['decode'],
    playgroundTab: 'nip19',
    http: { method: 'POST', path: '/v1/identity/decode' },
    cli: { command: 'nostrspec identity decode' },
    mcpToolName: 'nostr_decode_nip19',
    parameters: [
      {
        name: 'entity',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Bech32 NIP-19 string with or without leading nostr: prefix.',
        example: 'nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
      },
    ],
    returns: {
      summary: 'Typed discriminated union identifying the decoded entity and extracted hex/TLV fields.',
      fields: [
        { name: 'type', type: 'String', jsonType: 'string', description: 'Entity prefix (npub, nsec, note, nprofile, nevent, or naddr).' },
        { name: 'data', type: 'Object | String', jsonType: 'object', description: 'Hex string for bare keys or structured pointer object with relay hints.' },
      ],
    },
    dependencies: ['Bech32 (BIP-173)', 'NIP-19 TLV Codec'],
    errors: [
      {
        code: 'INVALID_CHECKSUM',
        httpStatus: 400,
        condition: 'Bech32 checksum fails or input contains mixed case.',
        recovery: 'Reject the input; never pass raw npub strings into NIP-01 authors filters.',
      },
      {
        code: 'MALFORMED_TLV',
        httpStatus: 400,
        condition: 'TLV stream is truncated, overflows, or omits a required field.',
        recovery: 'Reject truncated TLV payloads instead of partially parsing them.',
      },
    ],
    relatedIds: ['identity.encode', 'events.query'],
    examples: {
      typescript: `import { decode } from '@nostrspec/sdk';

const decoded = decode(
  'nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
);
console.log(decoded.type, decoded.data);`,
      python: `decoded = nostr.identity.decode(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"
)
print(decoded.type, decoded.data)`,
      rust: `let decoded = nostrspec::nip19::decode(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
)?;`,
      go: `decoded, err := nostrspec.DecodeNip19(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
)`,
      csharp: `var decoded = nostr.Identity.Decode(
    "nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"
);`,
    },
    testVectors: [
      {
        id: 'decode-npub-uri',
        title: 'Strip nostr: URI and decode npub to hex',
        description: 'Decodes NIP-21 wrapped npub into its exact 64-char hex pubkey.',
        input: {
          entity: 'nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
        },
        expected: {
          type: 'npub',
          data: '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
        },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'relays.parseList',
    group: 'Relays',
    subgroup: 'Outbox & Metadata',
    breadcrumb: ['Relays', 'Outbox & Metadata', 'Parse relay list'],
    title: 'Parse a NIP-65 relay list',
    summary: 'Extract deduplicated read/write/both relay endpoints from a kind:10002 event while explicitly reporting malformed URLs and unknown role markers.',
    origin: 'nip-contract',
    nips: ['65'],
    eventKinds: [10002],
    sdkModuleId: 'nip65',
    sdkSymbols: ['parseRelayListEvent', 'normalizeRelayUrl', 'createRelayListTemplate'],
    playgroundTab: 'relays',
    http: { method: 'POST', path: '/v1/relays/parse-list' },
    cli: { command: 'nostrspec relays parse-list' },
    mcpToolName: 'nostr_parse_relay_list',
    parameters: [
      {
        name: 'event',
        type: 'NostrEvent (kind:10002)',
        jsonType: 'object',
        required: true,
        description: 'NIP-65 replaceable relay list event containing r tags.',
        example: {
          kind: 10002,
          tags: [
            ['r', 'wss://relay.damus.io'],
            ['r', 'wss://nos.lol', 'write'],
          ],
        },
      },
    ],
    returns: {
      summary: 'Normalized relay endpoints and structured diagnostics for rejected tags.',
      fields: [
        { name: 'endpoints', type: 'RelayEndpoint[]', jsonType: 'array', description: 'Deduplicated valid wss:// endpoints with role (read, write, or both).' },
        { name: 'invalidEntries', type: 'InvalidRelayTag[]', jsonType: 'array', description: 'Tags rejected due to bad scheme, embedded credentials, fragments, or unknown role.' },
      ],
    },
    dependencies: ['WHATWG URL Parser'],
    errors: [
      {
        code: 'WRONG_EVENT_KIND',
        httpStatus: 400,
        condition: 'Input event kind is not 10002.',
        recovery: 'Query kind:10002 events authored by the target pubkey.',
      },
    ],
    relatedIds: ['relays.inspectInfo', 'delivery.plan'],
    examples: {
      typescript: `import { parseRelayListEvent } from '@nostrspec/sdk';

const { endpoints, invalidEntries } = parseRelayListEvent({
  kind: 10002,
  tags: [
    ['r', 'wss://relay.damus.io'],
    ['r', 'wss://nos.lol', 'write'],
  ],
});
console.log(endpoints, invalidEntries);`,
      python: `parsed = nostr.relays.parse_list(relay_list_event)
print(parsed.endpoints, parsed.invalid_entries)`,
      rust: `let parsed = nostrspec::nip65::parse_relay_list(&relay_list_event)?;`,
      go: `parsed, err := nostrspec.ParseRelayList(relayListEvent)`,
      csharp: `var parsed = nostr.Relays.ParseRelayList(relayListEvent);`,
    },
    testVectors: [
      {
        id: 'nip65-reject-invalid-role',
        title: 'Flag unknown role marker instead of treating as both',
        description: 'Rejects ["r", "wss://bad.example", "admin"] into invalidEntries while keeping valid endpoints.',
        input: {
          event: {
            kind: 10002,
            tags: [
              ['r', 'wss://relay.damus.io'],
              ['r', 'wss://bad.example', 'admin'],
            ],
          },
        },
        expected: {
          validCount: 1,
          invalidCount: 1,
        },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'relays.inspectInfo',
    group: 'Relays',
    subgroup: 'Outbox & Metadata',
    breadcrumb: ['Relays', 'Outbox & Metadata', 'Inspect NIP-11'],
    title: 'Inspect relay metadata (NIP-11)',
    summary: 'Fetch a relay’s HTTP information document using Accept: application/nostr+json to discover advertised NIPs, rate limits, and payment policies.',
    origin: 'nip-contract',
    nips: ['11'],
    eventKinds: [],
    sdkModuleId: 'relay',
    sdkSymbols: ['fetchRelayInfo'],
    playgroundTab: 'relays',
    http: { method: 'POST', path: '/api/relay/nip11' },
    cli: { command: 'nostrspec relays inspect' },
    mcpToolName: 'nostr_inspect_relay_nip11',
    parameters: [
      {
        name: 'relayUrl',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Public wss:// or https:// relay endpoint URL (private IPs and loopback are blocked).',
        example: 'wss://relay.damus.io',
      },
    ],
    returns: {
      summary: 'Parsed NIP-11 relay metadata JSON document.',
      fields: [
        { name: 'name', type: 'String', jsonType: 'string', description: 'Human-readable relay name.' },
        { name: 'supported_nips', type: 'Array<integer>', jsonType: 'array', description: 'List of advertised NIP numbers.' },
        { name: 'limitation', type: 'Object', jsonType: 'object', description: 'Optional size, auth_required, payment_required, and rate-limit settings.' },
      ],
    },
    dependencies: ['HTTP(S) Fetch', 'SSRF Public-Host Guard'],
    errors: [
      {
        code: 'PRIVATE_HOST_BLOCKED',
        httpStatus: 400,
        condition: 'relayUrl resolves to loopback, link-local, or RFC-1918 private IP space.',
        recovery: 'Use a public wss:// relay hostname.',
      },
      {
        code: 'UPSTREAM_RELAY_ERROR',
        httpStatus: 502,
        condition: 'Relay did not return valid JSON or exceeded timeout/size cap.',
        recovery: 'Preserve saved user relay configuration; never delete user relays on metadata timeout.',
      },
    ],
    relatedIds: ['relays.parseList', 'events.query'],
    examples: {
      typescript: `import { fetchRelayInfo } from '@nostrspec/sdk';

const info = await fetchRelayInfo('wss://relay.damus.io');
console.log(info.name, info.supported_nips);`,
      python: `info = await nostr.relays.inspect("wss://relay.damus.io")
print(info.name, info.supported_nips)`,
      rust: `let info = nostr.relays().inspect("wss://relay.damus.io").await?;`,
      go: `info, err := nostr.Relays.Inspect(ctx, "wss://relay.damus.io")`,
      csharp: `var info = await nostr.Relays.InspectAsync("wss://relay.damus.io");`,
    },
    testVectors: [
      {
        id: 'nip11-block-private-ip',
        title: 'Block private or loopback relay targets',
        description: 'Server-side NIP-11 proxy rejects 127.0.0.1 and localhost with HTTP 400.',
        input: { relayUrl: 'wss://127.0.0.1:8080' },
        expected: { errorCode: 'PRIVATE_HOST_BLOCKED' },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'auth.createHttpToken',
    group: 'Delivery & Auth',
    subgroup: 'Authorization',
    breadcrumb: ['Delivery & Auth', 'Authorization', 'HTTP Auth'],
    title: 'Create a NIP-98 HTTP Auth header',
    summary: 'Construct and sign a short-lived kind:27235 HTTP authentication event bound to an exact URL, HTTP method, and SHA-256 request payload digest.',
    origin: 'nip-contract',
    nips: ['98'],
    eventKinds: [27235],
    sdkModuleId: 'auth',
    sdkSymbols: ['createNip98AuthTemplate', 'encodeNip98Header'],
    playgroundTab: 'signer',
    http: { method: 'POST', path: '/v1/auth/nip98' },
    cli: { command: 'nostrspec auth nip98' },
    mcpToolName: 'nostr_create_nip98_auth',
    parameters: [
      {
        name: 'url',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Exact absolute request URL including query string.',
        example: 'https://api.example.com/v1/upload',
      },
      {
        name: 'method',
        type: 'String',
        jsonType: 'string',
        required: true,
        description: 'Uppercase HTTP method (GET, POST, PUT, DELETE).',
        example: 'POST',
      },
      {
        name: 'body',
        type: 'String',
        jsonType: 'string',
        required: false,
        description: 'Optional request body hashed into a SHA-256 payload tag.',
        example: '{"hello":"nostr"}',
      },
    ],
    returns: {
      summary: 'Signed kind:27235 event and base64-encoded Authorization header value.',
      fields: [
        { name: 'header', type: 'String', jsonType: 'string', description: 'Nostr <base64-event> value for the HTTP Authorization header.' },
        { name: 'event', type: 'NostrEvent', jsonType: 'object', description: 'Signed ephemeral-style kind:27235 authorization event.' },
      ],
    },
    dependencies: ['SHA-256', 'Base64', 'NostrSigner'],
    errors: [
      {
        code: 'EXPIRED_AUTH_WINDOW',
        httpStatus: 401,
        condition: 'Server rejects token because created_at fell outside its freshness window.',
        recovery: 'Sign NIP-98 tokens immediately before sending the HTTP request.',
      },
    ],
    relatedIds: ['events.sign', 'storage.verifyBlossom'],
    examples: {
      typescript: `import { createNip98AuthTemplate, encodeNip98Header, finalizeEvent, generateSecretKey } from '@nostrspec/sdk';

const template = createNip98AuthTemplate({
  url: 'https://api.example.com/v1/upload',
  method: 'POST',
  body: JSON.stringify({ hello: 'nostr' }),
});
const signed = finalizeEvent(template, generateSecretKey());
const authHeader = encodeNip98Header(signed);`,
      python: `header = await nostr.auth.create_http_header(
    url="https://api.example.com/v1/upload",
    method="POST",
    body='{"hello":"nostr"}',
)`,
      rust: `let header = nostr.auth().create_nip98_header(
    "https://api.example.com/v1/upload",
    "POST",
    Some(br#"{"hello":"nostr"}"#),
).await?;`,
      go: `header, err := nostr.Auth.CreateNip98Header(ctx, nostrspec.Nip98Input{
    URL:    "https://api.example.com/v1/upload",
    Method: "POST",
    Body:   []byte(\`{"hello":"nostr"}\`),
})`,
      csharp: `var header = await nostr.Auth.CreateHttpHeaderAsync(
    url: "https://api.example.com/v1/upload",
    method: "POST",
    body: "{\"hello\":\"nostr\"}"
);`,
    },
    testVectors: [
      {
        id: 'nip98-binds-method-and-url',
        title: 'Include u, method, and payload tags',
        description: 'Kind 27235 template must carry exact u URL, uppercase method, and SHA-256 payload hash when body is present.',
        input: { url: 'https://api.example.com/v1/upload', method: 'POST', body: '{}' },
        expected: { kind: 27235, headerPrefix: 'Nostr ' },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'delivery.plan',
    group: 'Delivery & Auth',
    subgroup: 'Safe Routing',
    breadcrumb: ['Delivery & Auth', 'Safe Routing', 'Plan delivery'],
    title: 'Plan safe relay delivery',
    summary: 'Compute a deterministic, auditable relay delivery plan enforcing caller allowlists, NIP-70 AUTH-before-send gating, and private kind:1059 inbox isolation without touching the network.',
    origin: 'sdk-extension',
    engineeringNote:
      'Combines NIP-65 outbox lists, NIP-17/51 kind:10050 DM inboxes, NIP-42 AUTH, and NIP-70 protected tags with strict caller allowlists and DoS bounds.',
    nips: ['42', '65', '70', '17', '59'],
    eventKinds: [1, 1059, 10002, 10050],
    sdkModuleId: 'delivery',
    sdkSymbols: ['planRelayDelivery', 'executeRelayDelivery', 'publishRelayVerified'],
    playgroundTab: 'delivery',
    http: { method: 'POST', path: '/v1/delivery/plan' },
    cli: { command: 'nostrspec delivery plan' },
    mcpToolName: 'nostr_plan_relay_delivery',
    parameters: [
      {
        name: 'event',
        type: 'NostrEvent',
        jsonType: 'object',
        required: true,
        description: 'Signed event to route; transport-auth kinds (22242, 24242, 27235) are refused.',
        example: { kind: 1, tags: [['-']], content: 'Protected note' },
      },
      {
        name: 'allowedRelays',
        type: 'Array<string>',
        jsonType: 'array',
        itemsType: 'string',
        required: true,
        description: 'Explicit caller-approved relay allowlist; third-party hints outside this list are excluded.',
        example: ['wss://relay.damus.io', 'wss://nos.lol'],
      },
      {
        name: 'signedLists',
        type: 'Array<NostrEvent>',
        jsonType: 'array',
        itemsType: 'object',
        required: false,
        description: 'Signed kind:10002 outbox and kind:10050 DM inbox relay list events.',
        example: [],
      },
      {
        name: 'redundancy',
        type: 'Integer',
        jsonType: 'integer',
        required: false,
        description: 'Target number of positive relay OK acknowledgments.',
        example: 2,
      },
    ],
    returns: {
      summary: 'Pure delivery plan detailing approved targets, excluded untrusted hints, AUTH gates, and safety warnings.',
      fields: [
        { name: 'mode', type: 'String', jsonType: 'string', description: 'public-outbox, private-inbox, protected, or ephemeral.' },
        { name: 'requireAuthBeforeSend', type: 'Boolean', jsonType: 'boolean', description: 'True for NIP-70 protected events carrying ["-"].' },
        { name: 'targets', type: 'PlannedRelayTarget[]', jsonType: 'array', description: 'Approved relay targets annotated with routing source.' },
        { name: 'excluded', type: 'ExcludedRelayTarget[]', jsonType: 'array', description: 'Third-party relay hints blocked by the caller allowlist.' },
        { name: 'warnings', type: 'string[]', jsonType: 'array', description: 'Explicit safety diagnostics (e.g., private inbox missing).' },
      ],
    },
    dependencies: ['NIP-01 Verifier', 'NIP-65 URL Normalizer'],
    errors: [
      {
        code: 'TRANSPORT_AUTH_KIND_FORBIDDEN',
        httpStatus: 400,
        condition: 'Caller attempts to broadcast kind 22242, 24242, or 27235 to general relays.',
        recovery: 'Transmit auth events only on their dedicated challenge or HTTP header channel.',
      },
      {
        code: 'EVENT_SIZE_BOUND_EXCEEDED',
        httpStatus: 413,
        condition: 'Event exceeds 1 MiB content, 4096 tags, or 2 MiB wire frame bound.',
        recovery: 'Reject oversized payloads before running expensive signature checks.',
      },
    ],
    relatedIds: ['events.publish', 'relays.parseList', 'events.verify'],
    examples: {
      typescript: `import { planRelayDelivery } from '@nostrspec/sdk';

const plan = planRelayDelivery(signedEvent, {
  allowedRelays: ['wss://relay.damus.io', 'wss://nos.lol'],
  defaults: ['wss://relay.damus.io'],
  signedLists: [authorRelayListEvent],
  redundancy: 2,
});
console.log(plan.mode, plan.requireAuthBeforeSend, plan.targets, plan.excluded);`,
      python: `plan = nostr.delivery.plan(
    event=signed_event,
    allowed_relays=["wss://relay.damus.io", "wss://nos.lol"],
    signed_lists=[author_relay_list],
    redundancy=2,
)`,
      rust: `let plan = nostr.delivery().plan(&signed_event, DeliveryPolicy {
    allowed_relays: vec!["wss://relay.damus.io".into(), "wss://nos.lol".into()],
    redundancy: 2,
    ..Default::default()
})?;`,
      go: `plan, err := nostr.Delivery.Plan(signedEvent, nostrspec.DeliveryPolicy{
    AllowedRelays: []string{"wss://relay.damus.io", "wss://nos.lol"},
    Redundancy:    2,
})`,
      csharp: `var plan = nostr.Delivery.Plan(
    signedEvent,
    allowedRelays: new[] { "wss://relay.damus.io", "wss://nos.lol" },
    redundancy: 2
);`,
    },
    testVectors: [
      {
        id: 'delivery-giftwrap-no-widening',
        title: 'Never widen kind:1059 gift wrap to public default relays',
        description: 'When no verified kind:10050 inbox exists for the recipient, targets is empty and a warning is emitted instead of leaking to public defaults.',
        input: { kind: 1059, hasVerifiedKind10050: false, defaults: ['wss://relay.damus.io'] },
        expected: { mode: 'private-inbox', targetCount: 0, widenedToDefaults: false },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'storage.verifyBlossom',
    group: 'Storage & Publishing',
    subgroup: 'Blossom Media',
    breadcrumb: ['Storage & Publishing', 'Blossom Media', 'Verify replicas'],
    title: 'Verify Blossom blob replicas',
    summary: 'Validate 1–16 HTTPS Blossom servers, stream downloaded bytes under a strict size cap, verify exact SHA-256 digests, and produce NIP-92 imeta tags.',
    origin: 'sdk-extension',
    engineeringNote:
      'Layers strict HTTPS host validation, redirect/credential hardening, streaming byte caps, and NIP-92 imeta construction on top of NIP-B7 / Blossom.',
    nips: ['B7', '92'],
    eventKinds: [24242, 10063],
    sdkModuleId: 'blossom',
    sdkSymbols: ['normalizeBlossomServers', 'preflightBlossomServer', 'verifyBlossomReplicas', 'buildImetaTag'],
    playgroundTab: 'signer',
    http: { method: 'POST', path: '/v1/storage/blossom/verify' },
    cli: { command: 'nostrspec blossom verify' },
    mcpToolName: 'nostr_verify_blossom_replicas',
    parameters: [
      {
        name: 'servers',
        type: 'Array<string>',
        jsonType: 'array',
        itemsType: 'string',
        required: true,
        description: '1–16 public HTTPS Blossom server base URLs (no IP literals or .local hosts).',
        example: ['https://blossom.example.com'],
      },
      {
        name: 'sha256',
        type: 'Hex32',
        jsonType: 'string',
        required: true,
        description: 'Expected 64-character lowercase hex SHA-256 hash of the blob.',
        example: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      },
      {
        name: 'size',
        type: 'Integer',
        jsonType: 'integer',
        required: true,
        description: 'Expected exact byte size used to bound streaming downloads.',
        example: 5,
      },
      {
        name: 'mimeType',
        type: 'String',
        jsonType: 'string',
        required: false,
        description: 'Expected media MIME type (normalizes text/javascript and application/javascript).',
        example: 'text/plain',
      },
    ],
    returns: {
      summary: 'Per-server integrity verification reports and optional NIP-92 imeta tag.',
      fields: [
        { name: 'checks', type: 'BlossomReplicaVerification[]', jsonType: 'array', description: 'Per-server verified boolean, observed size, observed SHA-256, and error reason.' },
        { name: 'imeta', type: 'string[]', jsonType: 'array', description: 'NIP-92 imeta tag array built from verified blob metadata.' },
      ],
    },
    dependencies: ['SHA-256', 'Fetch ReadableStream'],
    errors: [
      {
        code: 'INVALID_BLOSSOM_ORIGIN',
        httpStatus: 400,
        condition: 'Server URL is not HTTPS, contains credentials, or targets an IP literal / private domain.',
        recovery: 'Supply explicit public HTTPS Blossom origins.',
      },
      {
        code: 'DIGEST_OR_SIZE_MISMATCH',
        httpStatus: 422,
        condition: 'Streamed bytes exceeded expected size or hashed to a different SHA-256.',
        recovery: 'Abort stream immediately and mirror to a healthy Blossom server.',
      },
    ],
    relatedIds: ['nsite.planRelease', 'auth.createHttpToken'],
    examples: {
      typescript: `import { computeBlobSha256, verifyBlossomReplicas, buildImetaTag } from '@nostrspec/sdk';

const bytes = new TextEncoder().encode('hello');
const sha256 = computeBlobSha256(bytes);

const checks = await verifyBlossomReplicas(
  ['https://blossom.example.com'],
  { sha256, size: bytes.byteLength, type: 'text/plain' },
);
const imeta = buildImetaTag({
  url: \`https://blossom.example.com/\${sha256}\`,
  sha256,
  mimeType: 'text/plain',
  size: bytes.byteLength,
});`,
      python: `checks = await nostr.storage.verify_blossom_replicas(
    servers=["https://blossom.example.com"],
    sha256=blob_hash,
    size=len(data),
    mime_type="text/plain",
)`,
      rust: `let checks = nostr.storage().verify_blossom_replicas(
    &["https://blossom.example.com"],
    &BlobDescriptor { sha256, size, mime_type: Some("text/plain".into()) },
).await?;`,
      go: `checks, err := nostr.Storage.VerifyBlossomReplicas(ctx, servers, descriptor)`,
      csharp: `var checks = await nostr.Storage.VerifyBlossomReplicasAsync(
    servers: new[] { "https://blossom.example.com" },
    expected: new BlobDescriptor(sha256, size, "text/plain")
);`,
    },
    testVectors: [
      {
        id: 'blossom-reject-ip-literal',
        title: 'Reject IP literals and insecure HTTP origins',
        description: 'normalizeBlossomServers rejects http:// and raw IP hosts before any network call.',
        input: { servers: ['https://192.168.1.5'] },
        expected: { errorCode: 'INVALID_BLOSSOM_ORIGIN' },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
  {
    id: 'nsite.planRelease',
    group: 'Storage & Publishing',
    subgroup: 'Static Sites',
    breadcrumb: ['Storage & Publishing', 'Static Sites', 'Plan Nsite release'],
    title: 'Plan a resumable NIP-5A Nsite release',
    summary: 'Normalize static site paths with traversal protection, hash every asset, skip already-uploaded Blossom blobs, and prepare an unsigned kind:15128 or kind:35128 manifest.',
    origin: 'sdk-extension',
    engineeringNote:
      'Adds POSIX path traversal guards, resumable SHA-256 diffing against existing Blossom hashes, and post-sign manifest verification on top of NIP-5A.',
    nips: ['5A', 'B7'],
    eventKinds: [15128, 35128],
    sdkModuleId: 'nsite',
    sdkSymbols: ['planNsiteRelease', 'normalizeNsitePath', 'verifySignedNsiteManifest'],
    playgroundTab: 'delivery',
    http: { method: 'POST', path: '/v1/nsite/plan' },
    cli: { command: 'nostrspec nsite plan' },
    mcpToolName: 'nostr_plan_nsite_release',
    parameters: [
      {
        name: 'files',
        type: 'Record<string, Bytes>',
        jsonType: 'object',
        required: true,
        description: 'Map of relative site paths (e.g. /index.html) to file contents.',
        example: { '/index.html': '<h1>Hello Nsite</h1>' },
      },
      {
        name: 'siteName',
        type: 'String',
        jsonType: 'string',
        required: false,
        description: 'Optional d-tag site name; omit for root site (kind:15128) or set for named site (kind:35128).',
        example: 'zine',
      },
      {
        name: 'existingHashes',
        type: 'Array<Hex32>',
        jsonType: 'array',
        itemsType: 'string',
        required: false,
        description: 'SHA-256 hashes already verified on target Blossom servers to skip re-uploading.',
        example: [],
      },
    ],
    returns: {
      summary: 'Deterministic release plan with upload diff and unsigned NIP-5A manifest template.',
      fields: [
        { name: 'kind', type: 'Integer', jsonType: 'integer', description: '15128 for root site or 35128 for named addressable site.' },
        { name: 'toUpload', type: 'NsitePlannedFile[]', jsonType: 'array', description: 'Only files whose SHA-256 is absent from existingHashes.' },
        { name: 'skipped', type: 'NsitePlannedFile[]', jsonType: 'array', description: 'Unchanged files skipped for resumable deploys.' },
        { name: 'manifestTemplate', type: 'EventTemplate', jsonType: 'object', description: 'Unsigned NIP-5A event template ready for NostrSigner.' },
      ],
    },
    dependencies: ['SHA-256', 'POSIX Path Normalizer'],
    errors: [
      {
        code: 'PATH_TRAVERSAL_BLOCKED',
        httpStatus: 400,
        condition: 'Asset path contains .. segments, null bytes, or control characters.',
        recovery: 'Normalize static build output paths inside the site root.',
      },
    ],
    relatedIds: ['storage.verifyBlossom', 'events.sign', 'delivery.plan'],
    examples: {
      typescript: `import { planNsiteRelease, verifySignedNsiteManifest, finalizeEvent, generateSecretKey } from '@nostrspec/sdk';

const plan = planNsiteRelease(
  {
    '/index.html': new TextEncoder().encode('<h1>Hello Nsite</h1>'),
    '/app.js': new TextEncoder().encode('console.log("ready")'),
  },
  { siteName: 'zine', existingHashes: [] },
);

const signed = finalizeEvent(plan.manifestTemplate, generateSecretKey());
console.log('Valid manifest:', verifySignedNsiteManifest(signed, plan, signed.pubkey));`,
      python: `plan = nostr.nsite.plan_release(
    files={"/index.html": b"<h1>Hello Nsite</h1>"},
    site_name="zine",
    existing_hashes=[],
)`,
      rust: `let plan = nostr.nsite().plan_release(files, NsiteOptions {
    site_name: Some("zine".into()),
    existing_hashes: vec![],
})?;`,
      go: `plan, err := nostr.Nsite.PlanRelease(files, nostrspec.NsiteOptions{
    SiteName: "zine",
})`,
      csharp: `var plan = nostr.Nsite.PlanRelease(
    files: new Dictionary<string, byte[]> { ["/index.html"] = htmlBytes },
    siteName: "zine"
);`,
    },
    testVectors: [
      {
        id: 'nsite-block-traversal',
        title: 'Block ../ path traversal in static asset maps',
        description: 'Paths containing parent traversal segments throw before hashing or manifest assembly.',
        input: { path: '/../etc/passwd' },
        expected: { errorCode: 'PATH_TRAVERSAL_BLOCKED' },
      },
    ],
    compatibility: {
      typescript: 'implemented',
      openapi: 'generated',
      mcp: 'generated',
      cli: 'generated',
      python: 'illustrative',
      rust: 'illustrative',
      go: 'illustrative',
      csharpUnity: 'illustrative',
    },
  },
];

export const OPERATION_GROUPS: Array<OperationContract['group']> = [
  'Events',
  'Identity',
  'Relays',
  'Delivery & Auth',
  'Storage & Publishing',
];
