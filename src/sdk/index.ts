export * from './types';
export * from './nip01';
export * from './nip19';
export * from './nip65';
export * from './auth';
export * from './builders';
export * from './signer';
export * from './relay';
export * from './delivery';
export * from './blossom';
export * from './nsite';

export type SdkModuleOrigin = 'nip-contract' | 'sdk-extension';

export interface SdkSymbolDoc {
  name: string;
  kind: 'function' | 'class' | 'type';
  signature: string;
  summary: string;
  nips: string[];
}

export interface SdkModuleManifest {
  id: string;
  file: string;
  title: string;
  origin: SdkModuleOrigin;
  engineeringNote?: string;
  nips: string[];
  summary: string;
  exampleCode: string;
  symbols: SdkSymbolDoc[];
}

export const SDK_MODULE_MANIFEST: SdkModuleManifest[] = [
  {
    id: 'nip01',
    file: 'nip01.ts',
    title: 'Core Events, Cryptography & Filters',
    origin: 'nip-contract',
    nips: ['01'],
    summary:
      'Canonical UTF-8 event serialization, SHA-256 ID computation, BIP-340 Schnorr signing & verification, storage lifecycle classification, replaceable conflict resolution, and NIP-01 filter evaluation.',
    exampleCode: `import { generateSecretKey, finalizeEvent, verifyEvent, classifyEventKind } from './sdk';

const sk = generateSecretKey();
const event = finalizeEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['t', 'nostr']],
  content: 'Hello from the NostrSpec TypeScript SDK',
}, sk);

console.log('Valid BIP-340 signature:', verifyEvent(event));
console.log('Storage class:', classifyEventKind(event.kind)); // "regular"`,
    symbols: [
      {
        name: 'generateSecretKey',
        kind: 'function',
        signature: 'generateSecretKey(): Uint8Array',
        summary: 'Generates a cryptographically random 32-byte secp256k1 secret key.',
        nips: ['01'],
      },
      {
        name: 'getPublicKey',
        kind: 'function',
        signature: 'getPublicKey(secretKey: Uint8Array | string): Hex32',
        summary: 'Derives the 64-char lowercase hex x-only BIP-340 public key.',
        nips: ['01'],
      },
      {
        name: 'serializeEvent',
        kind: 'function',
        signature: 'serializeEvent(event: UnsignedEvent): string',
        summary: 'Serializes [0, pubkey, created_at, kind, tags, content] with strict UTF-8 surrogate checks.',
        nips: ['01'],
      },
      {
        name: 'getEventHash',
        kind: 'function',
        signature: 'getEventHash(event: UnsignedEvent): Hex32',
        summary: 'Computes the SHA-256 event ID over the canonical NIP-01 JSON array.',
        nips: ['01'],
      },
      {
        name: 'finalizeEvent',
        kind: 'function',
        signature: 'finalizeEvent(template: EventTemplate, secretKey: Uint8Array | string): Readonly<NostrEvent>',
        summary: 'Populates pubkey, SHA-256 id, and BIP-340 Schnorr signature; freezes the result.',
        nips: ['01'],
      },
      {
        name: 'verifyEvent',
        kind: 'function',
        signature: 'verifyEvent(event: NostrEvent): boolean',
        summary: 'Reconstructs the 7 canonical fields and verifies both SHA-256 hash and BIP-340 signature.',
        nips: ['01'],
      },
      {
        name: 'classifyEventKind',
        kind: 'function',
        signature: 'classifyEventKind(kind: number): EventStorageClass',
        summary: 'Returns "regular", "replaceable", "ephemeral", or "addressable" per NIP-01.',
        nips: ['01'],
      },
      {
        name: 'resolveReplaceableEvent',
        kind: 'function',
        signature: 'resolveReplaceableEvent(current: NostrEvent, incoming: NostrEvent): NostrEvent',
        summary: 'Selects the winning replaceable/addressable event (newer timestamp, lowest ID on tie).',
        nips: ['01'],
      },
      {
        name: 'matchFilter / matchFilters',
        kind: 'function',
        signature: 'matchFilters(filters: NostrFilter[], event: NostrEvent): boolean',
        summary: 'Evaluates NIP-01 filter rules (AND across fields, OR across array values and filters).',
        nips: ['01'],
      },
    ],
  },
  {
    id: 'nip19',
    file: 'nip19.ts',
    title: 'Bech32 Entities & TLV Codec',
    origin: 'nip-contract',
    nips: ['19', '21'],
    summary:
      'Encodes and decodes bare keys (npub, nsec, note) and TLV-structured shareable entities (nprofile, nevent, naddr) with optional nostr: URI stripping.',
    exampleCode: `import { npubEncode, naddrEncode, decode } from './sdk';

const pubkey = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const npub = npubEncode(pubkey);

const naddr = naddrEncode({
  identifier: 'nostr-architecture',
  pubkey,
  kind: 30023,
  relays: ['wss://relay.damus.io'],
});

const decoded = decode(\`nostr:\${naddr}\`);
console.log(decoded.type, decoded.data);`,
    symbols: [
      {
        name: 'npubEncode / nsecEncode / noteEncode',
        kind: 'function',
        signature: 'npubEncode(pubkey: Hex32): string',
        summary: 'Bech32-encodes 32-byte public keys, secret keys, or event IDs.',
        nips: ['19'],
      },
      {
        name: 'nprofileEncode',
        kind: 'function',
        signature: 'nprofileEncode(pointer: ProfilePointer): string',
        summary: 'Encodes a pubkey plus optional relay hint TLVs.',
        nips: ['19'],
      },
      {
        name: 'neventEncode',
        kind: 'function',
        signature: 'neventEncode(pointer: EventPointer): string',
        summary: 'Encodes an event ID with optional relay hints, author pubkey, and kind TLVs.',
        nips: ['19'],
      },
      {
        name: 'naddrEncode',
        kind: 'function',
        signature: 'naddrEncode(pointer: AddressPointer): string',
        summary: 'Encodes an addressable coordinate (d-tag identifier, pubkey, kind, relays).',
        nips: ['19'],
      },
      {
        name: 'decode',
        kind: 'function',
        signature: 'decode(raw: string): DecodedNip19Entity',
        summary: 'Validates checksum and decodes any NIP-19 entity (including nostr: URIs).',
        nips: ['19', '21'],
      },
    ],
  },
  {
    id: 'nip65',
    file: 'nip65.ts',
    title: 'Relay List Metadata & Endpoint Validation',
    origin: 'nip-contract',
    nips: ['65'],
    summary:
      'Strict URL normalization, outbox/inbox role marker parsing (read, write, both), duplicate collapsing, and explicit invalid-entry diagnostics for kind:10002 events.',
    exampleCode: `import { createRelayListTemplate, parseRelayListEvent } from './sdk';

const template = createRelayListTemplate([
  { url: 'wss://relay.damus.io', role: 'both' },
  { url: 'wss://nos.lol', role: 'write' },
  { url: 'wss://relay.primal.net', role: 'read' },
]);

const { endpoints, invalidEntries } = parseRelayListEvent(template);
console.log(endpoints, invalidEntries);`,
    symbols: [
      {
        name: 'normalizeRelayUrl',
        kind: 'function',
        signature: 'normalizeRelayUrl(rawUrl: string, options?: { allowInsecureWs?: boolean }): string',
        summary: 'Enforces wss:// scheme, rejects embedded credentials and fragments, normalizes host.',
        nips: ['65'],
      },
      {
        name: 'parseRelayListEvent',
        kind: 'function',
        signature: 'parseRelayListEvent(event: Pick<NostrEvent, "kind" | "tags">): RelayListParseResult',
        summary: 'Parses kind:10002 r tags into deduplicated endpoints while reporting malformed tags.',
        nips: ['65'],
      },
      {
        name: 'createRelayListTemplate',
        kind: 'function',
        signature: 'createRelayListTemplate(relays: Array<{ url: string; role?: RelayAccessRole }>): EventTemplate',
        summary: 'Builds an unsigned kind:10002 replaceable relay list event.',
        nips: ['65'],
      },
    ],
  },
  {
    id: 'signer',
    file: 'signer.ts',
    title: 'Account Signer Boundary (NIP-07 & Local)',
    origin: 'nip-contract',
    nips: ['07', '01'],
    summary:
      'Separates signing authority from feature code with LocalKeySigner, Nip07BrowserSigner (with field-integrity & signature verification), and ReadOnlySigner.',
    exampleCode: `import { Nip07BrowserSigner, LocalKeySigner, generateSecretKey } from './sdk';

const signer = Nip07BrowserSigner.isAvailable()
  ? new Nip07BrowserSigner()
  : new LocalKeySigner(generateSecretKey());

const pubkey = await signer.getPublicKey();
const signed = await signer.signEvent({
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content: 'Signed through the NostrSigner abstraction',
});`,
    symbols: [
      {
        name: 'LocalKeySigner',
        kind: 'class',
        signature: 'new LocalKeySigner(secretKey: Uint8Array)',
        summary: 'In-memory signer that zeros its secret key buffer when close() is called.',
        nips: ['01'],
      },
      {
        name: 'Nip07BrowserSigner',
        kind: 'class',
        signature: 'new Nip07BrowserSigner()',
        summary: 'Connects to window.nostr, verifies returned author, template fields, and BIP-340 signature.',
        nips: ['07'],
      },
      {
        name: 'ReadOnlySigner',
        kind: 'class',
        signature: 'new ReadOnlySigner(pubkey: Hex32)',
        summary: 'Exposes a public identity for querying while rejecting signEvent() calls.',
        nips: ['01'],
      },
    ],
  },
  {
    id: 'auth',
    file: 'auth.ts',
    title: 'NIP-42, NIP-98 & Blossom Authorization',
    origin: 'nip-contract',
    nips: ['42', '98', 'B7'],
    summary:
      'Constructs distinct, spec-compliant authentication events for relay AUTH (kind:22242), HTTP Auth (kind:27235), and Blossom blob servers (kind:24242).',
    exampleCode: `import { createNip98AuthTemplate, createBlossomAuthTemplate } from './sdk';

const httpAuth = createNip98AuthTemplate({
  url: 'https://api.example.com/v1/upload',
  method: 'POST',
  body: JSON.stringify({ hello: 'nostr' }),
});

const blossomAuth = createBlossomAuthTemplate({
  action: 'upload',
  description: 'Upload avatar blob',
  expirationSeconds: 300,
});`,
    symbols: [
      {
        name: 'createRelayAuthTemplate',
        kind: 'function',
        signature: 'createRelayAuthTemplate(relayUrl: string, challenge: string): EventTemplate',
        summary: 'Creates a NIP-42 kind:22242 relay authentication challenge response.',
        nips: ['42'],
      },
      {
        name: 'createNip98AuthTemplate / encodeNip98Header',
        kind: 'function',
        signature: 'createNip98AuthTemplate({ url, method, body? }): EventTemplate',
        summary: 'Creates a NIP-98 kind:27235 event with exact u, method, and SHA-256 payload tags.',
        nips: ['98'],
      },
      {
        name: 'createBlossomAuthTemplate / encodeBlossomAuthHeader',
        kind: 'function',
        signature: 'createBlossomAuthTemplate({ action, description, sha256Hashes? }): EventTemplate',
        summary: 'Creates a scoped Blossom kind:24242 authorization event with expiration and x hash tags.',
        nips: ['B7'],
      },
    ],
  },
  {
    id: 'builders',
    file: 'builders.ts',
    title: 'Typed Event Template Builders',
    origin: 'nip-contract',
    nips: ['01', '02', '09', '10', '14', '23', '24', '25'],
    summary:
      'Ergonomic template builders for profile metadata (kind:0), threaded notes (kind:1), follow lists (kind:3), deletions (kind:5), reactions (kind:7), and long-form articles (kind:30023).',
    exampleCode: `import { createTextNoteTemplate, createLongFormArticleTemplate } from './sdk';

const reply = createTextNoteTemplate({
  content: 'Thread markers keep clients interoperable.',
  hashtags: ['nostr', 'nip10'],
});

const article = createLongFormArticleTemplate({
  identifier: 'nip-23-guide',
  title: 'Writing Addressable Articles on Nostr',
  content: '# Overview\\nLong-form articles use kind 30023.',
});`,
    symbols: [
      {
        name: 'createProfileMetadataTemplate',
        kind: 'function',
        signature: 'createProfileMetadataTemplate(profile: ProfileMetadata): EventTemplate',
        summary: 'Builds a replaceable kind:0 metadata event.',
        nips: ['01', '24'],
      },
      {
        name: 'createTextNoteTemplate',
        kind: 'function',
        signature: 'createTextNoteTemplate({ content, replyTo?, hashtags?, subject? }): EventTemplate',
        summary: 'Builds a kind:1 short note with NIP-10 root/reply markers and NIP-14 subject tags.',
        nips: ['01', '10', '14'],
      },
      {
        name: 'createFollowListTemplate',
        kind: 'function',
        signature: 'createFollowListTemplate(follows): EventTemplate',
        summary: 'Builds a NIP-02 kind:3 replaceable follow list.',
        nips: ['02'],
      },
      {
        name: 'createDeletionRequestTemplate',
        kind: 'function',
        signature: 'createDeletionRequestTemplate({ eventIds, kinds?, reason? }): EventTemplate',
        summary: 'Builds a NIP-09 kind:5 deletion request with e and k tags.',
        nips: ['09'],
      },
      {
        name: 'createReactionTemplate',
        kind: 'function',
        signature: 'createReactionTemplate({ targetEventId, targetAuthorPubkey, reaction? }): EventTemplate',
        summary: 'Builds a NIP-25 kind:7 reaction event.',
        nips: ['25'],
      },
      {
        name: 'createLongFormArticleTemplate',
        kind: 'function',
        signature: 'createLongFormArticleTemplate({ identifier, title, content, ... }): EventTemplate',
        summary: 'Builds a NIP-23 kind:30023 addressable long-form Markdown article.',
        nips: ['23'],
      },
    ],
  },
  {
    id: 'relay',
    file: 'relay.ts',
    title: 'Hardened Relay Pool & Isolated Batch Queries',
    origin: 'sdk-extension',
    engineeringNote:
      'Built on top of NIP-01 and NIP-11. Client-side filter re-verification, maxEvents bounds, honest transport error reporting, and isolated per-author batching are SDK reliability policies—not normative text from nostr-protocol/nips.',
    nips: ['01', '11'],
    summary:
      'WebSocket transport layer with client-side NIP-01 filter enforcement, AbortSignal cancellation, honest per-relay query outcomes (no fake empty arrays on failure), and starvation-proof replaceable batch queries.',
    exampleCode: `import { RelayPool, fetchReplaceableBatch, fetchRelayInfo } from './sdk';

const info = await fetchRelayInfo('wss://relay.damus.io');
console.log(info.name, info.supported_nips);

const pool = new RelayPool();
const report = await pool.queryWithReport(['wss://relay.damus.io'], {
  kinds: [1],
  limit: 10,
});
console.log('Succeeded:', report.succeededRelays, 'Failed:', report.failedRelays);

// Anti-starvation kind:0 profile fetch across authors
const profiles = await fetchReplaceableBatch(['wss://relay.damus.io'], 0, [pubkeyA, pubkeyB]);
pool.closeAll();`,
    symbols: [
      {
        name: 'queryRelayDetailed',
        kind: 'function',
        signature: 'queryRelayDetailed(relayUrl, filter, options?): Promise<SingleRelayQueryResult>',
        summary: 'Enforces signature + matchFilter checks, maxEvents cap, AbortSignal, and explicit error/EOSE status.',
        nips: ['01'],
      },
      {
        name: 'fetchReplaceableBatch',
        kind: 'function',
        signature: 'fetchReplaceableBatch(relays, kind, authors, options?): Promise<ReplaceableBatchResult>',
        summary: 'Isolates per-(author, relay) queries with concurrency cap so one author never starves others.',
        nips: ['01'],
      },
      {
        name: 'RelayPool.queryWithReport',
        kind: 'function',
        signature: 'queryWithReport(relays, filter, options?): Promise<MultiRelayQueryReport>',
        summary: 'Returns deduplicated verified events alongside succeededRelays and failedRelays.',
        nips: ['01'],
      },
      {
        name: 'RelayPool.subscribe / publish',
        kind: 'function',
        signature: 'subscribe(relays, filter, callbacks): SubscriptionHandle',
        summary: 'Manages shared WebSocket connections, filter-verified streaming, and Promise.allSettled publishing.',
        nips: ['01'],
      },
      {
        name: 'fetchRelayInfo',
        kind: 'function',
        signature: 'fetchRelayInfo(relayUrl: string, signal?: AbortSignal): Promise<Nip11RelayInfo>',
        summary: 'Fetches a relay NIP-11 document with Accept: application/nostr+json.',
        nips: ['11'],
      },
    ],
  },
  {
    id: 'delivery',
    file: 'delivery.ts',
    title: 'Safe Relay Delivery Planner & Auth Gating',
    origin: 'sdk-extension',
    engineeringNote:
      'Combines NIP-65 outbox lists, NIP-17/51 kind:10050 DM inboxes, NIP-42 AUTH, and NIP-70 protected tags with caller allowlists and DoS bounds.',
    nips: ['42', '65', '70', '17', '59'],
    summary:
      'Pure delivery planner and authenticated publisher enforcing caller relay allowlists, NIP-70 protected-event AUTH-before-send gating, private kind:1059 inbox isolation (never widens to public defaults), and strict positive ACK semantics.',
    exampleCode: `import { planRelayDelivery, executeRelayDelivery } from './sdk';

// 1. Inspect pure delivery plan before touching the network
const plan = planRelayDelivery(signedEvent, {
  allowedRelays: ['wss://relay.damus.io', 'wss://nos.lol'],
  defaults: ['wss://relay.damus.io'],
  signedLists: [authorRelayListEvent],
  redundancy: 2,
});

// 2. Execute with explicit signer for NIP-70 / NIP-42 AUTH if needed
const result = await executeRelayDelivery(signedEvent, {
  allowedRelays: ['wss://relay.damus.io', 'wss://nos.lol'],
  signedLists: [authorRelayListEvent],
  authSigner: signer,
  authPubkey: pubkey,
});`,
    symbols: [
      {
        name: 'assertBoundedRoutingEvent',
        kind: 'function',
        signature: 'assertBoundedRoutingEvent(input: NostrEvent): NostrEvent',
        summary: 'Enforces byte/tag bounds before cloning or running BIP-340 verification.',
        nips: ['01'],
      },
      {
        name: 'planRelayDelivery',
        kind: 'function',
        signature: 'planRelayDelivery(event: NostrEvent, options): RelayDeliveryPlan',
        summary: 'Computes deterministic relay targets, excluded hints, privacy isolation, and AUTH flags without I/O.',
        nips: ['65', '70', '17', '59'],
      },
      {
        name: 'publishRelayVerified',
        kind: 'function',
        signature: 'publishRelayVerified(relayUrl, event, options?): Promise<VerifiedPublishAttempt>',
        summary: 'Gates NIP-70 protected sends behind verified NIP-42 AUTH and rejects negative duplicate OKs.',
        nips: ['01', '42', '70'],
      },
      {
        name: 'executeRelayDelivery',
        kind: 'function',
        signature: 'executeRelayDelivery(event, options): Promise<ExecuteDeliveryResult>',
        summary: 'Recomputes plan internally and delivers up to redundancy/maxAttempts caps.',
        nips: ['42', '65', '70'],
      },
    ],
  },
  {
    id: 'blossom',
    file: 'blossom.ts',
    title: 'Blossom Preflight, Replica Verification & imeta',
    origin: 'sdk-extension',
    engineeringNote:
      'Adds strict HTTPS host checks, streaming byte-bounded SHA-256 readback, and NIP-92 imeta tag generation on top of NIP-B7 / Blossom.',
    nips: ['B7', '92'],
    summary:
      'Validates 1–16 HTTPS Blossom servers, runs BUD-06 HEAD preflight checks with redirect/credential hardening, verifies downloaded replicas via streaming byte caps + SHA-256, and generates NIP-92 imeta tags.',
    exampleCode: `import { computeBlobSha256, verifyBlossomReplicas, buildImetaTag } from './sdk';

const bytes = new TextEncoder().encode('hello blossom');
const hash = computeBlobSha256(bytes);

const checks = await verifyBlossomReplicas(
  ['https://blossom.example.com'],
  { sha256: hash, size: bytes.byteLength, type: 'text/plain' },
);

const imeta = buildImetaTag({
  url: \`https://blossom.example.com/\${hash}\`,
  sha256: hash,
  mimeType: 'text/plain',
  size: bytes.byteLength,
});`,
    symbols: [
      {
        name: 'normalizeBlossomServers',
        kind: 'function',
        signature: 'normalizeBlossomServers(servers: string[]): string[]',
        summary: 'Validates 1–16 explicit HTTPS Blossom origins, blocking IP literals and .local/.internal hosts.',
        nips: ['B7'],
      },
      {
        name: 'preflightBlossomServer',
        kind: 'function',
        signature: 'preflightBlossomServer(serverUrl, blob, options?): Promise<BlossomPreflightResult>',
        summary: 'Executes HEAD /upload preflight with redirect: error and typed 200/400/401/402 status mapping.',
        nips: ['B7'],
      },
      {
        name: 'verifyBlossomReplicas',
        kind: 'function',
        signature: 'verifyBlossomReplicas(servers, expected, options?): Promise<BlossomReplicaVerification[]>',
        summary: 'Streams bytes with strict size caps, verifies exact SHA-256 digest and MIME compatibility.',
        nips: ['B7'],
      },
      {
        name: 'buildImetaTag',
        kind: 'function',
        signature: 'buildImetaTag({ url, sha256, mimeType, size, dimensions?, alt? }): string[]',
        summary: 'Builds a NIP-92 imeta tag array from verified blob metadata.',
        nips: ['92', 'B7'],
      },
    ],
  },
  {
    id: 'nsite',
    file: 'nsite.ts',
    title: 'Resumable NIP-5A Static Site Planner',
    origin: 'sdk-extension',
    engineeringNote:
      'Adds POSIX traversal guards, resumable hash diffing, and signed-manifest integrity checks on top of NIP-5A.',
    nips: ['5A', 'B7'],
    summary:
      'Runtime-agnostic planner for NIP-5A root (kind:15128) and named (kind:35128) static sites: normalizes paths, hashes files, skips already-uploaded Blossom blobs for resumable deploys, and verifies signed manifests.',
    exampleCode: `import { planNsiteRelease, verifySignedNsiteManifest, finalizeEvent } from './sdk';

const plan = planNsiteRelease(
  {
    '/index.html': new TextEncoder().encode('<h1>Hello Nsite</h1>'),
    '/app.js': new TextEncoder().encode('console.log("ready")'),
  },
  { siteName: 'zine', title: 'Community Zine', existingHashes: [] },
);

const signed = finalizeEvent(plan.manifestTemplate, secretKey);
console.log('Matches plan:', verifySignedNsiteManifest(signed, plan, signed.pubkey));`,
    symbols: [
      {
        name: 'normalizeNsitePath',
        kind: 'function',
        signature: 'normalizeNsitePath(rawPath: string): string',
        summary: 'Normalizes static asset paths to leading-slash POSIX form and blocks .. traversal.',
        nips: ['5A'],
      },
      {
        name: 'planNsiteRelease',
        kind: 'function',
        signature: 'planNsiteRelease(files: Record<string, Uint8Array>, options?): NsiteReleasePlan',
        summary: 'Computes per-file SHA-256, skips existing hashes for resumable uploads, and builds kind:15128/35128 template.',
        nips: ['5A', 'B7'],
      },
      {
        name: 'verifySignedNsiteManifest',
        kind: 'function',
        signature: 'verifySignedNsiteManifest(signedEvent, plan, expectedPubkey): boolean',
        summary: 'Verifies signer returned the exact planned manifest tags/fields plus valid BIP-340 signature.',
        nips: ['5A', '01'],
      },
    ],
  },
];
