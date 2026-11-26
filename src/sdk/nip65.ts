import { nowSeconds } from './nip01';
import type { EventTemplate, NostrEvent, RelayAccessRole, RelayEndpoint } from './types';

export interface RelayListParseResult {
  endpoints: RelayEndpoint[];
  invalidEntries: Array<{ tag: string[]; reason: string }>;
}

/**
 * Validates and normalizes a WebSocket relay URL according to strict Nostr engineering rules:
 * - Only `wss:` (or `ws:` when allowInsecureWs is true)
 * - No embedded credentials (`user:pass@`)
 * - No URL fragments (`#...`)
 * - Preserves path and query semantics
 */
export function normalizeRelayUrl(rawUrl: string, options?: { allowInsecureWs?: boolean }): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Malformed URL: "${rawUrl}"`);
  }

  const allowedSchemes = options?.allowInsecureWs ? ['wss:', 'ws:'] : ['wss:'];
  if (!allowedSchemes.includes(parsed.protocol)) {
    throw new Error(`Unsupported relay scheme "${parsed.protocol}" (expected ${allowedSchemes.join(' or ')})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Relay URLs must not contain embedded credentials');
  }
  if (parsed.hash) {
    throw new Error('Relay URLs must not contain URL fragments');
  }
  if (!parsed.hostname) {
    throw new Error('Relay URL must include a valid host');
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  const normalized = parsed.toString();
  // Strip trailing slash only when pathname is root '/' and there is no query
  if (parsed.pathname === '/' && !parsed.search && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Parses a NIP-65 `kind: 10002` Relay List Metadata event into deduplicated read/write endpoints.
 * Reports malformed URLs or unknown markers explicitly instead of silently coercing them.
 */
export function parseRelayListEvent(
  event: Pick<NostrEvent, 'kind' | 'tags'>,
  options?: { allowInsecureWs?: boolean },
): RelayListParseResult {
  if (event.kind !== 10002) {
    throw new Error(`NIP-65 relay list requires kind 10002, received kind ${event.kind}`);
  }

  const byUrl = new Map<string, { read: boolean; write: boolean }>();
  const invalidEntries: Array<{ tag: string[]; reason: string }> = [];

  for (const tag of event.tags) {
    if (tag[0] !== 'r') continue;
    const rawUrl = tag[1];
    if (!rawUrl || typeof rawUrl !== 'string') {
      invalidEntries.push({ tag, reason: 'Missing relay URL in r tag' });
      continue;
    }

    let url: string;
    try {
      url = normalizeRelayUrl(rawUrl, options);
    } catch (err) {
      invalidEntries.push({
        tag,
        reason: err instanceof Error ? err.message : 'Invalid relay URL',
      });
      continue;
    }

    const marker = tag[2];
    let read = false;
    let write = false;

    if (marker === undefined || marker === '') {
      read = true;
      write = true;
    } else if (marker === 'read') {
      read = true;
    } else if (marker === 'write') {
      write = true;
    } else {
      invalidEntries.push({
        tag,
        reason: `Unknown NIP-65 role marker "${marker}" (expected "read", "write", or omitted)`,
      });
      continue;
    }

    const existing = byUrl.get(url);
    if (existing) {
      existing.read = existing.read || read;
      existing.write = existing.write || write;
    } else {
      byUrl.set(url, { read, write });
    }
  }

  const endpoints: RelayEndpoint[] = Array.from(byUrl.entries()).map(([url, flags]) => {
    const role: RelayAccessRole =
      flags.read && flags.write ? 'both' : flags.read ? 'read' : 'write';
    return { url, read: flags.read, write: flags.write, role };
  });

  return { endpoints, invalidEntries };
}

/**
 * Builds an unsigned NIP-65 `kind: 10002` Relay List Metadata event template.
 */
export function createRelayListTemplate(
  relays: Array<{ url: string; role?: RelayAccessRole }>,
  createdAt = nowSeconds(),
): EventTemplate {
  const tags: string[][] = [];
  for (const item of relays) {
    const normalized = normalizeRelayUrl(item.url, { allowInsecureWs: true });
    if (!item.role || item.role === 'both') {
      tags.push(['r', normalized]);
    } else {
      tags.push(['r', normalized, item.role]);
    }
  }
  return {
    kind: 10002,
    created_at: createdAt,
    tags,
    content: '',
  };
}
