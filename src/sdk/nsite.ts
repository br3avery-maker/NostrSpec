/**
 * SDK Engineering Add-On (NOT part of the official nostr-protocol/nips specification).
 *
 * Implements deterministic, resumable NIP-5A static website (nsite) release planning
 * and signed-manifest verification:
 * - Runtime-agnostic file map (`Record<string, Uint8Array>`) works in both Node & browser
 * - Strict POSIX path normalization rejecting traversal (`..`) and control characters
 * - Resumable upload diffing against already-verified Blossom hashes
 * - Exact template-vs-signed-event verification (`verifySignedNsiteManifest`)
 */

import { computeBlobSha256 } from './blossom';
import { nowSeconds, verifyEvent } from './nip01';
import type { EventTemplate, Hex32, NostrEvent } from './types';

export interface NsiteFileEntry {
  path: string;
  sha256: string;
  size: number;
  mimeType: string;
  needsUpload: boolean;
}

export interface NsiteReleasePlan {
  releaseType: 'root' | 'named';
  siteName?: string;
  kind: 15128 | 35128;
  files: NsiteFileEntry[];
  pendingUploads: NsiteFileEntry[];
  skippedExisting: NsiteFileEntry[];
  totalBytes: number;
  manifestTemplate: EventTemplate;
}

const EXT_MIME_MAP: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export function inferMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return EXT_MIME_MAP[lower.slice(dot)] ?? 'application/octet-stream';
}

/**
 * Normalizes a static site path into canonical leading-slash POSIX form and blocks traversal.
 */
export function normalizeNsitePath(rawPath: string): string {
  const cleaned = rawPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned) {
    throw new Error('Nsite file path must not be empty');
  }
  const segments = cleaned.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '.' || seg === '..' || /[\u0000-\u001f]/.test(seg)) {
      throw new Error(`Unsafe nsite file path segment in "${rawPath}"`);
    }
  }
  return `/${segments.join('/')}`;
}

/**
 * Produces a deterministic, resumable NIP-5A release plan and unsigned manifest template
 * (`kind: 15128` for root nsite, `kind: 35128` with `d` tag for named nsite).
 */
export function planNsiteRelease(
  files: Record<string, Uint8Array>,
  options: {
    siteName?: string;
    title?: string;
    description?: string;
    existingHashes?: Iterable<string>;
    createdAt?: number;
  } = {},
): NsiteReleasePlan {
  const entries = Object.entries(files);
  if (entries.length === 0) {
    throw new Error('Nsite release requires at least one static file');
  }

  const existingSet = new Set(
    Array.from(options.existingHashes ?? []).map((h) => h.toLowerCase()),
  );

  const normalizedEntries: NsiteFileEntry[] = entries
    .map(([rawPath, bytes]) => {
      const path = normalizeNsitePath(rawPath);
      const sha256 = computeBlobSha256(bytes);
      return {
        path,
        sha256,
        size: bytes.byteLength,
        mimeType: inferMimeType(path),
        needsUpload: !existingSet.has(sha256),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  // Verify no normalized path collisions
  const pathSet = new Set<string>();
  for (const entry of normalizedEntries) {
    if (pathSet.has(entry.path)) {
      throw new Error(`Duplicate normalized nsite path: "${entry.path}"`);
    }
    pathSet.add(entry.path);
  }

  const isNamed = Boolean(options.siteName && options.siteName.trim().length > 0);
  const siteName = isNamed ? options.siteName!.trim() : undefined;
  const kind: 15128 | 35128 = isNamed ? 35128 : 15128;

  const tags: string[][] = [];
  if (siteName) {
    tags.push(['d', siteName]);
  }
  if (options.title) {
    tags.push(['title', options.title]);
  }
  if (options.description) {
    tags.push(['description', options.description]);
  }
  for (const entry of normalizedEntries) {
    tags.push(['path', entry.path, entry.sha256]);
  }

  const manifestTemplate: EventTemplate = {
    kind,
    created_at: options.createdAt ?? nowSeconds(),
    tags,
    content: '',
  };

  return {
    releaseType: isNamed ? 'named' : 'root',
    siteName,
    kind,
    files: normalizedEntries,
    pendingUploads: normalizedEntries.filter((e) => e.needsUpload),
    skippedExisting: normalizedEntries.filter((e) => !e.needsUpload),
    totalBytes: normalizedEntries.reduce((sum, e) => sum + e.size, 0),
    manifestTemplate,
  };
}

/**
 * Verifies that a signer-returned NIP-5A manifest event matches the exact planned template,
 * expected author pubkey, and valid BIP-340 Schnorr signature before publishing.
 */
export function verifySignedNsiteManifest(
  signedEvent: NostrEvent,
  plan: NsiteReleasePlan,
  expectedPubkey: Hex32,
): boolean {
  if (signedEvent.pubkey !== expectedPubkey) return false;
  if (signedEvent.kind !== plan.manifestTemplate.kind) return false;
  if (signedEvent.created_at !== plan.manifestTemplate.created_at) return false;
  if (signedEvent.content !== plan.manifestTemplate.content) return false;
  if (JSON.stringify(signedEvent.tags) !== JSON.stringify(plan.manifestTemplate.tags)) return false;
  return verifyEvent(signedEvent);
}
