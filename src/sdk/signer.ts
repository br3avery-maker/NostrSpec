import { finalizeEvent, getPublicKey, verifyEvent } from './nip01';
import type { EventTemplate, Hex32, NostrEvent, NostrSigner } from './types';

export interface Nip07WindowNostr {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<NostrEvent>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: Nip07WindowNostr;
  }
}

/**
 * In-memory secp256k1 signer for local tooling, testing, and headless clients.
 * Signing returns a verified, frozen NostrEvent without implicitly publishing it.
 */
export class LocalKeySigner implements NostrSigner {
  readonly mode = 'local' as const;
  private secretKey: Uint8Array | null;
  private readonly pubkey: Hex32;

  constructor(secretKey: Uint8Array) {
    if (secretKey.length !== 32) {
      throw new Error('LocalKeySigner requires a 32-byte secret key');
    }
    this.secretKey = new Uint8Array(secretKey);
    this.pubkey = getPublicKey(this.secretKey);
  }

  async getPublicKey(): Promise<Hex32> {
    return this.pubkey;
  }

  async signEvent(template: EventTemplate): Promise<NostrEvent> {
    if (!this.secretKey) {
      throw new Error('Signer session has been closed');
    }
    return finalizeEvent(template, this.secretKey);
  }

  close(): void {
    if (this.secretKey) {
      this.secretKey.fill(0);
      this.secretKey = null;
    }
  }
}

/**
 * NIP-07 browser extension signer (`window.nostr`).
 * Validates returned author, unchanged template fields, and BIP-340 signature before accepting.
 */
export class Nip07BrowserSigner implements NostrSigner {
  readonly mode = 'nip07' as const;

  static isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.nostr?.signEvent === 'function';
  }

  private getProvider(): Nip07WindowNostr {
    if (typeof window === 'undefined' || !window.nostr) {
      throw new Error('NIP-07 browser extension (window.nostr) is not available on this origin');
    }
    return window.nostr;
  }

  async getPublicKey(): Promise<Hex32> {
    const provider = this.getProvider();
    const pubkey = await provider.getPublicKey();
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new Error('NIP-07 provider returned an invalid public key');
    }
    return pubkey;
  }

  async signEvent(template: EventTemplate): Promise<NostrEvent> {
    const provider = this.getProvider();
    const expectedPubkey = await this.getPublicKey();
    const signed = await provider.signEvent(template);

    if (signed.pubkey !== expectedPubkey) {
      throw new Error('Signed event pubkey does not match connected NIP-07 account');
    }
    if (
      signed.kind !== template.kind ||
      signed.created_at !== template.created_at ||
      signed.content !== template.content ||
      JSON.stringify(signed.tags) !== JSON.stringify(template.tags)
    ) {
      throw new Error('Signed event fields differ from the requested template');
    }
    if (!verifyEvent(signed)) {
      throw new Error('Signed event failed NIP-01 hash or BIP-340 signature verification');
    }

    return Object.freeze({ ...signed });
  }
}

/**
 * Read-only public key identity. Allows querying relays while explicitly rejecting signing calls.
 */
export class ReadOnlySigner implements NostrSigner {
  readonly mode = 'readonly' as const;
  private readonly pubkey: Hex32;

  constructor(pubkey: Hex32) {
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new Error('ReadOnlySigner requires a 64-character lowercase hex pubkey');
    }
    this.pubkey = pubkey;
  }

  async getPublicKey(): Promise<Hex32> {
    return this.pubkey;
  }

  async signEvent(_template: EventTemplate): Promise<NostrEvent> {
    throw new Error('Cannot sign events in read-only mode');
  }
}
