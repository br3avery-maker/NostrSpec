import { nowSeconds } from './nip01';
import type { EventTemplate, Hex32 } from './types';

export interface ProfileMetadata {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
}

/** NIP-01 / NIP-24 `kind: 0` User Metadata (replaceable). */
export function createProfileMetadataTemplate(
  profile: ProfileMetadata,
  createdAt = nowSeconds(),
): EventTemplate {
  return {
    kind: 0,
    created_at: createdAt,
    tags: [],
    content: JSON.stringify(profile),
  };
}

/** NIP-01 & NIP-10 `kind: 1` Short Text Note with optional thread markers & hashtags. */
export function createTextNoteTemplate(params: {
  content: string;
  replyTo?: { rootId: Hex32; replyId?: Hex32; relayHint?: string; authorPubkey?: Hex32 };
  hashtags?: string[];
  subject?: string;
  createdAt?: number;
}): EventTemplate {
  const tags: string[][] = [];
  if (params.subject) {
    tags.push(['subject', params.subject]);
  }
  if (params.replyTo) {
    const relay = params.replyTo.relayHint ?? '';
    if (params.replyTo.replyId && params.replyTo.replyId !== params.replyTo.rootId) {
      tags.push(['e', params.replyTo.rootId, relay, 'root']);
      tags.push(['e', params.replyTo.replyId, relay, 'reply']);
    } else {
      tags.push(['e', params.replyTo.rootId, relay, 'root']);
    }
    if (params.replyTo.authorPubkey) {
      tags.push(['p', params.replyTo.authorPubkey, relay]);
    }
  }
  for (const tag of params.hashtags ?? []) {
    const normalized = tag.trim().toLowerCase().replace(/^#/, '');
    if (normalized) tags.push(['t', normalized]);
  }

  return {
    kind: 1,
    created_at: params.createdAt ?? nowSeconds(),
    tags,
    content: params.content,
  };
}

/** NIP-02 `kind: 3` Follow List (replaceable). */
export function createFollowListTemplate(
  follows: Array<{ pubkey: Hex32; relay?: string; petname?: string }>,
  createdAt = nowSeconds(),
): EventTemplate {
  return {
    kind: 3,
    created_at: createdAt,
    tags: follows.map((f) => ['p', f.pubkey, f.relay ?? '', f.petname ?? '']),
    content: '',
  };
}

/** NIP-09 `kind: 5` Event Deletion Request. */
export function createDeletionRequestTemplate(params: {
  eventIds: Hex32[];
  kinds?: number[];
  reason?: string;
  createdAt?: number;
}): EventTemplate {
  const tags: string[][] = params.eventIds.map((id) => ['e', id]);
  for (const kind of params.kinds ?? []) {
    tags.push(['k', String(kind)]);
  }
  return {
    kind: 5,
    created_at: params.createdAt ?? nowSeconds(),
    tags,
    content: params.reason ?? '',
  };
}

/** NIP-25 `kind: 7` Reaction. */
export function createReactionTemplate(params: {
  targetEventId: Hex32;
  targetAuthorPubkey: Hex32;
  targetKind?: number;
  reaction?: string;
  createdAt?: number;
}): EventTemplate {
  const tags: string[][] = [
    ['e', params.targetEventId],
    ['p', params.targetAuthorPubkey],
  ];
  if (typeof params.targetKind === 'number') {
    tags.push(['k', String(params.targetKind)]);
  }
  return {
    kind: 7,
    created_at: params.createdAt ?? nowSeconds(),
    tags,
    content: params.reaction ?? '+',
  };
}

/** NIP-23 `kind: 30023` Long-form Content Article (addressable). */
export function createLongFormArticleTemplate(params: {
  identifier: string;
  title: string;
  content: string;
  summary?: string;
  publishedAt?: number;
  hashtags?: string[];
  createdAt?: number;
}): EventTemplate {
  const createdAt = params.createdAt ?? nowSeconds();
  const tags: string[][] = [
    ['d', params.identifier],
    ['title', params.title],
    ['published_at', String(params.publishedAt ?? createdAt)],
  ];
  if (params.summary) {
    tags.push(['summary', params.summary]);
  }
  for (const tag of params.hashtags ?? []) {
    const normalized = tag.trim().toLowerCase().replace(/^#/, '');
    if (normalized) tags.push(['t', normalized]);
  }
  return {
    kind: 30023,
    created_at: createdAt,
    tags,
    content: params.content,
  };
}
