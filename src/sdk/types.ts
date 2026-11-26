/**
 * Core Nostr protocol types derived from NIP-01, NIP-11, NIP-19, NIP-42, NIP-65, and NIP-07.
 */

export type Hex32 = string; // 64-character lowercase hex string (32 bytes)
export type Hex64 = string; // 128-character lowercase hex string (64 bytes)

export interface EventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface UnsignedEvent extends EventTemplate {
  pubkey: Hex32;
}

export interface NostrEvent extends UnsignedEvent {
  id: Hex32;
  sig: Hex64;
}

export type EventStorageClass = 'regular' | 'replaceable' | 'ephemeral' | 'addressable';

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [tagKey: `#${string}`]: string[] | undefined;
}

export type ClientToRelayMessage =
  | ['EVENT', NostrEvent]
  | ['REQ', string, ...NostrFilter[]]
  | ['CLOSE', string]
  | ['AUTH', NostrEvent]
  | ['COUNT', string, ...NostrFilter[]];

export type RelayToClientMessage =
  | ['EVENT', string, NostrEvent]
  | ['OK', string, boolean, string]
  | ['EOSE', string]
  | ['CLOSED', string, string]
  | ['NOTICE', string]
  | ['AUTH', string]
  | ['COUNT', string, { count: number; approximate?: boolean }];

export type RelayAccessRole = 'read' | 'write' | 'both';

export interface RelayEndpoint {
  url: string;
  read: boolean;
  write: boolean;
  role: RelayAccessRole;
}

export interface Nip11RelayInfo {
  name?: string;
  description?: string;
  banner?: string;
  icon?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    max_message_length?: number;
    max_subscriptions?: number;
    max_filters?: number;
    max_limit?: number;
    max_subid_length?: number;
    max_event_tags?: number;
    max_content_length?: number;
    min_pow_difficulty?: number;
    auth_required?: boolean;
    payment_required?: boolean;
    restricted_writes?: boolean;
  };
  payments_url?: string;
  fees?: Record<string, unknown>;
}

export interface NostrSigner {
  readonly mode: 'local' | 'nip07' | 'readonly';
  getPublicKey(): Promise<Hex32>;
  signEvent(template: EventTemplate): Promise<NostrEvent>;
  close?(): void;
}

export interface RelayPublishResult {
  relay: string;
  accepted: boolean;
  message: string;
  error?: string;
}

export interface SubscriptionHandle {
  close(): void;
}
