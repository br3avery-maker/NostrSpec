import {
  classifyEventKind,
  matchFilter,
  resolveReplaceableEvent,
  verifyEvent,
} from './nip01';
import { normalizeRelayUrl } from './nip65';
import type {
  Hex32,
  Nip11RelayInfo,
  NostrEvent,
  NostrFilter,
  RelayPublishResult,
  RelayToClientMessage,
  SubscriptionHandle,
} from './types';

const HEX_64_RE = /^[0-9a-f]{64}$/;

/** Minimal WebSocket interface so transports can be injected in tests and non-DOM runtimes. */
export interface MinimalWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}

export type WebSocketConstructor = new (url: string) => MinimalWebSocket;

function makeSubId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ns_${Date.now().toString(36)}_${rand}`;
}

/**
 * Fetches a relay's NIP-11 Relay Information Document using `Accept: application/nostr+json`.
 */
export async function fetchRelayInfo(relayUrl: string, signal?: AbortSignal): Promise<Nip11RelayInfo> {
  const normalized = normalizeRelayUrl(relayUrl, { allowInsecureWs: true });
  const httpUrl = normalized.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

  const res = await fetch(httpUrl, {
    headers: { Accept: 'application/nostr+json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`NIP-11 request failed with HTTP ${res.status}`);
  }
  return (await res.json()) as Nip11RelayInfo;
}

export type SingleRelayQueryStatus =
  | 'eose'
  | 'limit-reached'
  | 'closed'
  | 'error'
  | 'timeout'
  | 'aborted';

export interface SingleRelayQueryResult {
  relay: string;
  status: SingleRelayQueryStatus;
  events: NostrEvent[];
  error?: string;
}

export interface QueryRelayOptions {
  timeoutMs?: number;
  maxEvents?: number;
  signal?: AbortSignal;
  verify?: boolean;
  SocketCtor?: WebSocketConstructor;
}

/**
 * Queries a single relay with strict client-side NIP-01 filter verification,
 * BIP-340 signature verification, memory bounds (`maxEvents`), AbortSignal support,
 * and honest failure reporting (never disguises connection errors as empty EOSE results).
 */
export async function queryRelayDetailed(
  rawRelayUrl: string,
  filter: NostrFilter,
  options: QueryRelayOptions = {},
): Promise<SingleRelayQueryResult> {
  const relay = normalizeRelayUrl(rawRelayUrl, { allowInsecureWs: true });
  const SocketCtor = options.SocketCtor ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
  if (!SocketCtor) {
    return { relay, status: 'error', events: [], error: 'WebSocket transport unavailable' };
  }

  const maxEvents = options.maxEvents ?? 500;
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) {
    throw new RangeError('maxEvents must be a positive integer');
  }
  if (filter.limit !== undefined && (!Number.isSafeInteger(filter.limit) || filter.limit < 0)) {
    throw new RangeError('filter.limit must be a non-negative integer');
  }
  const cap = filter.limit !== undefined ? Math.min(maxEvents, filter.limit) : maxEvents;
  const timeoutMs = options.timeoutMs ?? 6000;
  const verify = options.verify ?? true;

  if (options.signal?.aborted) {
    return { relay, status: 'aborted', events: [], error: 'Relay query cancelled' };
  }

  return new Promise<SingleRelayQueryResult>((resolve) => {
    const subId = makeSubId();
    const seen = new Map<string, NostrEvent>();
    let settled = false;
    let opened = false;
    let ws: MinimalWebSocket;

    try {
      ws = new SocketCtor(relay);
    } catch (err) {
      resolve({
        relay,
        status: 'error',
        events: [],
        error: err instanceof Error ? err.message : 'Failed to create WebSocket',
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
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(['CLOSE', subId]));
        }
        ws.close();
      } catch {
        // ignore close errors
      }
    };

    const finish = (status: SingleRelayQueryStatus, error?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      const events = Array.from(seen.values()).sort((a, b) => b.created_at - a.created_at);
      resolve({ relay, status, events, error });
    };

    const onAbort = () => finish('aborted', 'Relay query cancelled');
    const onOpen = () => {
      opened = true;
      ws.send(JSON.stringify(['REQ', subId, filter]));
    };
    const onError = () => finish('error', 'Relay WebSocket error');
    const onClose = () => {
      if (!settled) {
        finish('error', opened ? 'Relay closed before EOSE' : 'Relay failed to connect');
      }
    };
    const onMessage = (evt: { data?: unknown }) => {
      if (settled || typeof evt.data !== 'string') return;
      let msg: RelayToClientMessage;
      try {
        msg = JSON.parse(evt.data) as RelayToClientMessage;
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[1] !== subId) return;

      if (msg[0] === 'EVENT' && msg[2]) {
        const candidate = msg[2];
        if (seen.has(candidate.id)) return;
        if (verify && !verifyEvent(candidate)) return;
        // Enforce client-side NIP-01 filter match so buggy relays cannot inject unrelated events
        if (!matchFilter(filter, candidate)) return;
        if (cap > 0) {
          seen.set(candidate.id, candidate);
          if (seen.size >= cap) {
            finish('limit-reached');
          }
        }
      } else if (msg[0] === 'EOSE') {
        finish('eose');
      } else if (msg[0] === 'CLOSED') {
        finish('closed', String(msg[2] ?? 'Relay closed subscription'));
      }
    };

    const timer = setTimeout(() => finish('timeout', 'Relay EOSE timeout'), timeoutMs);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}

export interface ReplaceableBatchResult {
  events: Map<Hex32, NostrEvent>;
  failures: Array<{ author: Hex32; relay: string; status: SingleRelayQueryStatus; error?: string }>;
  queriedPairs: number;
  succeededPairs: number;
}

/**
 * SDK Engineering Add-On: Queries replaceable events (e.g. kind:0 profiles, kind:10002 relay lists,
 * kind:10050 DM inboxes, kind:3 follows) with isolated per-author budgets and a strict concurrency cap
 * so one author's revision history can never starve other authors.
 */
export async function fetchReplaceableBatch(
  relays: string[],
  kind: number,
  authors: Hex32[],
  options: QueryRelayOptions & { maxConcurrency?: number; perAuthorLimit?: number } = {},
): Promise<ReplaceableBatchResult> {
  if (classifyEventKind(kind) !== 'replaceable') {
    throw new RangeError(`fetchReplaceableBatch requires a replaceable kind (0, 3, or 10000..19999); got ${kind}`);
  }

  const uniqueAuthors = Array.from(new Set(authors.filter((a) => HEX_64_RE.test(a))));
  const uniqueRelays = Array.from(
    new Set(relays.map((r) => normalizeRelayUrl(r, { allowInsecureWs: true }))),
  );
  const concurrency = Math.max(1, Math.min(32, options.maxConcurrency ?? 16));
  const perAuthorLimit = Math.max(1, Math.min(100, options.perAuthorLimit ?? 10));

  const pairs: Array<{ author: Hex32; relay: string }> = [];
  for (const author of uniqueAuthors) {
    for (const relay of uniqueRelays) {
      pairs.push({ author, relay });
    }
  }

  const bestByAuthor = new Map<Hex32, NostrEvent>();
  const failures: ReplaceableBatchResult['failures'] = [];
  let succeededPairs = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pairs.length) {
      if (options.signal?.aborted) break;
      const idx = cursor++;
      const { author, relay } = pairs[idx];
      const result = await queryRelayDetailed(
        relay,
        { kinds: [kind], authors: [author], limit: perAuthorLimit },
        { ...options, maxEvents: perAuthorLimit },
      );

      if (result.status === 'eose' || result.status === 'limit-reached') {
        succeededPairs++;
        for (const ev of result.events) {
          if (ev.pubkey !== author || ev.kind !== kind) continue;
          const prev = bestByAuthor.get(author);
          bestByAuthor.set(author, prev ? resolveReplaceableEvent(prev, ev) : ev);
        }
      } else {
        failures.push({ author, relay, status: result.status, error: result.error });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pairs.length) }, () => worker());
  await Promise.all(workers);

  return {
    events: bestByAuthor,
    failures,
    queriedPairs: pairs.length,
    succeededPairs,
  };
}

export interface SubscribeCallbacks {
  onevent: (event: NostrEvent, relay: string) => void;
  oneose?: (relay: string) => void;
  onclosed?: (reason: string, relay: string) => void;
}

export interface MultiRelayQueryReport {
  events: NostrEvent[];
  relayResults: SingleRelayQueryResult[];
  succeededRelays: string[];
  failedRelays: string[];
}

/**
 * Shared Nostr WebSocket RelayPool supporting bounded queries (`queryWithReport`, `querySync`),
 * persistent subscriptions (`subscribe`), and per-relay acknowledged publishing (`publish`).
 * Own one pool per application session and always close subscriptions on unmount.
 */
export class RelayPool {
  private sockets = new Map<string, Promise<MinimalWebSocket>>();
  private readonly SocketCtor: WebSocketConstructor;

  constructor(SocketCtor?: WebSocketConstructor) {
    this.SocketCtor = SocketCtor ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
  }

  private getSocket(rawRelayUrl: string, timeoutMs = 6000): Promise<MinimalWebSocket> {
    const url = normalizeRelayUrl(rawRelayUrl, { allowInsecureWs: true });
    const existing = this.sockets.get(url);
    if (existing) return existing;

    const promise = new Promise<MinimalWebSocket>((resolve, reject) => {
      if (!this.SocketCtor) {
        reject(new Error('WebSocket API is unavailable in this runtime'));
        return;
      }
      const ws = new this.SocketCtor(url);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore close errors
        }
        this.sockets.delete(url);
        reject(new Error(`Timed out connecting to ${url}`));
      }, timeoutMs);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(ws);
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        this.sockets.delete(url);
        reject(new Error(`WebSocket connection failed for ${url}`));
      });
      ws.addEventListener('close', () => {
        this.sockets.delete(url);
      });
    });

    this.sockets.set(url, promise);
    return promise;
  }

  /**
   * Opens a persistent NIP-01 subscription across one or more relays with automatic
   * BIP-340 verification, client-side filter matching, and duplicate ID deduplication.
   */
  subscribe(
    relays: string[],
    filter: NostrFilter,
    callbacks: SubscribeCallbacks,
  ): SubscriptionHandle {
    const subId = makeSubId();
    const seenIds = new Set<string>();
    const cleanups: Array<() => void> = [];
    let closed = false;

    for (const relay of relays) {
      this.getSocket(relay)
        .then((ws) => {
          if (closed || ws.readyState !== 1) return;

          const onMessage = (evt: { data?: unknown }) => {
            if (closed || typeof evt.data !== 'string') return;
            let parsed: RelayToClientMessage;
            try {
              parsed = JSON.parse(evt.data) as RelayToClientMessage;
            } catch {
              return;
            }
            if (!Array.isArray(parsed)) return;

            if (parsed[0] === 'EVENT' && parsed[1] === subId && parsed[2]) {
              const nostrEvent = parsed[2];
              if (seenIds.has(nostrEvent.id)) return;
              if (!verifyEvent(nostrEvent)) return;
              if (!matchFilter(filter, nostrEvent)) return;
              seenIds.add(nostrEvent.id);
              callbacks.onevent(nostrEvent, relay);
            } else if (parsed[0] === 'EOSE' && parsed[1] === subId) {
              callbacks.oneose?.(relay);
            } else if (parsed[0] === 'CLOSED' && parsed[1] === subId) {
              callbacks.onclosed?.(parsed[2] ?? 'closed', relay);
            }
          };

          ws.addEventListener('message', onMessage);
          ws.send(JSON.stringify(['REQ', subId, filter]));

          cleanups.push(() => {
            ws.removeEventListener('message', onMessage);
            if (ws.readyState === 1) {
              ws.send(JSON.stringify(['CLOSE', subId]));
            }
          });
        })
        .catch(() => {
          callbacks.onclosed?.('connection failed', relay);
        });
    }

    return {
      close: () => {
        if (closed) return;
        closed = true;
        for (const fn of cleanups) fn();
      },
    };
  }

  /**
   * Runs a bounded NIP-01 query across relays and returns deduplicated verified events
   * alongside honest per-relay status outcomes (distinguishing EOSE empty from transport failure).
   */
  async queryWithReport(
    relays: string[],
    filter: NostrFilter,
    options: Omit<QueryRelayOptions, 'SocketCtor'> = {},
  ): Promise<MultiRelayQueryReport> {
    const relayResults = await Promise.all(
      relays.map((relay) =>
        queryRelayDetailed(relay, filter, { ...options, SocketCtor: this.SocketCtor }),
      ),
    );

    const dedup = new Map<string, NostrEvent>();
    const succeededRelays: string[] = [];
    const failedRelays: string[] = [];

    for (const res of relayResults) {
      if (res.status === 'eose' || res.status === 'limit-reached') {
        succeededRelays.push(res.relay);
      } else {
        failedRelays.push(res.relay);
      }
      for (const ev of res.events) {
        if (!dedup.has(ev.id)) dedup.set(ev.id, ev);
      }
    }

    const events = Array.from(dedup.values()).sort((a, b) => b.created_at - a.created_at);
    return { events, relayResults, succeededRelays, failedRelays };
  }

  /**
   * Convenience wrapper returning deduplicated verified events from `queryWithReport`.
   */
  async querySync(
    relays: string[],
    filter: NostrFilter,
    timeoutMs = 5000,
  ): Promise<NostrEvent[]> {
    const report = await this.queryWithReport(relays, filter, { timeoutMs });
    return report.events;
  }

  /**
   * Publishes a verified signed event to each relay and collects per-relay OK acknowledgments.
   */
  async publish(
    relays: string[],
    event: NostrEvent,
    timeoutMs = 6000,
  ): Promise<RelayPublishResult[]> {
    if (!verifyEvent(event)) {
      throw new Error('Refusing to publish an event that fails NIP-01 signature verification');
    }

    const attempts = relays.map(async (relay): Promise<RelayPublishResult> => {
      try {
        const ws = await this.getSocket(relay, timeoutMs);
        return await new Promise<RelayPublishResult>((resolve) => {
          const timer = setTimeout(() => {
            ws.removeEventListener('message', onMessage);
            resolve({
              relay,
              accepted: false,
              message: 'Timed out waiting for relay OK acknowledgment',
              error: 'timeout',
            });
          }, timeoutMs);

          const onMessage = (evt: { data?: unknown }) => {
            if (typeof evt.data !== 'string') return;
            try {
              const msg = JSON.parse(evt.data) as RelayToClientMessage;
              if (Array.isArray(msg) && msg[0] === 'OK' && msg[1] === event.id) {
                clearTimeout(timer);
                ws.removeEventListener('message', onMessage);
                resolve({
                  relay,
                  accepted: msg[2] === true,
                  message: String(msg[3] ?? ''),
                });
              }
            } catch {
              // ignore malformed wire frames
            }
          };

          ws.addEventListener('message', onMessage);
          ws.send(JSON.stringify(['EVENT', event]));
        });
      } catch (err) {
        return {
          relay,
          accepted: false,
          message: err instanceof Error ? err.message : 'Connection failed',
          error: 'transport',
        };
      }
    });

    const settled = await Promise.allSettled(attempts);
    return settled.map((entry, idx) =>
      entry.status === 'fulfilled'
        ? entry.value
        : {
            relay: relays[idx],
            accepted: false,
            message: String(entry.reason),
            error: 'unknown',
          },
    );
  }

  /** Closes all active WebSocket connections held by this pool. */
  closeAll(): void {
    for (const [, socketPromise] of this.sockets) {
      socketPromise
        .then((ws) => {
          if (ws.readyState === 1 || ws.readyState === 0) {
            ws.close();
          }
        })
        .catch(() => {
          // ignore
        });
    }
    this.sockets.clear();
  }
}
