/**
 * SDK Engineering Add-On (NOT part of the official nostr-protocol/nips specification).
 *
 * Implements hardened relay delivery planning and authenticated publishing policies
 * built on top of NIP-01, NIP-17/59, NIP-42, NIP-65, and NIP-70:
 * - Pre-verification byte & tag bounds against DoS payloads
 * - Explicit caller-approved relay allowlist enforcement
 * - NIP-70 protected events (`["-"]`) never transmitted prior to successful NIP-42 AUTH
 * - Private gift-wrap (`kind: 1059`) delivery restricted strictly to verified `kind: 10050`
 *   recipient inbox relays (never widens to public default relays)
 * - Strict positive OK acknowledgment (negative `duplicate:` OK is never treated as accepted)
 */

import { createRelayAuthTemplate } from './auth';
import {
  classifyEventKind,
  nowSeconds,
  resolveReplaceableEvent,
  verifyEvent,
} from './nip01';
import { normalizeRelayUrl } from './nip65';
import type { MinimalWebSocket, WebSocketConstructor } from './relay';
import type { Hex32, NostrEvent, NostrSigner, RelayToClientMessage } from './types';

const TRANSPORT_AUTH_KINDS = new Set([22242, 24242, 27235]);
const MAX_CONTENT_CHARS = 1_048_576; // 1 MiB
const MAX_TAGS = 4096;
const MAX_TAG_ITEMS = 64;
const MAX_TAG_VALUE_CHARS = 65_536;
const MAX_EVENT_UNITS = 2_097_152;
const MAX_FRAME_BYTES = 2_097_152;
const MAX_DELIVERY_ATTEMPTS = 64;

export type DeliveryMode = 'public-outbox' | 'private-inbox' | 'protected' | 'ephemeral';

export interface PlannedRelayTarget {
  relay: string;
  source: 'author-write' | 'recipient-read' | 'recipient-dm-inbox' | 'default-fallback';
  requireAuthBeforeSend: boolean;
}

export interface ExcludedRelayTarget {
  relay: string;
  reason: string;
}

export interface RelayDeliveryPlan {
  eventId: Hex32;
  kind: number;
  mode: DeliveryMode;
  isProtected: boolean;
  isEphemeral: boolean;
  requireAuthBeforeSend: boolean;
  redundancy: number;
  targets: PlannedRelayTarget[];
  excluded: ExcludedRelayTarget[];
  warnings: string[];
}

export interface PlanRelayDeliveryOptions {
  /** Explicit allowlist of relay URLs this caller permits the SDK to contact. */
  allowedRelays: string[];
  /** Optional public fallback relays (ignored for kind:1059 private inbox delivery). */
  defaults?: string[];
  /** Verified NIP-65 (kind:10002) and NIP-17/51 DM inbox (kind:10050) list events. */
  signedLists?: NostrEvent[];
  /** Desired number of positive relay acknowledgments. */
  redundancy?: number;
  /** Allow insecure ws:// endpoints only for local testing. */
  allowInsecureWs?: boolean;
  /** Override current timestamp (seconds) for deterministic testing. */
  now?: number;
}

/**
 * Enforces strict size and structure bounds before cloning or running BIP-340 verification.
 */
export function assertBoundedRoutingEvent(input: NostrEvent): NostrEvent {
  if (
    !input ||
    typeof input.content !== 'string' ||
    input.content.length > MAX_CONTENT_CHARS ||
    !Array.isArray(input.tags) ||
    input.tags.length > MAX_TAGS
  ) {
    throw new RangeError('Routing event exceeds content or tag count bounds');
  }

  let units = input.content.length;
  for (const tag of input.tags) {
    if (!Array.isArray(tag) || tag.length > MAX_TAG_ITEMS) {
      throw new RangeError('Routing tag exceeds item count bounds');
    }
    for (const val of tag) {
      if (typeof val !== 'string' || val.length > MAX_TAG_VALUE_CHARS) {
        throw new RangeError('Routing tag value exceeds length bounds');
      }
      units += val.length;
      if (units > MAX_EVENT_UNITS) {
        throw new RangeError('Routing event exceeds aggregate size bounds');
      }
    }
  }

  if (!verifyEvent(input)) {
    throw new Error('Routing event failed NIP-01 hash or BIP-340 signature verification');
  }

  const wireBytes = new TextEncoder().encode(JSON.stringify(['EVENT', input])).length;
  if (wireBytes > MAX_FRAME_BYTES) {
    throw new RangeError('Serialized EVENT wire frame exceeds 2 MiB bound');
  }

  return Object.freeze({
    id: input.id,
    pubkey: input.pubkey,
    created_at: input.created_at,
    kind: input.kind,
    tags: input.tags.map((t) => [...t]),
    content: input.content,
    sig: input.sig,
  });
}

/** Returns true when the event carries a NIP-70 protected marker tag `["-"]`. */
export function isProtectedEvent(event: Pick<NostrEvent, 'tags'>): boolean {
  return event.tags.some((tag) => tag.length >= 1 && tag[0] === '-');
}

function collectNewestLists(events: NostrEvent[], now: number): Map<string, NostrEvent> {
  if (events.length > 256) {
    throw new RangeError('Expected at most 256 signed relay list events');
  }
  const newest = new Map<string, NostrEvent>();
  for (const raw of events) {
    let verified: NostrEvent;
    try {
      verified = assertBoundedRoutingEvent(raw);
    } catch {
      continue;
    }
    if ((verified.kind !== 10002 && verified.kind !== 10050) || verified.created_at > now + 60) {
      continue;
    }
    const key = `${verified.kind}:${verified.pubkey}`;
    const existing = newest.get(key);
    newest.set(key, existing ? resolveReplaceableEvent(existing, verified) : verified);
  }
  return newest;
}

function extractRelaysFromList(
  listEvent: NostrEvent | undefined,
  mode: 'read' | 'write' | 'inbox',
  allowInsecureWs: boolean,
): string[] {
  if (!listEvent) return [];
  const urls: string[] = [];
  for (const tag of listEvent.tags) {
    if (mode === 'inbox') {
      if (tag[0] !== 'relay' || !tag[1]) continue;
    } else {
      if (tag[0] !== 'r' || !tag[1]) continue;
      if (tag[2] !== undefined && tag[2] !== '' && tag[2] !== mode) continue;
    }
    try {
      const normalized = normalizeRelayUrl(tag[1], { allowInsecureWs });
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // Ignore malformed hints inside third-party list events
    }
  }
  return urls;
}

/**
 * Pure, deterministic relay delivery planner (SDK Engineering Add-On).
 * Never performs network I/O or signing; callers can inspect and audit the plan before execution.
 */
export function planRelayDelivery(
  rawEvent: NostrEvent,
  options: PlanRelayDeliveryOptions,
): RelayDeliveryPlan {
  const event = assertBoundedRoutingEvent(rawEvent);
  if (TRANSPORT_AUTH_KINDS.has(event.kind)) {
    throw new Error(
      `Kind ${event.kind} is a dedicated transport/HTTP auth event and must not be published as a normal relay event`,
    );
  }

  const allowInsecureWs = options.allowInsecureWs ?? false;
  const now = options.now ?? nowSeconds();
  const redundancy = Math.max(1, Math.min(16, options.redundancy ?? 2));
  const warnings: string[] = [];

  const allowedSet = new Set<string>();
  for (const raw of options.allowedRelays) {
    allowedSet.add(normalizeRelayUrl(raw, { allowInsecureWs }));
  }
  if (allowedSet.size === 0) {
    throw new Error('Supply at least one explicit allowedRelays destination');
  }

  const isProtected = isProtectedEvent(event);
  const isEphemeral = classifyEventKind(event.kind) === 'ephemeral';
  const isGiftWrap = event.kind === 1059;
  const mode: DeliveryMode = isGiftWrap
    ? 'private-inbox'
    : isProtected
      ? 'protected'
      : isEphemeral
        ? 'ephemeral'
        : 'public-outbox';

  const lists = collectNewestLists(options.signedLists ?? [], now);
  const targets: PlannedRelayTarget[] = [];
  const excluded: ExcludedRelayTarget[] = [];
  const seenTargets = new Set<string>();
  const seenExcluded = new Set<string>();

  const consider = (
    relayUrl: string,
    source: PlannedRelayTarget['source'],
  ) => {
    if (seenTargets.has(relayUrl)) return;
    if (!allowedSet.has(relayUrl)) {
      if (!seenExcluded.has(relayUrl)) {
        seenExcluded.add(relayUrl);
        excluded.push({ relay: relayUrl, reason: 'Not present in caller allowedRelays list' });
      }
      return;
    }
    seenTargets.add(relayUrl);
    targets.push({
      relay: relayUrl,
      source,
      requireAuthBeforeSend: isProtected,
    });
  };

  if (isGiftWrap) {
    const recipientPubkeys = Array.from(
      new Set(
        event.tags
          .filter((t) => t[0] === 'p' && typeof t[1] === 'string' && /^[0-9a-f]{64}$/.test(t[1]))
          .map((t) => t[1]),
      ),
    );
    for (const pk of recipientPubkeys) {
      const inboxList = lists.get(`10050:${pk}`);
      for (const url of extractRelaysFromList(inboxList, 'inbox', allowInsecureWs)) {
        consider(url, 'recipient-dm-inbox');
      }
    }
    if (targets.length === 0) {
      warnings.push(
        'No verified kind:10050 recipient DM inbox relays matched allowedRelays. Private delivery will NOT widen to public default relays.',
      );
    }
  } else {
    // 1. Author's NIP-65 write relays
    const authorWrite = extractRelaysFromList(
      lists.get(`10002:${event.pubkey}`),
      'write',
      allowInsecureWs,
    );
    for (const url of authorWrite) {
      consider(url, 'author-write');
    }

    // 2. Mentioned recipients' NIP-65 read relays
    const mentionedPubkeys = Array.from(
      new Set(
        event.tags
          .filter((t) => t[0] === 'p' && typeof t[1] === 'string' && /^[0-9a-f]{64}$/.test(t[1]))
          .map((t) => t[1]),
      ),
    ).slice(0, 16);

    for (const pk of mentionedPubkeys) {
      const recipientRead = extractRelaysFromList(
        lists.get(`10002:${pk}`),
        'read',
        allowInsecureWs,
      );
      for (const url of recipientRead) {
        consider(url, 'recipient-read');
      }
    }

    // 3. Explicit caller defaults (only for non-private events)
    for (const rawDefault of options.defaults ?? []) {
      try {
        const normalized = normalizeRelayUrl(rawDefault, { allowInsecureWs });
        consider(normalized, 'default-fallback');
      } catch {
        // ignore invalid fallback strings
      }
    }
  }

  if (isProtected) {
    warnings.push(
      'Event carries NIP-70 protected tag ["-"]: executor will wait for NIP-42 AUTH approval before transmitting the event.',
    );
  }
  if (isEphemeral) {
    warnings.push(
      'Ephemeral kind (20000..29999): relays are not expected to persist or serve readback.',
    );
  }

  return {
    eventId: event.id,
    kind: event.kind,
    mode,
    isProtected,
    isEphemeral,
    requireAuthBeforeSend: isProtected,
    redundancy,
    targets,
    excluded,
    warnings,
  };
}

export interface VerifiedPublishOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  authSigner?: NostrSigner;
  authPubkey?: Hex32;
  requireAuthentication?: boolean;
  acceptEphemeral?: boolean;
  allowInsecureWs?: boolean;
  SocketCtor?: WebSocketConstructor;
}

export interface VerifiedPublishAttempt {
  relay: string;
  accepted: boolean;
  authenticated: boolean;
  message: string;
  error?: string;
}

/**
 * Publishes one signed event to one relay with strict NIP-42 AUTH gating and exact positive ACK checking.
 * - For `requireAuthentication: true` (e.g. NIP-70 protected events), the EVENT frame is NEVER sent
 *   until the relay sends an AUTH challenge and positively acknowledges the signed kind:22242 response.
 * - A negative OK (including `duplicate: ...`) is never coerced into `accepted: true`.
 */
export async function publishRelayVerified(
  rawRelayUrl: string,
  rawEvent: NostrEvent,
  options: VerifiedPublishOptions = {},
): Promise<VerifiedPublishAttempt> {
  const relay = normalizeRelayUrl(rawRelayUrl, { allowInsecureWs: options.allowInsecureWs });
  const event = assertBoundedRoutingEvent(rawEvent);
  const isEphemeral = classifyEventKind(event.kind) === 'ephemeral';
  if (isEphemeral && !options.acceptEphemeral) {
    return {
      relay,
      accepted: false,
      authenticated: false,
      message: 'Ephemeral event publication requires explicit acceptEphemeral: true',
      error: 'ephemeral-not-opted-in',
    };
  }

  const requireAuth = Boolean(options.requireAuthentication || isProtectedEvent(event));
  if (requireAuth && (!options.authSigner || !options.authPubkey)) {
    return {
      relay,
      accepted: false,
      authenticated: false,
      message: 'Protected or auth-required delivery requires an explicit authSigner and authPubkey',
      error: 'missing-auth-signer',
    };
  }

  const SocketCtor = options.SocketCtor ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
  if (!SocketCtor) {
    return {
      relay,
      accepted: false,
      authenticated: false,
      message: 'WebSocket transport unavailable',
      error: 'transport-unavailable',
    };
  }

  const timeoutMs = Math.max(100, Math.min(120_000, options.timeoutMs ?? 10_000));
  if (options.signal?.aborted) {
    return {
      relay,
      accepted: false,
      authenticated: false,
      message: 'Delivery cancelled before connecting',
      error: 'aborted',
    };
  }

  return new Promise<VerifiedPublishAttempt>((resolve) => {
    let settled = false;
    let authenticated = false;
    let eventSent = false;
    let authAttempted = false;
    let pendingAuthEventId: string | null = null;
    let ws: MinimalWebSocket;

    try {
      ws = new SocketCtor(relay);
    } catch (err) {
      resolve({
        relay,
        accepted: false,
        authenticated: false,
        message: err instanceof Error ? err.message : 'Failed to open WebSocket',
        error: 'transport',
      });
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    const finish = (attempt: VerifiedPublishAttempt) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(attempt);
    };

    const sendEventFrame = () => {
      if (settled || eventSent || ws.readyState !== 1) return;
      eventSent = true;
      ws.send(JSON.stringify(['EVENT', event]));
    };

    const onAbort = () =>
      finish({
        relay,
        accepted: false,
        authenticated,
        message: 'Delivery cancelled',
        error: 'aborted',
      });

    const onOpen = () => {
      if (!requireAuth) {
        sendEventFrame();
      }
      // When requireAuth is true, intentionally wait for the relay's AUTH challenge
      // so a protected event is never disclosed to an unauthenticated relay.
    };

    const onError = () =>
      finish({
        relay,
        accepted: false,
        authenticated,
        message: 'Relay WebSocket error',
        error: 'transport',
      });

    const onClose = () => {
      if (!settled) {
        finish({
          relay,
          accepted: false,
          authenticated,
          message: 'Relay closed connection before acknowledging event',
          error: 'closed',
        });
      }
    };

    const onMessage = async (evt: { data?: unknown }) => {
      if (settled || typeof evt.data !== 'string') return;
      let msg: RelayToClientMessage;
      try {
        msg = JSON.parse(evt.data) as RelayToClientMessage;
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;

      if (msg[0] === 'AUTH' && typeof msg[1] === 'string') {
        if (authAttempted || !options.authSigner || !options.authPubkey) return;
        authAttempted = true;
        const challenge = msg[1];
        try {
          const authTemplate = createRelayAuthTemplate(relay, challenge);
          const signedAuth = await options.authSigner.signEvent(authTemplate);
          // Reject late signer completions if socket closed or timed out while waiting for approval
          if (settled || ws.readyState !== 1) return;
          if (
            signedAuth.pubkey !== options.authPubkey ||
            signedAuth.kind !== 22242 ||
            !verifyEvent(signedAuth)
          ) {
            finish({
              relay,
              accepted: false,
              authenticated: false,
              message: 'Signed NIP-42 AUTH event failed identity or signature checks',
              error: 'invalid-auth-signature',
            });
            return;
          }
          pendingAuthEventId = signedAuth.id;
          ws.send(JSON.stringify(['AUTH', signedAuth]));
        } catch (err) {
          finish({
            relay,
            accepted: false,
            authenticated: false,
            message: err instanceof Error ? err.message : 'NIP-42 AUTH signing failed',
            error: 'auth-rejected',
          });
        }
        return;
      }

      if (msg[0] === 'OK' && pendingAuthEventId && msg[1] === pendingAuthEventId) {
        pendingAuthEventId = null;
        if (msg[2] === true) {
          authenticated = true;
          eventSent = false; // allow retry or initial send after AUTH approval
          sendEventFrame();
        } else {
          finish({
            relay,
            accepted: false,
            authenticated: false,
            message: `Relay rejected NIP-42 AUTH: ${String(msg[3] ?? '')}`,
            error: 'auth-denied',
          });
        }
        return;
      }

      if (msg[0] === 'OK' && msg[1] === event.id) {
        const ok = msg[2] === true;
        const reason = String(msg[3] ?? '');
        if (!ok && /^auth-required:/i.test(reason) && !authenticated && options.authSigner) {
          // Wait for relay AUTH challenge (if not already sent)
          return;
        }
        finish({
          relay,
          accepted: ok,
          authenticated,
          message: reason || (ok ? 'accepted' : 'rejected'),
          error: ok ? undefined : 'relay-rejected',
        });
      }
    };

    const timer = setTimeout(() => {
      finish({
        relay,
        accepted: false,
        authenticated,
        message: requireAuth && !authenticated
          ? 'Timed out waiting for NIP-42 AUTH challenge (protected event was not disclosed)'
          : 'Timed out waiting for relay OK acknowledgment',
        error: 'timeout',
      });
    }, timeoutMs);

    options.signal?.addEventListener('abort', onAbort, { once: true });
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}

export interface ExecuteDeliveryOptions
  extends PlanRelayDeliveryOptions,
    Omit<VerifiedPublishOptions, 'requireAuthentication'> {
  maxAttempts?: number;
}

export interface ExecuteDeliveryResult {
  plan: RelayDeliveryPlan;
  acceptedRelays: string[];
  attempts: VerifiedPublishAttempt[];
  metRedundancy: boolean;
}

/**
 * Recomputes the delivery plan from scratch and executes bounded sequential/redundancy delivery
 * across caller-approved relays.
 */
export async function executeRelayDelivery(
  rawEvent: NostrEvent,
  options: ExecuteDeliveryOptions,
): Promise<ExecuteDeliveryResult> {
  const plan = planRelayDelivery(rawEvent, options);
  const maxAttempts = Math.max(1, Math.min(MAX_DELIVERY_ATTEMPTS, options.maxAttempts ?? 8));
  const acceptedRelays: string[] = [];
  const attempts: VerifiedPublishAttempt[] = [];

  for (const target of plan.targets.slice(0, maxAttempts)) {
    if (options.signal?.aborted) break;
    if (acceptedRelays.length >= plan.redundancy) break;

    const result = await publishRelayVerified(target.relay, rawEvent, {
      ...options,
      requireAuthentication: target.requireAuthBeforeSend,
    });
    attempts.push(result);
    if (result.accepted) {
      acceptedRelays.push(target.relay);
    }
  }

  return {
    plan,
    acceptedRelays,
    attempts,
    metRedundancy: acceptedRelays.length >= plan.redundancy,
  };
}
