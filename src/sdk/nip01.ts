import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type {
  EventStorageClass,
  EventTemplate,
  Hex32,
  NostrEvent,
  NostrFilter,
  UnsignedEvent,
} from './types';

const HEX_64_RE = /^[0-9a-f]{64}$/;
const HEX_128_RE = /^[0-9a-f]{128}$/;

/**
 * Checks for unpaired UTF-16 surrogate code units so canonical UTF-8
 * event serialization never silently alters bytes across runtimes.
 */
export function hasLoneSurrogate(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/**
 * Generates a cryptographically random 32-byte secp256k1 secret key.
 */
export function generateSecretKey(): Uint8Array {
  return schnorr.utils.randomSecretKey();
}

/**
 * Derives the 64-character lowercase hex x-only BIP-340 public key from a secret key.
 */
export function getPublicKey(secretKey: Uint8Array | string): Hex32 {
  const skBytes = typeof secretKey === 'string' ? hexToBytes(secretKey) : secretKey;
  if (skBytes.length !== 32) {
    throw new Error('Secret key must be exactly 32 bytes');
  }
  return bytesToHex(schnorr.getPublicKey(skBytes));
}

/**
 * Produces the canonical NIP-01 JSON array serialization:
 * `[0, <pubkey>, <created_at>, <kind>, <tags>, <content>]`
 */
export function serializeEvent(event: UnsignedEvent): string {
  if (!HEX_64_RE.test(event.pubkey)) {
    throw new Error('Event pubkey must be a 64-character lowercase hex string');
  }
  if (!Number.isSafeInteger(event.created_at) || event.created_at < 0) {
    throw new Error('Event created_at must be a non-negative Unix timestamp in seconds');
  }
  if (!Number.isInteger(event.kind) || event.kind < 0 || event.kind > 65535) {
    throw new Error('Event kind must be an integer between 0 and 65535');
  }
  if (!Array.isArray(event.tags)) {
    throw new Error('Event tags must be an array of string arrays');
  }
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.some((item) => typeof item !== 'string' || hasLoneSurrogate(item))) {
      throw new Error('Every tag entry must be a valid UTF-8 string');
    }
  }
  if (typeof event.content !== 'string' || hasLoneSurrogate(event.content)) {
    throw new Error('Event content must be a valid UTF-8 string');
  }

  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

/**
 * Computes the canonical NIP-01 SHA-256 event ID (lowercase 64-char hex).
 */
export function getEventHash(event: UnsignedEvent): Hex32 {
  const serialized = serializeEvent(event);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
}

/**
 * Completes an EventTemplate with pubkey, SHA-256 id, and BIP-340 Schnorr signature.
 * Returns a frozen immutable event object.
 */
export function finalizeEvent(template: EventTemplate, secretKey: Uint8Array | string): Readonly<NostrEvent> {
  const skBytes = typeof secretKey === 'string' ? hexToBytes(secretKey) : secretKey;
  const pubkey = getPublicKey(skBytes);
  const unsigned: UnsignedEvent = {
    pubkey,
    created_at: template.created_at,
    kind: template.kind,
    tags: template.tags.map((t) => [...t]),
    content: template.content,
  };
  const id = getEventHash(unsigned);
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), skBytes));

  return Object.freeze({
    id,
    pubkey: unsigned.pubkey,
    created_at: unsigned.created_at,
    kind: unsigned.kind,
    tags: unsigned.tags,
    content: unsigned.content,
    sig,
  });
}

export interface EventShapeCheck {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the syntactic shape of a NostrEvent without performing signature verification.
 */
export function validateEventShape(candidate: unknown): EventShapeCheck {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['Event must be a JSON object'] };
  }
  const ev = candidate as Record<string, unknown>;

  if (typeof ev.id !== 'string' || !HEX_64_RE.test(ev.id)) {
    errors.push('id must be a 64-character lowercase hex string');
  }
  if (typeof ev.pubkey !== 'string' || !HEX_64_RE.test(ev.pubkey)) {
    errors.push('pubkey must be a 64-character lowercase hex string');
  }
  if (typeof ev.sig !== 'string' || !HEX_128_RE.test(ev.sig)) {
    errors.push('sig must be a 128-character lowercase hex string');
  }
  if (typeof ev.created_at !== 'number' || !Number.isSafeInteger(ev.created_at) || ev.created_at < 0) {
    errors.push('created_at must be a non-negative integer Unix timestamp in seconds');
  }
  if (typeof ev.kind !== 'number' || !Number.isInteger(ev.kind) || ev.kind < 0 || ev.kind > 65535) {
    errors.push('kind must be an integer in 0..65535');
  }
  if (!Array.isArray(ev.tags)) {
    errors.push('tags must be an array of string arrays');
  } else {
    for (let i = 0; i < ev.tags.length; i++) {
      const tag = ev.tags[i];
      if (!Array.isArray(tag) || tag.some((v) => typeof v !== 'string')) {
        errors.push(`tags[${i}] must be an array of strings`);
        break;
      }
    }
  }
  if (typeof ev.content !== 'string') {
    errors.push('content must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verifies both the canonical SHA-256 event hash and BIP-340 Schnorr signature.
 * Reconstructs only the seven canonical fields so cached symbols cannot bypass verification.
 */
export function verifyEvent(event: NostrEvent): boolean {
  const shape = validateEventShape(event);
  if (!shape.valid) return false;

  try {
    const cleanUnsigned: UnsignedEvent = {
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags.map((t) => [...t]),
      content: event.content,
    };
    const expectedId = getEventHash(cleanUnsigned);
    if (expectedId !== event.id) return false;

    return schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey),
    );
  } catch {
    return false;
  }
}

/**
 * Classifies an event kind according to NIP-01 storage and replacement rules:
 * - Replaceable: 0, 3, or 10000 <= kind < 20000
 * - Ephemeral: 20000 <= kind < 30000
 * - Addressable (Parameterized Replaceable): 30000 <= kind < 40000
 * - Regular: 1, 2, 4..9999, and 40000..65535
 */
export function classifyEventKind(kind: number): EventStorageClass {
  if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
    return 'replaceable';
  }
  if (kind >= 20000 && kind < 30000) {
    return 'ephemeral';
  }
  if (kind >= 30000 && kind < 40000) {
    return 'addressable';
  }
  return 'regular';
}

/**
 * Extracts the first `d` tag value for an addressable event (defaults to empty string per NIP-01).
 */
export function getAddressableIdentifier(event: Pick<NostrEvent, 'tags'>): string {
  const dTag = event.tags.find((t) => t[0] === 'd');
  return dTag && typeof dTag[1] === 'string' ? dTag[1] : '';
}

/**
 * Computes the logical storage key for replaceable/addressable events, or event ID for regular events.
 */
export function getEventStorageKey(event: Pick<NostrEvent, 'id' | 'pubkey' | 'kind' | 'tags'>): string {
  const storageClass = classifyEventKind(event.kind);
  if (storageClass === 'replaceable') {
    return `${event.kind}:${event.pubkey}`;
  }
  if (storageClass === 'addressable') {
    return `${event.kind}:${event.pubkey}:${getAddressableIdentifier(event)}`;
  }
  return event.id;
}

/**
 * NIP-01 conflict resolution for replaceable and addressable events.
 * Newer `created_at` wins; on equal timestamp, the lowest lexicographic `id` wins.
 */
export function resolveReplaceableEvent(current: NostrEvent, incoming: NostrEvent): NostrEvent {
  if (incoming.created_at > current.created_at) return incoming;
  if (incoming.created_at < current.created_at) return current;
  return incoming.id < current.id ? incoming : current;
}

/**
 * Tests whether a single NIP-01 filter matches an event.
 * Fields within a filter combine with AND; values inside each array combine with OR.
 */
export function matchFilter(filter: NostrFilter, event: NostrEvent): boolean {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
  if (typeof filter.until === 'number' && event.created_at > filter.until) return false;

  for (const key of Object.keys(filter)) {
    if (key.startsWith('#') && key.length === 2) {
      const tagName = key.slice(1);
      const allowedValues = filter[key as `#${string}`];
      if (!allowedValues || allowedValues.length === 0) continue;

      const hasMatch = event.tags.some(
        (tag) => tag.length >= 2 && tag[0] === tagName && allowedValues.includes(tag[1]),
      );
      if (!hasMatch) return false;
    }
  }

  return true;
}

/**
 * Tests whether any filter in a NIP-01 REQ subscription matches an event (OR across filters).
 */
export function matchFilters(filters: NostrFilter[], event: NostrEvent): boolean {
  return filters.some((filter) => matchFilter(filter, event));
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
