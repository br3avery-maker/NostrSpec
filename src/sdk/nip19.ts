import { bech32 } from '@scure/base';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Hex32 } from './types';

const BECH32_MAX_SIZE = 5000;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const textDecoder = new TextDecoder();

export interface ProfilePointer {
  pubkey: Hex32;
  relays?: string[];
}

export interface EventPointer {
  id: Hex32;
  relays?: string[];
  author?: Hex32;
  kind?: number;
}

export interface AddressPointer {
  identifier: string;
  pubkey: Hex32;
  kind: number;
  relays?: string[];
}

export type DecodedNip19Entity =
  | { type: 'npub'; data: Hex32 }
  | { type: 'nsec'; data: Uint8Array }
  | { type: 'note'; data: Hex32 }
  | { type: 'nprofile'; data: ProfilePointer }
  | { type: 'nevent'; data: EventPointer }
  | { type: 'naddr'; data: AddressPointer };

function assertHex32(value: string, label: string): void {
  if (!HEX_64_RE.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`);
  }
}

function encodeBech32Bytes(prefix: string, bytes: Uint8Array): string {
  return bech32.encode(prefix, bech32.toWords(bytes), BECH32_MAX_SIZE);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeTlv(entries: Array<[number, Uint8Array]>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const [type, value] of entries) {
    if (value.length > 255) {
      throw new Error(`TLV entry type ${type} exceeds maximum length of 255 bytes`);
    }
    chunks.push(new Uint8Array([type, value.length]), value);
  }
  return concatBytes(chunks);
}

function decodeTlv(bytes: Uint8Array): Map<number, Uint8Array[]> {
  const map = new Map<number, Uint8Array[]>();
  let idx = 0;
  while (idx < bytes.length) {
    if (idx + 2 > bytes.length) {
      throw new Error('Truncated TLV header in NIP-19 entity');
    }
    const type = bytes[idx];
    const len = bytes[idx + 1];
    idx += 2;
    if (idx + len > bytes.length) {
      throw new Error(`Truncated TLV value for type ${type}`);
    }
    const value = bytes.slice(idx, idx + len);
    idx += len;
    const existing = map.get(type) ?? [];
    existing.push(value);
    map.set(type, existing);
  }
  return map;
}

function uint32ToBytes(num: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, num, false);
  return buf;
}

function bytesToUint32(bytes: Uint8Array): number {
  if (bytes.length !== 4) {
    throw new Error('NIP-19 kind TLV must be exactly 4 bytes');
  }
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
}

/** Encodes a 32-byte hex public key as `npub1...`. */
export function npubEncode(pubkey: Hex32): string {
  assertHex32(pubkey, 'pubkey');
  return encodeBech32Bytes('npub', hexToBytes(pubkey));
}

/** Encodes a 32-byte secret key as `nsec1...`. */
export function nsecEncode(secretKey: Uint8Array | string): string {
  const bytes = typeof secretKey === 'string' ? hexToBytes(secretKey) : secretKey;
  if (bytes.length !== 32) {
    throw new Error('secretKey must be 32 bytes');
  }
  return encodeBech32Bytes('nsec', bytes);
}

/** Encodes a 32-byte hex event ID as `note1...`. */
export function noteEncode(eventId: Hex32): string {
  assertHex32(eventId, 'eventId');
  return encodeBech32Bytes('note', hexToBytes(eventId));
}

/** Encodes a profile pointer with optional relay hints as `nprofile1...`. */
export function nprofileEncode(pointer: ProfilePointer): string {
  assertHex32(pointer.pubkey, 'pubkey');
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(pointer.pubkey)]];
  for (const relay of pointer.relays ?? []) {
    entries.push([1, utf8ToBytes(relay)]);
  }
  return encodeBech32Bytes('nprofile', encodeTlv(entries));
}

/** Encodes an event pointer with optional relay hints, author, and kind as `nevent1...`. */
export function neventEncode(pointer: EventPointer): string {
  assertHex32(pointer.id, 'id');
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(pointer.id)]];
  for (const relay of pointer.relays ?? []) {
    entries.push([1, utf8ToBytes(relay)]);
  }
  if (pointer.author) {
    assertHex32(pointer.author, 'author');
    entries.push([2, hexToBytes(pointer.author)]);
  }
  if (typeof pointer.kind === 'number') {
    entries.push([3, uint32ToBytes(pointer.kind)]);
  }
  return encodeBech32Bytes('nevent', encodeTlv(entries));
}

/** Encodes an addressable event coordinate (kind, pubkey, d-tag identifier, relays) as `naddr1...`. */
export function naddrEncode(pointer: AddressPointer): string {
  assertHex32(pointer.pubkey, 'pubkey');
  if (!Number.isInteger(pointer.kind) || pointer.kind < 0) {
    throw new Error('kind must be a non-negative integer');
  }
  const entries: Array<[number, Uint8Array]> = [
    [0, utf8ToBytes(pointer.identifier)],
    ...(pointer.relays ?? []).map((relay): [number, Uint8Array] => [1, utf8ToBytes(relay)]),
    [2, hexToBytes(pointer.pubkey)],
    [3, uint32ToBytes(pointer.kind)],
  ];
  return encodeBech32Bytes('naddr', encodeTlv(entries));
}

/**
 * Decodes any NIP-19 Bech32 entity (`npub`, `nsec`, `note`, `nprofile`, `nevent`, `naddr`).
 * Strips an optional leading `nostr:` URI prefix (NIP-21).
 */
export function decode(raw: string): DecodedNip19Entity {
  const cleaned = raw.trim().replace(/^nostr:/i, '');
  if (!cleaned.includes('1')) {
    throw new Error('Invalid NIP-19 entity: missing bech32 separator');
  }

  const { prefix, words } = bech32.decode(cleaned as `${string}1${string}`, BECH32_MAX_SIZE);
  const data = new Uint8Array(bech32.fromWords(words));

  switch (prefix) {
    case 'npub':
      if (data.length !== 32) throw new Error('npub payload must be 32 bytes');
      return { type: 'npub', data: bytesToHex(data) };
    case 'nsec':
      if (data.length !== 32) throw new Error('nsec payload must be 32 bytes');
      return { type: 'nsec', data };
    case 'note':
      if (data.length !== 32) throw new Error('note payload must be 32 bytes');
      return { type: 'note', data: bytesToHex(data) };
    case 'nprofile': {
      const tlv = decodeTlv(data);
      const special = tlv.get(0)?.[0];
      if (!special || special.length !== 32) throw new Error('nprofile missing 32-byte pubkey (TLV 0)');
      const relays = (tlv.get(1) ?? []).map((b) => textDecoder.decode(b));
      return {
        type: 'nprofile',
        data: { pubkey: bytesToHex(special), relays },
      };
    }
    case 'nevent': {
      const tlv = decodeTlv(data);
      const special = tlv.get(0)?.[0];
      if (!special || special.length !== 32) throw new Error('nevent missing 32-byte event id (TLV 0)');
      const relays = (tlv.get(1) ?? []).map((b) => textDecoder.decode(b));
      const authorBytes = tlv.get(2)?.[0];
      const kindBytes = tlv.get(3)?.[0];
      return {
        type: 'nevent',
        data: {
          id: bytesToHex(special),
          relays,
          author: authorBytes && authorBytes.length === 32 ? bytesToHex(authorBytes) : undefined,
          kind: kindBytes ? bytesToUint32(kindBytes) : undefined,
        },
      };
    }
    case 'naddr': {
      const tlv = decodeTlv(data);
      const idBytes = tlv.get(0)?.[0];
      const pubkeyBytes = tlv.get(2)?.[0];
      const kindBytes = tlv.get(3)?.[0];
      if (!idBytes) throw new Error('naddr missing d-tag identifier (TLV 0)');
      if (!pubkeyBytes || pubkeyBytes.length !== 32) throw new Error('naddr missing 32-byte pubkey (TLV 2)');
      if (!kindBytes) throw new Error('naddr missing 4-byte kind (TLV 3)');
      const relays = (tlv.get(1) ?? []).map((b) => textDecoder.decode(b));
      return {
        type: 'naddr',
        data: {
          identifier: textDecoder.decode(idBytes),
          pubkey: bytesToHex(pubkeyBytes),
          kind: bytesToUint32(kindBytes),
          relays,
        },
      };
    }
    default:
      throw new Error(`Unsupported NIP-19 prefix: "${prefix}"`);
  }
}
