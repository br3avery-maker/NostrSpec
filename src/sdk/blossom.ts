/**
 * SDK Engineering Add-On (NOT part of the official nostr-protocol/nips specification).
 *
 * Implements hardened Blossom (NIP-B7 / BUD-11) storage workflows and NIP-92 `imeta` generation:
 * - Strict HTTPS destination normalization (rejects IP literals, `.local`, `.internal`, credentials)
 * - Preflight classification (`200`, `401`, `402`, `400`) with `redirect: 'error'` and `credentials: 'omit'`
 * - Streaming byte-bounded download/replica verification via `ReadableStream` reader
 * - Exact SHA-256 verification and JS MIME equivalence (`text/javascript` vs `application/javascript`)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const HEX_64_RE = /^[0-9a-f]{64}$/;
const MIME_RE = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/;
const JS_MIME_TYPES = new Set([
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
]);

export interface BlobMetadata {
  sha256: string;
  size: number;
  type: string;
}

export type PreflightStatus =
  | 'preflight-accepted'
  | 'auth-required'
  | 'payment-required'
  | 'invalid'
  | 'unavailable';

export interface BlossomPreflightResult {
  server: string;
  status: PreflightStatus;
  httpStatus?: number;
  error?: string;
}

export interface BlossomReplicaVerification {
  server: string;
  verified: boolean;
  httpStatus?: number;
  actualBytes?: number;
  actualSha256?: string;
  contentType?: string;
  error?: string;
}

export interface BlossomTransportOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Computes the lowercase 64-character SHA-256 hex digest of raw bytes. */
export function computeBlobSha256(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

function baseMimeType(raw: string | null | undefined): string {
  return String(raw ?? '').split(';')[0].trim().toLowerCase();
}

export function isCompatibleMimeType(expected: string, actual: string | null | undefined): boolean {
  const exp = baseMimeType(expected);
  const act = baseMimeType(actual);
  if (exp === act) return true;
  return JS_MIME_TYPES.has(exp) && JS_MIME_TYPES.has(act);
}

/**
 * Validates and deduplicates 1–16 explicit HTTPS Blossom server origins.
 * Rejects bare IP literals, localhost, `.local`/`.internal`, credentials, and fragments.
 */
export function normalizeBlossomServers(servers: string[]): string[] {
  if (!Array.isArray(servers) || servers.length === 0 || servers.length > 16) {
    throw new RangeError('Supply between 1 and 16 explicit HTTPS Blossom destinations');
  }

  const normalized: string[] = [];
  for (const raw of servers) {
    if (typeof raw !== 'string' || raw.length > 2048) {
      throw new TypeError('Invalid Blossom server URL');
    }
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      throw new TypeError(`Malformed Blossom URL: "${raw}"`);
    }
    if (parsed.protocol !== 'https:') {
      throw new TypeError(`Blossom server must use https:// (got ${parsed.protocol})`);
    }
    if (parsed.username || parsed.password) {
      throw new TypeError('Blossom URLs must not contain embedded credentials');
    }
    if (parsed.hash) {
      throw new TypeError('Blossom URLs must not contain fragments');
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (
      !host.includes('.') ||
      /^[\d.]+$/.test(host) ||
      host.includes(':') ||
      host === 'localhost' ||
      /\.(localhost|local|internal)$/.test(host)
    ) {
      throw new TypeError(`Unsafe or non-public Blossom destination: "${host}"`);
    }

    parsed.hostname = host;
    const clean = parsed.toString().replace(/\/$/, '');
    if (!normalized.includes(clean)) {
      normalized.push(clean);
    }
  }
  return normalized;
}

async function readStreamBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLengthHeader = response.headers?.get?.('content-length');
  if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Response Content-Length (${declared}) exceeds byte bound (${maxBytes})`);
    }
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error(`Streaming response exceeded byte bound (${maxBytes})`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined;
  }

  const buf = new Uint8Array(await response.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new Error(`Response body (${buf.byteLength}) exceeds byte bound (${maxBytes})`);
  }
  return buf;
}

async function boundedFetch(
  url: string,
  init: RequestInit,
  options: BlossomTransportOptions,
): Promise<Response> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new Error('Fetch API is unavailable in this runtime');
  }
  if (options.signal?.aborted) {
    throw new Error('Blossom operation cancelled');
  }

  const timeoutMs = Math.max(100, Math.min(60_000, options.timeoutMs ?? 15_000));
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (response.redirected) {
      throw new Error('Blossom redirect refused');
    }
    return response;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Checks whether a Blossom server accepts a planned blob via BUD-06 HEAD /upload preflight.
 */
export async function preflightBlossomServer(
  rawServerUrl: string,
  blob: BlobMetadata,
  options: BlossomTransportOptions = {},
): Promise<BlossomPreflightResult> {
  if (!HEX_64_RE.test(blob.sha256) || !Number.isSafeInteger(blob.size) || blob.size < 0 || !MIME_RE.test(blob.type)) {
    throw new TypeError('Invalid blob metadata for Blossom preflight');
  }

  const [server] = normalizeBlossomServers([rawServerUrl]);
  try {
    const res = await boundedFetch(
      `${server}/upload`,
      {
        method: 'HEAD',
        headers: {
          'X-SHA-256': blob.sha256,
          'X-Content-Length': String(blob.size),
          'X-Content-Type': blob.type.toLowerCase(),
        },
      },
      options,
    );

    const statusMap: Record<number, PreflightStatus> = {
      200: 'preflight-accepted',
      400: 'invalid',
      401: 'auth-required',
      402: 'payment-required',
    };
    return {
      server,
      status: statusMap[res.status] ?? 'unavailable',
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      server,
      status: 'unavailable',
      error: err instanceof Error ? err.message : 'Preflight failed',
    };
  }
}

/**
 * Downloads each replica using strict streaming byte caps and independently verifies
 * SHA-256 bytes and compatible Content-Type before claiming a blob is safely mirrored.
 */
export async function verifyBlossomReplicas(
  servers: string[],
  expected: BlobMetadata,
  options: BlossomTransportOptions = {},
): Promise<BlossomReplicaVerification[]> {
  if (!HEX_64_RE.test(expected.sha256) || !Number.isSafeInteger(expected.size) || expected.size < 0) {
    throw new TypeError('Invalid expected blob metadata');
  }
  const normalized = normalizeBlossomServers(servers);

  return Promise.all(
    normalized.map(async (server): Promise<BlossomReplicaVerification> => {
      try {
        const res = await boundedFetch(`${server}/${expected.sha256}`, { method: 'GET' }, options);
        if (!res.ok) {
          return {
            server,
            verified: false,
            httpStatus: res.status,
            error: `HTTP ${res.status}`,
          };
        }
        const bytes = await readStreamBounded(res, expected.size);
        const actualSha256 = computeBlobSha256(bytes);
        const contentType = res.headers?.get?.('content-type') ?? undefined;

        if (actualSha256 !== expected.sha256) {
          return {
            server,
            verified: false,
            httpStatus: res.status,
            actualBytes: bytes.byteLength,
            actualSha256,
            contentType,
            error: 'SHA-256 mismatch on downloaded blob bytes',
          };
        }
        if (contentType && !isCompatibleMimeType(expected.type, contentType)) {
          return {
            server,
            verified: false,
            httpStatus: res.status,
            actualBytes: bytes.byteLength,
            actualSha256,
            contentType,
            error: `Incompatible MIME type "${contentType}" (expected "${expected.type}")`,
          };
        }

        return {
          server,
          verified: true,
          httpStatus: res.status,
          actualBytes: bytes.byteLength,
          actualSha256,
          contentType,
        };
      } catch (err) {
        return {
          server,
          verified: false,
          error: err instanceof Error ? err.message : 'Replica verification failed',
        };
      }
    }),
  );
}

/**
 * Generates a NIP-92 `imeta` tag array from verified Blossom blob metadata.
 */
export function buildImetaTag(params: {
  url: string;
  sha256: string;
  mimeType: string;
  size: number;
  dimensions?: { width: number; height: number };
  alt?: string;
  blurhash?: string;
  fallbacks?: string[];
}): string[] {
  if (!HEX_64_RE.test(params.sha256)) {
    throw new TypeError('imeta x hash must be a 64-character lowercase hex SHA-256');
  }
  const tag: string[] = [
    'imeta',
    `url ${params.url}`,
    `m ${params.mimeType.toLowerCase()}`,
    `x ${params.sha256}`,
    `size ${params.size}`,
  ];
  if (params.dimensions) {
    tag.push(`dim ${params.dimensions.width}x${params.dimensions.height}`);
  }
  if (params.blurhash) {
    tag.push(`blurhash ${params.blurhash}`);
  }
  if (params.alt) {
    tag.push(`alt ${params.alt}`);
  }
  for (const fallback of params.fallbacks ?? []) {
    tag.push(`fallback ${fallback}`);
  }
  return tag;
}
