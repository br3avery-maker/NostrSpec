import { useMemo, useState } from 'react';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  CheckCircle2,
  KeyRound,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  classifyEventKind,
  createBlossomAuthTemplate,
  createLongFormArticleTemplate,
  createNip98AuthTemplate,
  createProfileMetadataTemplate,
  createRelayListTemplate,
  createTextNoteTemplate,
  decode,
  encodeBlossomAuthHeader,
  encodeNip98Header,
  finalizeEvent,
  generateSecretKey,
  getEventStorageKey,
  getPublicKey,
  matchFilters,
  naddrEncode,
  neventEncode,
  Nip07BrowserSigner,
  noteEncode,
  nowSeconds,
  nprofileEncode,
  npubEncode,
  nsecEncode,
  parseRelayListEvent,
  planRelayDelivery,
  serializeEvent,
  verifyEvent,
  type Nip11RelayInfo,
  type NostrEvent,
  type NostrFilter,
} from '../sdk/index';
import { CodeBlock } from './CodeBlock';

export type PlaygroundTab = 'signer' | 'nip19' | 'relays' | 'filters' | 'delivery';

interface SdkPlaygroundViewProps {
  initialTab?: PlaygroundTab;
  onSelectNip: (nipId: string) => void;
}

type PresetId = 'note' | 'profile' | 'article' | 'relays' | 'nip98' | 'blossom';

const PRESET_OPTIONS: Array<{ id: PresetId; label: string; kind: number; nip: string }> = [
  { id: 'note', label: 'Short Text Note (kind:1)', kind: 1, nip: '01' },
  { id: 'profile', label: 'User Metadata (kind:0)', kind: 0, nip: '01' },
  { id: 'article', label: 'Long-form Article (kind:30023)', kind: 30023, nip: '23' },
  { id: 'relays', label: 'Relay List Metadata (kind:10002)', kind: 10002, nip: '65' },
  { id: 'nip98', label: 'HTTP Auth (kind:27235)', kind: 27235, nip: '98' },
  { id: 'blossom', label: 'Blossom Upload Auth (kind:24242)', kind: 24242, nip: 'B7' },
];

export function SdkPlaygroundView({ initialTab = 'signer', onSelectNip }: SdkPlaygroundViewProps) {
  const [activeTab, setActiveTab] = useState<PlaygroundTab>(initialTab);

  // --- Tab 1: Event Signer & Verifier ---
  const [secretKey, setSecretKey] = useState<Uint8Array>(() => generateSecretKey());
  const pubkey = useMemo(() => getPublicKey(secretKey), [secretKey]);
  const npub = useMemo(() => npubEncode(pubkey), [pubkey]);
  const [preset, setPreset] = useState<PresetId>('note');
  const [noteContent, setNoteContent] = useState(
    'Signing a real NIP-01 event with BIP-340 Schnorr cryptography.',
  );
  const [hashtagsText, setHashtagsText] = useState('nostr, nip01');
  const [signedEvent, setSignedEvent] = useState<NostrEvent | null>(null);
  const [tampered, setTampered] = useState(false);
  const [signerStatus, setSignerStatus] = useState<string | null>(null);

  // --- Tab 2: NIP-19 Entity Codec ---
  const [nip19Input, setNip19Input] = useState<string>(() => npubEncode(getPublicKey(generateSecretKey())));
  const [encodeMode, setEncodeMode] = useState<'npub' | 'note' | 'nprofile' | 'nevent' | 'naddr'>('naddr');
  const [encodeIdentifier, setEncodeIdentifier] = useState('nostr-sdk-guide');
  const [encodeKind, setEncodeKind] = useState('30023');
  const [encodeRelays, setEncodeRelays] = useState('wss://relay.damus.io, wss://nos.lol');

  // --- Tab 3: NIP-65 Relay List & NIP-11 Inspector ---
  const [nip65TagsText, setNip65TagsText] = useState(
    JSON.stringify(
      [
        ['r', 'wss://relay.damus.io'],
        ['r', 'wss://nos.lol', 'write'],
        ['r', 'wss://relay.primal.net', 'read'],
        ['r', 'https://invalid-scheme.example'],
        ['r', 'wss://unknown-role.example', 'admin'],
      ],
      null,
      2,
    ),
  );
  const [nip11RelayUrl, setNip11RelayUrl] = useState('wss://relay.damus.io');
  const [nip11Loading, setNip11Loading] = useState(false);
  const [nip11Result, setNip11Result] = useState<Nip11RelayInfo | null>(null);
  const [nip11Error, setNip11Error] = useState<string | null>(null);

  // --- Tab 4: NIP-01 Filter Matcher ---
  const [filterJson, setFilterJson] = useState(
    JSON.stringify(
      [
        {
          kinds: [1],
          '#t': ['nostr'],
        },
      ],
      null,
      2,
    ),
  );

  // --- Tab 5: Delivery Planner (SDK Engineering Add-On) ---
  const [recipientSk] = useState<Uint8Array>(() => generateSecretKey());
  const recipientPubkey = useMemo(() => getPublicKey(recipientSk), [recipientSk]);
  const [deliveryScenario, setDeliveryScenario] = useState<'public' | 'protected' | 'giftwrap'>(
    'public',
  );
  const [includeDmInbox, setIncludeDmInbox] = useState(true);
  const [deliveryAllowedRelays, setDeliveryAllowedRelays] = useState(
    'wss://relay.damus.io, wss://nos.lol, wss://inbox.example.com',
  );
  const [deliveryRedundancy, setDeliveryRedundancy] = useState(2);

  const deliveryDryRun = useMemo(() => {
    const allowedRelays = deliveryAllowedRelays
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const now = nowSeconds();
    const authorNip65 = finalizeEvent(
      {
        kind: 10002,
        created_at: now - 30,
        tags: [
          ['r', 'wss://relay.damus.io', 'write'],
          ['r', 'wss://untrusted.relay.example', 'write'],
        ],
        content: '',
      },
      secretKey,
    );
    const recipientNip65 = finalizeEvent(
      {
        kind: 10002,
        created_at: now - 20,
        tags: [['r', 'wss://nos.lol', 'read']],
        content: '',
      },
      recipientSk,
    );
    const recipientDmInbox = finalizeEvent(
      {
        kind: 10050,
        created_at: now - 10,
        tags: [
          ['relay', 'wss://inbox.example.com'],
          ['relay', 'wss://unapproved-inbox.example'],
        ],
        content: '',
      },
      recipientSk,
    );

    const signedLists = includeDmInbox
      ? [authorNip65, recipientNip65, recipientDmInbox]
      : [authorNip65, recipientNip65];

    const eventToPlan =
      deliveryScenario === 'giftwrap'
        ? finalizeEvent(
            {
              kind: 1059,
              created_at: now,
              tags: [['p', recipientPubkey]],
              content: 'nip44-sealed-ciphertext-preview',
            },
            secretKey,
          )
        : deliveryScenario === 'protected'
          ? finalizeEvent(
              {
                kind: 1,
                created_at: now,
                tags: [['-'], ['p', recipientPubkey]],
                content: 'Protected note requiring NIP-42 AUTH before transmission.',
              },
              secretKey,
            )
          : finalizeEvent(
              {
                kind: 1,
                created_at: now,
                tags: [['p', recipientPubkey]],
                content: 'Public note routed via NIP-65 author write + recipient read relays.',
              },
              secretKey,
            );

    try {
      const plan = planRelayDelivery(eventToPlan, {
        allowedRelays,
        defaults: ['wss://relay.damus.io'],
        signedLists,
        redundancy: deliveryRedundancy,
        now,
      });
      return { ok: true as const, plan, eventToPlan };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Unable to compute delivery plan',
      };
    }
  }, [
    deliveryAllowedRelays,
    deliveryScenario,
    includeDmInbox,
    deliveryRedundancy,
    secretKey,
    recipientSk,
    recipientPubkey,
  ]);

  const buildActiveTemplate = () => {
    const tags = hashtagsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    switch (preset) {
      case 'profile':
        return createProfileMetadataTemplate({
          name: 'nostr_builder',
          about: noteContent,
          website: 'https://github.com/nostr-protocol/nips',
        });
      case 'article':
        return createLongFormArticleTemplate({
          identifier: 'nostr-protocol-guide',
          title: 'Understanding NIP-01 & Addressable Events',
          content: noteContent,
          hashtags: tags,
        });
      case 'relays':
        return createRelayListTemplate([
          { url: 'wss://relay.damus.io', role: 'both' },
          { url: 'wss://nos.lol', role: 'write' },
          { url: 'wss://relay.primal.net', role: 'read' },
        ]);
      case 'nip98':
        return createNip98AuthTemplate({
          url: 'https://api.example.com/v1/events',
          method: 'POST',
          body: noteContent,
        });
      case 'blossom':
        return createBlossomAuthTemplate({
          action: 'upload',
          description: noteContent || 'Upload media blob',
          expirationSeconds: 300,
        });
      case 'note':
      default:
        return createTextNoteTemplate({
          content: noteContent,
          hashtags: tags,
        });
    }
  };

  const handleGenerateKeypair = () => {
    setSecretKey(generateSecretKey());
    setSignedEvent(null);
    setTampered(false);
    setSignerStatus('Generated fresh secp256k1 keypair in browser memory.');
  };

  const handleSignLocal = () => {
    const template = buildActiveTemplate();
    const signed = finalizeEvent(template, secretKey);
    setSignedEvent(signed);
    setTampered(false);
    setSignerStatus('Signed with local BIP-340 Schnorr key.');
  };

  const handleSignNip07 = async () => {
    if (!Nip07BrowserSigner.isAvailable()) {
      setSignerStatus('No NIP-07 browser extension (window.nostr) detected on this origin.');
      return;
    }
    try {
      const signer = new Nip07BrowserSigner();
      const template = buildActiveTemplate();
      const signed = await signer.signEvent(template);
      setSignedEvent(signed);
      setTampered(false);
      setSignerStatus('Signed and verified via NIP-07 browser extension.');
    } catch (err) {
      setSignerStatus(err instanceof Error ? err.message : 'NIP-07 signing rejected.');
    }
  };

  const handleTamperToggle = () => {
    if (!signedEvent) return;
    setSignedEvent({
      ...signedEvent,
      content: tampered ? noteContent : `${signedEvent.content} [tampered]`,
    });
    setTampered(!tampered);
  };

  const verificationOk = useMemo(
    () => (signedEvent ? verifyEvent(signedEvent) : null),
    [signedEvent],
  );

  const canonicalJson = useMemo(() => {
    if (!signedEvent) return null;
    try {
      return serializeEvent({
        pubkey: signedEvent.pubkey,
        created_at: signedEvent.created_at,
        kind: signedEvent.kind,
        tags: signedEvent.tags,
        content: signedEvent.content,
      });
    } catch {
      return null;
    }
  }, [signedEvent]);

  const authHeaderPreview = useMemo(() => {
    if (!signedEvent) return null;
    if (signedEvent.kind === 27235) return encodeNip98Header(signedEvent);
    if (signedEvent.kind === 24242) return encodeBlossomAuthHeader(signedEvent);
    return null;
  }, [signedEvent]);

  // NIP-19 Live Encode & Decode
  const nip19Decoded = useMemo(() => {
    try {
      const decoded = decode(nip19Input);
      return {
        ok: true as const,
        type: decoded.type,
        display:
          decoded.type === 'nsec'
            ? { secretKeyHex: bytesToHex(decoded.data) }
            : decoded.data,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Invalid Bech32 entity',
      };
    }
  }, [nip19Input]);

  const nip19Encoded = useMemo(() => {
    const relays = encodeRelays
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const sampleEventId = signedEvent?.id ?? 'a'.repeat(64);
    try {
      switch (encodeMode) {
        case 'npub':
          return { ok: true as const, value: npubEncode(pubkey) };
        case 'note':
          return { ok: true as const, value: noteEncode(sampleEventId) };
        case 'nprofile':
          return { ok: true as const, value: nprofileEncode({ pubkey, relays }) };
        case 'nevent':
          return {
            ok: true as const,
            value: neventEncode({
              id: sampleEventId,
              author: pubkey,
              kind: Number.parseInt(encodeKind, 10) || 1,
              relays,
            }),
          };
        case 'naddr':
          return {
            ok: true as const,
            value: naddrEncode({
              identifier: encodeIdentifier,
              pubkey,
              kind: Number.parseInt(encodeKind, 10) || 30023,
              relays,
            }),
          };
      }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Encode failed' };
    }
  }, [encodeMode, pubkey, encodeRelays, encodeIdentifier, encodeKind, signedEvent]);

  // NIP-65 Parse
  const nip65Parsed = useMemo(() => {
    try {
      const tags = JSON.parse(nip65TagsText);
      if (!Array.isArray(tags)) throw new Error('Tags must be a JSON array of string arrays');
      return {
        ok: true as const,
        result: parseRelayListEvent({ kind: 10002, tags }),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Invalid JSON tags',
      };
    }
  }, [nip65TagsText]);

  const handleFetchNip11 = async () => {
    setNip11Loading(true);
    setNip11Error(null);
    setNip11Result(null);
    try {
      const res = await fetch('/api/relay/nip11', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relayUrl: nip11RelayUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setNip11Result(data.info as Nip11RelayInfo);
    } catch (err) {
      setNip11Error(err instanceof Error ? err.message : 'Unable to fetch relay info');
    } finally {
      setNip11Loading(false);
    }
  };

  // NIP-01 Filter Match
  const sampleFilterEvent = useMemo(() => {
    if (signedEvent) return signedEvent;
    return finalizeEvent(
      createTextNoteTemplate({
        content: 'Sample signed event for filter evaluation',
        hashtags: ['nostr', 'sdk'],
        createdAt: nowSeconds(),
      }),
      secretKey,
    );
  }, [signedEvent, secretKey]);

  const filterEvaluation = useMemo(() => {
    try {
      const parsed = JSON.parse(filterJson) as NostrFilter | NostrFilter[];
      const filters = Array.isArray(parsed) ? parsed : [parsed];
      return {
        ok: true as const,
        matched: matchFilters(filters, sampleFilterEvent),
        filterCount: filters.length,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Invalid filter JSON',
      };
    }
  }, [filterJson, sampleFilterEvent]);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500">
            <span>@nostrspec/sdk</span>
            <span className="mx-1.5" aria-hidden="true">/</span>
            <span>Interactive Cryptographic Workbench</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            SDK Playground
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Execute real BIP-340 Schnorr signing, NIP-01 canonical hashing, NIP-19 Bech32/TLV encoding, NIP-65/NIP-11 inspection, and dry-run SDK add-on delivery planning directly in your browser.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80 overflow-x-auto self-start md:self-auto">
          {(
            [
              ['signer', 'Event Signer'],
              ['nip19', 'NIP-19 Codec'],
              ['relays', 'NIP-65 & NIP-11'],
              ['filters', 'Filter Matcher'],
              ['delivery', 'Delivery Planner'],
            ] as Array<[PlaygroundTab, string]>
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: Event Signer & Verifier */}
      {activeTab === 'signer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-5 bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">1. Identity & Template</h2>
              <button
                type="button"
                onClick={handleGenerateKeypair}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Keypair</span>
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="text-slate-500">Active Public Key (npub / hex)</div>
              <div className="font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-md p-2.5 break-all">
                <div>{npub}</div>
                <div className="text-[11px] text-slate-500 mt-1">{pubkey}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="preset-select" className="block text-xs font-medium text-slate-700">
                Event Preset
              </label>
              <select
                id="preset-select"
                value={preset}
                onChange={(e) => setPreset(e.target.value as PresetId)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
              >
                {PRESET_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="event-content-input" className="block text-xs font-medium text-slate-700">
                Event Content
              </label>
              <textarea
                id="event-content-input"
                rows={3}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {(preset === 'note' || preset === 'article') && (
              <div className="space-y-1.5">
                <label htmlFor="event-tags-input" className="block text-xs font-medium text-slate-700">
                  Hashtags (comma-separated)
                </label>
                <input
                  id="event-tags-input"
                  type="text"
                  value={hashtagsText}
                  onChange={(e) => setHashtagsText(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSignLocal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Event (BIP-340)</span>
              </button>
              <button
                type="button"
                onClick={handleSignNip07}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
              >
                Sign with window.nostr
              </button>
            </div>

            {signerStatus && (
              <p className="text-xs text-slate-600 pt-1">{signerStatus}</p>
            )}
          </div>

          <div className="lg:col-span-7 space-y-5">
            {signedEvent ? (
              <>
                <div
                  className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    verificationOk
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-red-50/80 border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {verificationOk ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <div>
                      <div
                        className={`text-sm font-semibold ${
                          verificationOk ? 'text-emerald-950' : 'text-red-950'
                        }`}
                      >
                        {verificationOk
                          ? 'Valid BIP-340 Signature & Canonical SHA-256 ID'
                          : 'Invalid Signature — Verification Failed'}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 font-mono">
                        Storage: {classifyEventKind(signedEvent.kind)} · Key:{' '}
                        {getEventStorageKey(signedEvent).slice(0, 28)}…
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTamperToggle}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0"
                  >
                    {tampered ? 'Restore Original Content' : 'Tamper Content'}
                  </button>
                </div>

                <CodeBlock
                  code={JSON.stringify(signedEvent, null, 2)}
                  language="json"
                  title="Signed NostrEvent (NIP-01)"
                />

                {canonicalJson && (
                  <CodeBlock
                    code={canonicalJson}
                    language="json"
                    title="Canonical Serialization Hashed for Event ID"
                    maxHeightClass="max-h-[160px]"
                  />
                )}

                {authHeaderPreview && (
                  <CodeBlock
                    code={`Authorization: ${authHeaderPreview}`}
                    language="http"
                    title={
                      signedEvent.kind === 27235
                        ? 'NIP-98 HTTP Authorization Header'
                        : 'Blossom BUD-11 Authorization Header'
                    }
                    maxHeightClass="max-h-[140px]"
                  />
                )}
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
                <p className="text-sm font-medium text-slate-900">
                  No signed event yet
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Choose any NIP template on the left and click <strong className="font-medium text-slate-700">Sign Event (BIP-340)</strong> to compute its SHA-256 ID, Schnorr signature, and canonical serialization array.
                </p>
                <button
                  type="button"
                  onClick={handleSignLocal}
                  className="mt-1 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                >
                  Sign Sample Event
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NIP-19 Entity Codec */}
      {activeTab === 'nip19' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Encode NIP-19 Entity</h2>
              <button
                type="button"
                onClick={() => onSelectNip('19')}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                Read NIP-19
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 border border-slate-200/70 overflow-x-auto">
              {(['npub', 'note', 'nprofile', 'nevent', 'naddr'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEncodeMode(mode)}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap ${
                    encodeMode === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {encodeMode === 'naddr' && (
              <div className="space-y-1.5">
                <label htmlFor="naddr-d-tag" className="block text-xs font-medium text-slate-700">
                  Addressable Identifier (d tag)
                </label>
                <input
                  id="naddr-d-tag"
                  type="text"
                  value={encodeIdentifier}
                  onChange={(e) => setEncodeIdentifier(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
                />
              </div>
            )}

            {(encodeMode === 'naddr' || encodeMode === 'nevent') && (
              <div className="space-y-1.5">
                <label htmlFor="nip19-kind" className="block text-xs font-medium text-slate-700">
                  Event Kind
                </label>
                <input
                  id="nip19-kind"
                  type="number"
                  value={encodeKind}
                  onChange={(e) => setEncodeKind(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md tabular-nums"
                />
              </div>
            )}

            {(encodeMode === 'nprofile' || encodeMode === 'nevent' || encodeMode === 'naddr') && (
              <div className="space-y-1.5">
                <label htmlFor="nip19-relays" className="block text-xs font-medium text-slate-700">
                  Relay Hints (comma-separated)
                </label>
                <input
                  id="nip19-relays"
                  type="text"
                  value={encodeRelays}
                  onChange={(e) => setEncodeRelays(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md"
                />
              </div>
            )}

            {nip19Encoded.ok ? (
              <div className="space-y-2.5 pt-1">
                <CodeBlock
                  code={nip19Encoded.value}
                  language="bech32"
                  title={`Encoded ${encodeMode}`}
                  maxHeightClass="max-h-[140px]"
                />
                <button
                  type="button"
                  onClick={() => setNip19Input(nip19Encoded.value)}
                  className="text-xs font-medium text-indigo-700 hover:underline"
                >
                  Send to Decoder →
                </button>
              </div>
            ) : (
              <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                {nip19Encoded.error}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Decode Bech32 / nostr: URI</h2>
              <button
                type="button"
                onClick={() => setNip19Input(`nostr:${nsecEncode(secretKey)}`)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
              >
                Load sample nsec
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="nip19-decode-input" className="block text-xs font-medium text-slate-700">
                Paste npub, nsec, note, nprofile, nevent, or naddr
              </label>
              <textarea
                id="nip19-decode-input"
                rows={3}
                value={nip19Input}
                onChange={(e) => setNip19Input(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {nip19Decoded.ok ? (
              <div className="space-y-3">
                <div className="text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span>Valid Bech32 checksum · Entity type: {nip19Decoded.type}</span>
                </div>
                <CodeBlock
                  code={JSON.stringify(
                    { type: nip19Decoded.type, data: nip19Decoded.display },
                    null,
                    2,
                  )}
                  language="json"
                  title="Decoded NIP-19 Payload"
                />
              </div>
            ) : (
              <div className="p-3.5 rounded-md border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{nip19Decoded.error}</span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: NIP-65 Relay List & NIP-11 Inspector */}
      {activeTab === 'relays' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                NIP-65 Relay List Parser (kind:10002)
              </h2>
              <button
                type="button"
                onClick={() => onSelectNip('65')}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                Read NIP-65
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="nip65-tags-input" className="block text-xs font-medium text-slate-700">
                Event Tags JSON
              </label>
              <textarea
                id="nip65-tags-input"
                rows={8}
                value={nip65TagsText}
                onChange={(e) => setNip65TagsText(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {nip65Parsed.ok ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-900">
                    Valid Endpoints ({nip65Parsed.result.endpoints.length})
                  </div>
                  <div className="rounded-md border border-slate-200 divide-y divide-slate-100 text-xs">
                    {nip65Parsed.result.endpoints.map((ep) => (
                      <div key={ep.url} className="px-3 py-2 flex items-center justify-between gap-3">
                        <span className="font-mono text-slate-900 truncate">{ep.url}</span>
                        <span className="text-slate-600 capitalize whitespace-nowrap shrink-0">
                          {ep.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {nip65Parsed.result.invalidEntries.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-amber-800">
                      Rejected Entries ({nip65Parsed.result.invalidEntries.length})
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50/70 divide-y divide-amber-100 text-xs">
                      {nip65Parsed.result.invalidEntries.map((bad, idx) => (
                        <div key={idx} className="px-3 py-2 space-y-0.5">
                          <div className="font-mono text-amber-950">{JSON.stringify(bad.tag)}</div>
                          <div className="text-amber-800">{bad.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
                {nip65Parsed.error}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Live NIP-11 Relay Metadata Inspector
              </h2>
              <button
                type="button"
                onClick={() => onSelectNip('11')}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                Read NIP-11
              </button>
            </div>

            <div className="flex gap-2">
              <label htmlFor="nip11-relay-input" className="sr-only">
                Relay WebSocket URL
              </label>
              <input
                id="nip11-relay-input"
                type="url"
                value={nip11RelayUrl}
                onChange={(e) => setNip11RelayUrl(e.target.value)}
                placeholder="wss://relay.damus.io"
                className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleFetchNip11}
                disabled={nip11Loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{nip11Loading ? 'Fetching...' : 'Inspect Relay'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'].map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setNip11RelayUrl(url)}
                  className="font-mono text-slate-600 hover:text-indigo-700 underline underline-offset-2"
                >
                  {url}
                </button>
              ))}
            </div>

            {nip11Error && (
              <div className="p-3.5 rounded-md border border-red-200 bg-red-50 text-xs text-red-800">
                {nip11Error}
              </div>
            )}

            {nip11Result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs border-y border-slate-100 py-3">
                  <div>
                    <div className="text-slate-500">Relay Name</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {nip11Result.name || 'Unnamed relay'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Software</div>
                    <div className="font-mono text-slate-800 mt-0.5 truncate">
                      {nip11Result.version || nip11Result.software || 'Unspecified'}
                    </div>
                  </div>
                </div>

                {Array.isArray(nip11Result.supported_nips) && nip11Result.supported_nips.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-600">
                      Advertised Supported NIPs ({nip11Result.supported_nips.length})
                    </div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1 font-mono text-xs">
                      {nip11Result.supported_nips.map((n) => {
                        const id = String(n).padStart(2, '0');
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => onSelectNip(id)}
                            className="text-indigo-700 hover:underline tabular-nums"
                          >
                            NIP-{id}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <CodeBlock
                  code={JSON.stringify(nip11Result, null, 2)}
                  language="json"
                  title="NIP-11 Response (application/nostr+json)"
                  maxHeightClass="max-h-[300px]"
                />
              </div>
            ) : (
              !nip11Error && (
                <div className="p-6 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-600 leading-relaxed">
                  Click <strong className="font-medium text-slate-800">Inspect Relay</strong> to query a live public Nostr relay with <code className="font-mono">Accept: application/nostr+json</code> and view its supported NIPs and rate limits.
                </div>
              )
            )}
          </section>
        </div>
      )}

      {/* TAB 4: NIP-01 Filter Tester */}
      {activeTab === 'filters' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">NIP-01 Subscription Filters</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Fields inside a filter object combine with logical AND; multiple filter objects in the array combine with logical OR.
            </p>
            <label htmlFor="filter-json-input" className="sr-only">
              NIP-01 Filter JSON
            </label>
            <textarea
              id="filter-json-input"
              rows={9}
              value={filterJson}
              onChange={(e) => setFilterJson(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
            />
            {filterEvaluation.ok ? (
              <div
                className={`p-3.5 rounded-md border text-xs font-medium flex items-center gap-2 ${
                  filterEvaluation.matched
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {filterEvaluation.matched ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {filterEvaluation.matched
                    ? `Matched event against ${filterEvaluation.filterCount} filter(s)`
                    : `No match across ${filterEvaluation.filterCount} filter(s)`}
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
                {filterEvaluation.error}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="text-xs text-slate-600">
              Evaluating against {signedEvent ? 'your signed event from Tab 1' : 'default sample kind:1 event'}:
            </div>
            <CodeBlock
              code={JSON.stringify(sampleFilterEvent, null, 2)}
              language="json"
              title="Target NostrEvent"
            />
          </section>
        </div>
      )}

      {/* TAB 5: Delivery Planner (SDK Engineering Add-On) */}
      {activeTab === 'delivery' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-950">
            <strong className="font-semibold">
              SDK Engineering Add-On — Not part of the official NIP documents:
            </strong>{' '}
            Dry-runs <code className="font-mono">planRelayDelivery()</code> from{' '}
            <code className="font-mono">src/sdk/delivery.ts</code> locally in your browser with zero network writes. Combines NIP-65 outbox lists, NIP-17/51{' '}
            <code className="font-mono">kind:10050</code> DM inboxes, NIP-42 AUTH gating, and NIP-70 protected tags with caller relay allowlists.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">1. Delivery Scenario</h2>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onSelectNip('70')}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    NIP-70
                  </button>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => onSelectNip('65')}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    NIP-65
                  </button>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => onSelectNip('17')}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    NIP-17
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-700">Event Type</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {(
                    [
                      [
                        'public',
                        'Public Note (NIP-65 Outbox)',
                        'Routes to author write + mentioned recipient read relays inside allowlist.',
                      ],
                      [
                        'protected',
                        'Protected Note (NIP-70 ["-"])',
                        'Requires verified NIP-42 AUTH before EVENT leaves the client.',
                      ],
                      [
                        'giftwrap',
                        'Private Gift Wrap (kind:1059)',
                        'Restricted strictly to verified kind:10050 inbox relays; never widens to defaults.',
                      ],
                    ] as const
                  ).map(([id, title, desc]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDeliveryScenario(id)}
                      className={`text-left px-3 py-2.5 rounded-md border transition-colors ${
                        deliveryScenario === id
                          ? 'bg-indigo-50/75 border-indigo-300 text-indigo-950'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="text-xs font-semibold">{title}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {deliveryScenario === 'giftwrap' && (
                <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={includeDmInbox}
                    onChange={(e) => setIncludeDmInbox(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    Include verified recipient <code className="font-mono">kind:10050</code> DM inbox list (uncheck to verify private delivery refuses public fallback)
                  </span>
                </label>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="delivery-allowed-relays"
                  className="block text-xs font-medium text-slate-700"
                >
                  Caller-Approved Relay Allowlist (comma-separated)
                </label>
                <textarea
                  id="delivery-allowed-relays"
                  rows={2}
                  value={deliveryAllowedRelays}
                  onChange={(e) => setDeliveryAllowedRelays(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500">
                  Signed lists also advertise <code className="font-mono">wss://untrusted.relay.example</code> and <code className="font-mono">wss://unapproved-inbox.example</code> to demonstrate allowlist exclusion.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="delivery-redundancy"
                  className="block text-xs font-medium text-slate-700"
                >
                  Target Redundancy (positive OKs)
                </label>
                <input
                  id="delivery-redundancy"
                  type="number"
                  min={1}
                  max={6}
                  value={deliveryRedundancy}
                  onChange={(e) =>
                    setDeliveryRedundancy(Math.max(1, Math.min(6, Number(e.target.value) || 1)))
                  }
                  className="w-28 px-3 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md tabular-nums"
                />
              </div>
            </section>

            <section className="lg:col-span-7 space-y-5">
              {deliveryDryRun.ok ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-slate-200 rounded-lg p-4">
                    <div>
                      <div className="text-xs text-slate-500">Delivery Mode</div>
                      <div className="text-sm font-semibold font-mono text-slate-900 mt-1">
                        {deliveryDryRun.plan.mode}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">NIP-42 AUTH Gate</div>
                      <div
                        className={`text-sm font-semibold mt-1 ${
                          deliveryDryRun.plan.requireAuthBeforeSend
                            ? 'text-amber-800'
                            : 'text-slate-900'
                        }`}
                      >
                        {deliveryDryRun.plan.requireAuthBeforeSend
                          ? 'Required before send'
                          : 'Standard publish'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Targets / Excluded</div>
                      <div className="text-sm font-semibold font-mono text-slate-900 mt-1 tabular-nums">
                        {deliveryDryRun.plan.targets.length} approved ·{' '}
                        {deliveryDryRun.plan.excluded.length} blocked
                      </div>
                    </div>
                  </div>

                  {deliveryDryRun.plan.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-1.5">
                      <div className="text-xs font-semibold text-amber-950">
                        Planner Safety Warnings ({deliveryDryRun.plan.warnings.length})
                      </div>
                      <ul className="space-y-1 text-xs text-amber-900">
                        {deliveryDryRun.plan.warnings.map((w, idx) => (
                          <li key={idx}>· {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
                        Approved Relay Targets ({deliveryDryRun.plan.targets.length})
                      </div>
                      {deliveryDryRun.plan.targets.length === 0 ? (
                        <div className="p-3.5 text-xs text-slate-500">
                          No relays approved — transmission safely halted.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 text-xs">
                          {deliveryDryRun.plan.targets.map((t) => (
                            <div key={t.relay} className="px-3.5 py-2.5 space-y-0.5">
                              <div className="font-mono text-slate-900 truncate">{t.relay}</div>
                              <div className="text-[11px] text-slate-500">
                                {t.source}
                                {t.requireAuthBeforeSend ? ' · AUTH required' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
                        Excluded Relay Hints ({deliveryDryRun.plan.excluded.length})
                      </div>
                      {deliveryDryRun.plan.excluded.length === 0 ? (
                        <div className="p-3.5 text-xs text-slate-500">
                          No hints excluded by allowlist.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 text-xs">
                          {deliveryDryRun.plan.excluded.map((ex, idx) => (
                            <div key={`${ex.relay}-${idx}`} className="px-3.5 py-2.5 space-y-0.5">
                              <div className="font-mono text-slate-800 truncate">{ex.relay}</div>
                              <div className="text-[11px] text-amber-800">{ex.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <CodeBlock
                    code={JSON.stringify(deliveryDryRun.plan, null, 2)}
                    language="json"
                    title="Computed RelayDeliveryPlan (src/sdk/delivery.ts)"
                    maxHeightClass="max-h-[300px]"
                  />
                </>
              ) : (
                <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {deliveryDryRun.error}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
