import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { nowSeconds } from './nip01';
import type { EventTemplate, NostrEvent } from './types';

function encodeBase64Utf8(str: string): string {
  const bytes = utf8ToBytes(str);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds an unsigned NIP-42 Relay Authentication event template (`kind: 22242`).
 */
export function createRelayAuthTemplate(
  relayUrl: string,
  challenge: string,
  createdAt = nowSeconds(),
): EventTemplate {
  if (!challenge.trim()) {
    throw new Error('NIP-42 challenge must be a non-empty string');
  }
  return {
    kind: 22242,
    created_at: createdAt,
    tags: [
      ['relay', relayUrl],
      ['challenge', challenge],
    ],
    content: '',
  };
}

/**
 * Builds an unsigned NIP-98 HTTP Auth event template (`kind: 27235`).
 * Includes a SHA-256 `payload` tag when an HTTP request body is supplied.
 */
export function createNip98AuthTemplate(params: {
  url: string;
  method: string;
  body?: string | Uint8Array;
  createdAt?: number;
}): EventTemplate {
  const parsed = new URL(params.url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('NIP-98 URL must use http: or https:');
  }
  const method = params.method.toUpperCase();
  const tags: string[][] = [
    ['u', parsed.toString()],
    ['method', method],
  ];

  if (params.body !== undefined) {
    const bodyBytes = typeof params.body === 'string' ? utf8ToBytes(params.body) : params.body;
    tags.push(['payload', bytesToHex(sha256(bodyBytes))]);
  }

  return {
    kind: 27235,
    created_at: params.createdAt ?? nowSeconds(),
    tags,
    content: '',
  };
}

/**
 * Encodes a signed NIP-98 (`kind: 27235`) event as an HTTP `Authorization` header value.
 */
export function encodeNip98Header(signedEvent: NostrEvent): string {
  if (signedEvent.kind !== 27235) {
    throw new Error(`Expected kind 27235 for NIP-98 header, got ${signedEvent.kind}`);
  }
  return `Nostr ${encodeBase64Utf8(JSON.stringify(signedEvent))}`;
}

export type BlossomAction = 'get' | 'upload' | 'list' | 'delete';

/**
 * Builds an unsigned Blossom (NIP-B7 / BUD-11) scoped authorization event template (`kind: 24242`).
 * Distinct from NIP-98: uses `t` action tag, `expiration` timestamp, and optional `x` SHA-256 hashes.
 */
export function createBlossomAuthTemplate(params: {
  action: BlossomAction;
  description: string;
  expirationSeconds?: number;
  sha256Hashes?: string[];
  createdAt?: number;
}): EventTemplate {
  const createdAt = params.createdAt ?? nowSeconds();
  const expiration = createdAt + (params.expirationSeconds ?? 300);
  const tags: string[][] = [
    ['t', params.action],
    ['expiration', String(expiration)],
  ];

  for (const hash of params.sha256Hashes ?? []) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`Invalid SHA-256 blob hash: "${hash}"`);
    }
    tags.push(['x', hash]);
  }

  return {
    kind: 24242,
    created_at: createdAt,
    tags,
    content: params.description,
  };
}

/**
 * Encodes a signed Blossom (`kind: 24242`) event as an HTTP `Authorization` header value.
 */
export function encodeBlossomAuthHeader(signedEvent: NostrEvent): string {
  if (signedEvent.kind !== 24242) {
    throw new Error(`Expected kind 24242 for Blossom header, got ${signedEvent.kind}`);
  }
  return `Nostr ${encodeBase64Utf8(JSON.stringify(signedEvent))}`;
}
