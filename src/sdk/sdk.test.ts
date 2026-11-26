import test from 'node:test';
import assert from 'node:assert/strict';
import { bech32 } from '@scure/base';
import { hexToBytes } from '@noble/hashes/utils.js';
import {
  assertBoundedRoutingEvent,
  buildImetaTag,
  classifyEventKind,
  computeBlobSha256,
  createBlossomAuthTemplate,
  createLongFormArticleTemplate,
  createNip98AuthTemplate,
  createProfileMetadataTemplate,
  createRelayAuthTemplate,
  createRelayListTemplate,
  createTextNoteTemplate,
  decode,
  encodeBlossomAuthHeader,
  encodeNip98Header,
  executeRelayDelivery,
  fetchReplaceableBatch,
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getEventStorageKey,
  getPublicKey,
  LocalKeySigner,
  matchFilters,
  naddrEncode,
  neventEncode,
  normalizeBlossomServers,
  normalizeNsitePath,
  noteEncode,
  nprofileEncode,
  npubEncode,
  nsecEncode,
  parseRelayListEvent,
  planNsiteRelease,
  planRelayDelivery,
  preflightBlossomServer,
  publishRelayVerified,
  queryRelayDetailed,
  ReadOnlySigner,
  resolveReplaceableEvent,
  serializeEvent,
  verifyBlossomReplicas,
  verifyEvent,
  verifySignedNsiteManifest,
  type MinimalWebSocket,
  type NostrEvent,
} from './index';

/** Deterministic mock WebSocket factory for offline protocol verification. */
function createMockSocketCtor(
  handler: (url: string, ws: MockSocket, sentFrame: unknown[]) => void,
  onOpenExtra?: (url: string, ws: MockSocket) => void,
) {
  return class MockSocketImpl extends MockSocket {
    constructor(url: string) {
      super(url, handler, onOpenExtra);
    }
  };
}

class MockSocket implements MinimalWebSocket {
  readyState = 0;
  readonly sent: unknown[][] = [];
  private listeners = new Map<string, Set<(e: any) => void>>();

  constructor(
    public readonly url: string,
    private readonly onSendFrame: (url: string, ws: MockSocket, frame: unknown[]) => void,
    onOpenExtra?: (url: string, ws: MockSocket) => void,
  ) {
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.emit('open', {});
      onOpenExtra?.(this.url, this);
    });
  }

  addEventListener(type: string, listener: (e: any) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: any) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn(event);
    }
  }

  receive(frame: unknown[]) {
    this.emit('message', { data: JSON.stringify(frame) });
  }

  send(data: string) {
    const parsed = JSON.parse(data) as unknown[];
    this.sent.push(parsed);
    queueMicrotask(() => this.onSendFrame(this.url, this, parsed));
  }

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }
}

test('NIP-01 keygen, canonical serialization, SHA-256 ID, BIP-340 signing, and tamper detection', () => {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  assert.match(pk, /^[0-9a-f]{64}$/);

  const template = createTextNoteTemplate({
    content: 'Canonical Nostr UTF-8 test ⚡',
    hashtags: ['Nostr', 'NIP01'],
    createdAt: 1730000000,
  });

  const serialized = serializeEvent({ pubkey: pk, ...template });
  assert.ok(serialized.startsWith(`[0,"${pk}",1730000000,1,`));

  const signed = finalizeEvent(template, sk);
  assert.equal(signed.id, getEventHash({ pubkey: pk, ...template }));
  assert.match(signed.sig, /^[0-9a-f]{128}$/);
  assert.equal(verifyEvent(signed), true);

  const tampered = { ...signed, content: 'Tampered content' };
  assert.equal(verifyEvent(tampered), false);

  assert.throws(() =>
    serializeEvent({
      pubkey: pk,
      created_at: 1730000000,
      kind: 1,
      tags: [],
      content: 'bad \ud800 surrogate',
    }),
  );
});

test('NIP-01 kind classification and replaceable tie-breaking', () => {
  assert.equal(classifyEventKind(0), 'replaceable');
  assert.equal(classifyEventKind(1), 'regular');
  assert.equal(classifyEventKind(3), 'replaceable');
  assert.equal(classifyEventKind(10002), 'replaceable');
  assert.equal(classifyEventKind(22242), 'ephemeral');
  assert.equal(classifyEventKind(30023), 'addressable');

  const sk = generateSecretKey();
  const older = finalizeEvent(
    createLongFormArticleTemplate({
      identifier: 'doc-1',
      title: 'Draft 1',
      content: 'v1',
      createdAt: 1700000100,
    }),
    sk,
  );
  const newer = finalizeEvent(
    createLongFormArticleTemplate({
      identifier: 'doc-1',
      title: 'Draft 2',
      content: 'v2',
      createdAt: 1700000200,
    }),
    sk,
  );

  assert.equal(getEventStorageKey(older), `30023:${older.pubkey}:doc-1`);
  assert.equal(resolveReplaceableEvent(older, newer).id, newer.id);
  assert.equal(resolveReplaceableEvent(newer, older).id, newer.id);

  const tieA = { ...older, id: '1'.repeat(64) };
  const tieB = { ...older, id: '0'.repeat(64) };
  assert.equal(resolveReplaceableEvent(tieA, tieB).id, tieB.id);
});

test('NIP-01 filter matching combines fields with AND and filters with OR', () => {
  const sk = generateSecretKey();
  const note = finalizeEvent(
    createTextNoteTemplate({
      content: 'Testing filter rules',
      hashtags: ['protocol'],
      createdAt: 1730001000,
    }),
    sk,
  );

  assert.equal(
    matchFilters([{ authors: [note.pubkey], kinds: [1], '#t': ['protocol'], since: 1730000000 }], note),
    true,
  );
  assert.equal(matchFilters([{ authors: [note.pubkey], kinds: [7] }], note), false);
  assert.equal(matchFilters([{ kinds: [7] }, { '#t': ['protocol'] }], note), true);
});

test('NIP-19 round-trip encoding & adversarial TLV edge cases', () => {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const eventId = 'a'.repeat(64);

  assert.deepEqual(decode(npubEncode(pk)), { type: 'npub', data: pk });
  assert.deepEqual(decode(`nostr:${npubEncode(pk)}`), { type: 'npub', data: pk });

  const decodedSk = decode(nsecEncode(sk));
  assert.equal(decodedSk.type, 'nsec');
  if (decodedSk.type === 'nsec') assert.deepEqual(decodedSk.data, sk);

  assert.deepEqual(decode(noteEncode(eventId)), { type: 'note', data: eventId });

  const nprofile = nprofileEncode({ pubkey: pk, relays: ['wss://relay.damus.io'] });
  assert.deepEqual(decode(nprofile), {
    type: 'nprofile',
    data: { pubkey: pk, relays: ['wss://relay.damus.io'] },
  });

  const nevent = neventEncode({ id: eventId, author: pk, kind: 1, relays: ['wss://nos.lol'] });
  assert.deepEqual(decode(nevent), {
    type: 'nevent',
    data: { id: eventId, author: pk, kind: 1, relays: ['wss://nos.lol'] },
  });

  const naddr = naddrEncode({
    identifier: 'welcome-post',
    pubkey: pk,
    kind: 30023,
    relays: ['wss://relay.primal.net'],
  });
  assert.deepEqual(decode(naddr), {
    type: 'naddr',
    data: { identifier: 'welcome-post', pubkey: pk, kind: 30023, relays: ['wss://relay.primal.net'] },
  });

  // Adversarial TLV check: nevent with TLV type-2 (author) ONLY and missing TLV type-0 (id) must reject
  const authorOnlyTlv = new Uint8Array([2, 32, ...hexToBytes(pk)]);
  const brokenNevent = bech32.encode('nevent', bech32.toWords(authorOnlyTlv), 5000);
  assert.throws(() => decode(brokenNevent), /missing 32-byte event id/);

  // Adversarial TLV check: nevent with reversed TLV order (author before event id) must still preserve type-0 as id
  const reversedTlv = new Uint8Array([2, 32, ...hexToBytes(pk), 0, 32, ...hexToBytes(eventId)]);
  const reversedNevent = bech32.encode('nevent', bech32.toWords(reversedTlv), 5000);
  const decodedReversed = decode(reversedNevent);
  assert.equal(decodedReversed.type, 'nevent');
  if (decodedReversed.type === 'nevent') {
    assert.equal(decodedReversed.data.id, eventId);
    assert.equal(decodedReversed.data.author, pk);
  }

  assert.throws(() => decode('npub1invalidchecksum'));
});

test('NIP-65 relay list parsing deduplicates roles and flags malformed entries', () => {
  const template = createRelayListTemplate([
    { url: 'wss://Relay.Damus.io/', role: 'read' },
    { url: 'wss://relay.damus.io', role: 'write' },
    { url: 'wss://nos.lol', role: 'both' },
  ]);

  template.tags.push(
    ['r', 'https://not-a-ws-relay.example'],
    ['r', 'wss://user:pass@bad.relay.example'],
    ['r', 'wss://fragment.relay.example/#bad'],
    ['r', 'wss://unknown-marker.example', 'admin'],
  );

  const parsed = parseRelayListEvent(template);
  assert.equal(parsed.endpoints.length, 2);
  assert.deepEqual(parsed.endpoints[0], {
    url: 'wss://relay.damus.io',
    read: true,
    write: true,
    role: 'both',
  });
  assert.equal(parsed.invalidEntries.length, 4);
});

test('NIP-42, NIP-98, Blossom auth templates and Signer boundary', async () => {
  const sk = generateSecretKey();
  const signer = new LocalKeySigner(sk);
  const pubkey = await signer.getPublicKey();

  const auth42 = createRelayAuthTemplate('wss://relay.example', 'challenge-123', 1730000000);
  assert.equal(auth42.kind, 22242);

  const auth98 = createNip98AuthTemplate({
    url: 'https://api.example.com/notes?limit=5',
    method: 'post',
    body: '{"ok":true}',
    createdAt: 1730000000,
  });
  const signed98 = await signer.signEvent(auth98);
  assert.equal(verifyEvent(signed98), true);
  assert.ok(encodeNip98Header(signed98).startsWith('Nostr '));

  const blossom = createBlossomAuthTemplate({
    action: 'upload',
    description: 'Upload media',
    sha256Hashes: ['b'.repeat(64)],
    createdAt: 1730000000,
  });
  const signedBlossom = await signer.signEvent(blossom);
  assert.ok(encodeBlossomAuthHeader(signedBlossom).startsWith('Nostr '));

  signer.close();
  await assert.rejects(() => signer.signEvent(auth42));

  const ro = new ReadOnlySigner(pubkey);
  assert.equal(await ro.getPublicKey(), pubkey);
  await assert.rejects(() => ro.signEvent(auth42));
});

test('SDK Add-On (relay.ts): queryRelayDetailed enforces client-side matchFilter & honest errors', async () => {
  const sk = generateSecretKey();
  const matchingNote = finalizeEvent(createTextNoteTemplate({ content: 'match', createdAt: 1730000010 }), sk);
  const wrongKindEvent = finalizeEvent(createProfileMetadataTemplate({ name: 'injected' }, 1730000020), sk);

  const SocketCtor = createMockSocketCtor((_url, ws, frame) => {
    if (frame[0] === 'REQ') {
      const subId = frame[1];
      ws.receive(['EVENT', subId, wrongKindEvent]); // out-of-filter injection!
      ws.receive(['EVENT', subId, matchingNote]);
      ws.receive(['EOSE', subId]);
    }
  });

  const res = await queryRelayDetailed('wss://relay.example', { kinds: [1] }, { SocketCtor });
  assert.equal(res.status, 'eose');
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].id, matchingNote.id);

  // Connection error must NOT masquerade as an empty EOSE result
  const FailingSocket = createMockSocketCtor(
    () => {},
    (_url, ws) => ws.emit('error', {}),
  );
  const failRes = await queryRelayDetailed('wss://down.example', { kinds: [1] }, { SocketCtor: FailingSocket });
  assert.equal(failRes.status, 'error');
  assert.ok(failRes.error);
});

test('SDK Add-On (relay.ts): fetchReplaceableBatch isolates per-author budgets & resolves newest', async () => {
  const skA = generateSecretKey();
  const skB = generateSecretKey();
  const pkA = getPublicKey(skA);
  const pkB = getPublicKey(skB);

  const oldA = finalizeEvent(createProfileMetadataTemplate({ name: 'old-a' }, 1730000100), skA);
  const newA = finalizeEvent(createProfileMetadataTemplate({ name: 'new-a' }, 1730000200), skA);
  const profileB = finalizeEvent(createProfileMetadataTemplate({ name: 'alice-b' }, 1730000150), skB);

  const SocketCtor = createMockSocketCtor((_url, ws, frame) => {
    if (frame[0] === 'REQ') {
      const [, subId, filter] = frame as [string, string, { authors?: string[] }];
      if (filter.authors?.[0] === pkA) {
        ws.receive(['EVENT', subId, oldA]);
        ws.receive(['EVENT', subId, newA]);
      } else if (filter.authors?.[0] === pkB) {
        ws.receive(['EVENT', subId, profileB]);
      }
      ws.receive(['EOSE', subId]);
    }
  });

  const batch = await fetchReplaceableBatch(['wss://relay.example'], 0, [pkA, pkB], { SocketCtor });
  assert.equal(batch.queriedPairs, 2);
  assert.equal(batch.succeededPairs, 2);
  assert.equal(batch.events.get(pkA)?.id, newA.id);
  assert.equal(batch.events.get(pkB)?.id, profileB.id);
});

test('SDK Add-On (delivery.ts): NIP-70 protected AUTH gating, gift-wrap isolation, and strict ACK', async () => {
  const authorSk = generateSecretKey();
  const recipientSk = generateSecretKey();
  const recipientPk = getPublicKey(recipientSk);
  const authorSigner = new LocalKeySigner(authorSk);
  const authorPk = await authorSigner.getPublicKey();

  // 1. Gift wrap (kind:1059) must NEVER widen to public defaults when kind:10050 inbox is absent
  const giftWrap = finalizeEvent(
    { kind: 1059, created_at: 1730000000, tags: [['p', recipientPk]], content: 'ciphertext' },
    authorSk,
  );
  const privatePlan = planRelayDelivery(giftWrap, {
    allowedRelays: ['wss://public.example', 'wss://inbox.example'],
    defaults: ['wss://public.example'],
    signedLists: [],
  });
  assert.equal(privatePlan.mode, 'private-inbox');
  assert.equal(privatePlan.targets.length, 0);
  assert.ok(privatePlan.warnings.some((w) => /will NOT widen/i.test(w)));

  // With verified kind:10050 inbox list, targets ONLY the inbox relay
  const inboxList = finalizeEvent(
    { kind: 10050, created_at: 1730000000, tags: [['relay', 'wss://inbox.example']], content: '' },
    recipientSk,
  );
  const routedPrivate = planRelayDelivery(giftWrap, {
    allowedRelays: ['wss://public.example', 'wss://inbox.example'],
    defaults: ['wss://public.example'],
    signedLists: [inboxList],
  });
  assert.deepEqual(
    routedPrivate.targets.map((t) => t.relay),
    ['wss://inbox.example'],
  );

  // 2. NIP-70 protected event must NEVER send EVENT before AUTH challenge succeeds
  const protectedEvent = finalizeEvent(
    { kind: 1, created_at: 1730000000, tags: [['-']], content: 'protected note' },
    authorSk,
  );
  const sentBeforeAuth: unknown[][] = [];
  const SilentRelay = createMockSocketCtor((_url, _ws, frame) => {
    sentBeforeAuth.push(frame);
  });
  const noChallengeAttempt = await publishRelayVerified('wss://auth.example', protectedEvent, {
    SocketCtor: SilentRelay,
    authSigner: authorSigner,
    authPubkey: authorPk,
    timeoutMs: 120,
  });
  assert.equal(noChallengeAttempt.accepted, false);
  assert.equal(noChallengeAttempt.error, 'timeout');
  assert.equal(sentBeforeAuth.length, 0, 'Protected event must never be transmitted without AUTH');

  // 3. When relay sends AUTH challenge and accepts AUTH OK, protected event is sent and accepted
  const AuthRelay = createMockSocketCtor(
    (_url, ws, frame) => {
      if (frame[0] === 'AUTH') {
        const authEv = frame[1] as NostrEvent;
        ws.receive(['OK', authEv.id, true, '']);
      } else if (frame[0] === 'EVENT') {
        const ev = frame[1] as NostrEvent;
        ws.receive(['OK', ev.id, true, 'stored']);
      }
    },
    (_url, ws) => ws.receive(['AUTH', 'challenge-xyz']),
  );
  const authedResult = await executeRelayDelivery(protectedEvent, {
    allowedRelays: ['wss://auth.example'],
    defaults: ['wss://auth.example'],
    redundancy: 1,
    SocketCtor: AuthRelay,
    authSigner: authorSigner,
    authPubkey: authorPk,
  });
  assert.equal(authedResult.metRedundancy, true);
  assert.equal(authedResult.attempts[0].authenticated, true);

  // 4. Negative duplicate OK must NOT be treated as accepted
  const DupRejectRelay = createMockSocketCtor((_url, ws, frame) => {
    if (frame[0] === 'EVENT') {
      const ev = frame[1] as NostrEvent;
      ws.receive(['OK', ev.id, false, 'duplicate: already have this event']);
    }
  });
  const normalNote = finalizeEvent(createTextNoteTemplate({ content: 'hello' }), authorSk);
  const dupAttempt = await publishRelayVerified('wss://dup.example', normalNote, {
    SocketCtor: DupRejectRelay,
  });
  assert.equal(dupAttempt.accepted, false);

  // 5. Dedicated transport auth kinds cannot be routed as normal events
  const authEv = finalizeEvent(createRelayAuthTemplate('wss://auth.example', 'c'), authorSk);
  assert.throws(() =>
    planRelayDelivery(authEv, { allowedRelays: ['wss://auth.example'], defaults: ['wss://auth.example'] }),
  );
  assert.ok(assertBoundedRoutingEvent(normalNote));
});

test('SDK Add-On (blossom.ts & nsite.ts): streaming replica checks, imeta, and resumable NIP-5A planning', async () => {
  assert.throws(() => normalizeBlossomServers(['https://127.0.0.1']));
  assert.throws(() => normalizeBlossomServers(['https://blob.local']));
  assert.deepEqual(normalizeBlossomServers(['https://Blossom.Example.com/']), ['https://blossom.example.com']);

  const payload = new TextEncoder().encode('console.log("nostr");');
  const hash = computeBlobSha256(payload);

  const mockFetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (init?.method === 'HEAD' && href.endsWith('/upload')) {
      return new Response(null, { status: 401 });
    }
    if (href.endsWith(`/${hash}`)) {
      return new Response(payload, {
        status: 200,
        headers: { 'content-type': 'application/javascript; charset=utf-8' },
      });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  const preflight = await preflightBlossomServer(
    'https://blossom.example.com',
    { sha256: hash, size: payload.byteLength, type: 'text/javascript' },
    { fetcher: mockFetch },
  );
  assert.equal(preflight.status, 'auth-required');

  const replicas = await verifyBlossomReplicas(
    ['https://blossom.example.com'],
    { sha256: hash, size: payload.byteLength, type: 'text/javascript' },
    { fetcher: mockFetch },
  );
  assert.equal(replicas[0].verified, true);

  const imeta = buildImetaTag({
    url: `https://blossom.example.com/${hash}`,
    sha256: hash,
    mimeType: 'text/javascript',
    size: payload.byteLength,
    alt: 'App bundle',
  });
  assert.equal(imeta[0], 'imeta');
  assert.ok(imeta.includes(`x ${hash}`));

  // NIP-5A resumable release plan + signed manifest verification
  assert.throws(() => normalizeNsitePath('../secrets.txt'));
  const htmlBytes = new TextEncoder().encode('<h1>Nsite</h1>');
  const plan = planNsiteRelease(
    {
      '/index.html': htmlBytes,
      '/app.js': payload,
    },
    {
      siteName: 'zine',
      title: 'Community Zine',
      existingHashes: [hash], // app.js already uploaded!
      createdAt: 1730000000,
    },
  );
  assert.equal(plan.kind, 35128);
  assert.equal(plan.skippedExisting.length, 1);
  assert.equal(plan.pendingUploads.length, 1);
  assert.equal(plan.pendingUploads[0].path, '/index.html');

  const sk = generateSecretKey();
  const signedManifest = finalizeEvent(plan.manifestTemplate, sk);
  assert.equal(verifySignedNsiteManifest(signedManifest, plan, signedManifest.pubkey), true);
});
