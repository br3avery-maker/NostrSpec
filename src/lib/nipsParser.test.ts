import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownBlocks, parseNipDocument, parseNipsReadme, sanitizeHref } from './nipsParser';

const SAMPLE_README = `# NIPs

## List

- [NIP-01: Basic protocol flow description](01.md)
- ~~[NIP-04: Encrypted Direct Message](04.md) --- **unrecommended**: deprecated in favor of [NIP-17](17.md)~~
- [NIP-19: bech32-encoded entities](19.md)
- [NIP-B7: Blossom](B7.md)

## Event Kinds

| kind | description | NIP |
| --- | --- | --- |
| \`0\` | User Metadata | [01](01.md) |
| \`1\` | Short Text Note | [10](10.md) |
| \`10002\` | Relay List Metadata | [65](65.md) |
| \`22242\` | Client Authentication | [42](42.md) |
| \`30023\` | Long-form Content | [23](23.md) |

## Message Types

### Client to Relay

| type | description | NIP |
| --- | --- | --- |
| \`EVENT\` | used to publish events | [01](01.md) |
| \`REQ\` | used to request events and subscribe to new updates | [01](01.md) |

### Relay to Client

| type | description | NIP |
| --- | --- | --- |
| \`EOSE\` | used to indicate the end of stored events | [01](01.md) |
| \`OK\` | used to indicate acceptance or denial of an EVENT message | [01](01.md) |
`;

const SAMPLE_NIP01 = `# NIP-01

\`draft\` \`mandatory\`

NIP-01 describes the basic protocol that should be implemented by everybody.

## Events and signatures

Each user has a keypair. Signatures, public key, and encodings are done according to the Schnorr signatures standard for the curve secp256k1.

- Regular events (1000 <= kind < 10000) are stored by relays normally.
- Replaceable events (kind 0, 3, or 10000 <= kind < 20000) keep only the latest event per pubkey.

\`\`\`json
{
  "id": "abc",
  "kind": 1,
  "content": "hello"
}
\`\`\`

| Field | Type |
| --- | --- |
| id | 32-bytes lowercase hex |
| kind | integer |
`;

test('parseNipsReadme extracts active/unrecommended NIPs, classified event kinds, and wire messages', () => {
  const index = parseNipsReadme(SAMPLE_README);

  assert.equal(index.nips.length, 4);
  assert.equal(index.nips[0].id, '01');
  assert.equal(index.nips[0].unrecommended, false);
  assert.ok(index.nips[0].sdkModules.includes('nip01'));

  assert.equal(index.nips[1].id, '04');
  assert.equal(index.nips[1].unrecommended, true);
  assert.match(index.nips[1].unrecommendedReason ?? '', /NIP-17/);

  assert.equal(index.nips[3].id, 'B7');
  assert.equal(index.nips[3].category, 'Media & Storage');

  assert.equal(index.eventKinds.length, 5);
  assert.equal(index.eventKinds[0].storageClass, 'replaceable');
  assert.equal(index.eventKinds[1].storageClass, 'regular');
  assert.equal(index.eventKinds[2].storageClass, 'replaceable');
  assert.equal(index.eventKinds[3].storageClass, 'ephemeral');
  assert.equal(index.eventKinds[4].storageClass, 'addressable');

  assert.equal(index.wireMessages.length, 4);
  assert.equal(index.wireMessages[0].direction, 'client-to-relay');
  assert.equal(index.wireMessages[2].direction, 'relay-to-client');
});

test('parseNipDocument extracts statuses, overview, kinds, TOC headings, tables, and code examples', () => {
  const doc = parseNipDocument('01', SAMPLE_NIP01);

  assert.equal(doc.id, '01');
  assert.deepEqual(doc.statuses, ['draft', 'mandatory']);
  assert.match(doc.overview, /basic protocol/);
  assert.ok(doc.referencedKinds.includes(0));
  assert.ok(doc.referencedKinds.includes(1));
  assert.equal(doc.headings.length, 1);
  assert.equal(doc.headings[0].text, 'Events and signatures');
  assert.equal(doc.codeExamples.length, 1);
  assert.equal(doc.codeExamples[0].language, 'json');

  const { blocks } = parseMarkdownBlocks(SAMPLE_NIP01);
  assert.ok(blocks.some((b) => b.type === 'table'));
});

test('sanitizeHref blocks javascript/data URLs and maps relative NIP markdown links', () => {
  assert.equal(sanitizeHref('javascript:alert(1)'), null);
  assert.equal(sanitizeHref('data:text/html,<script>alert(1)</script>'), null);
  assert.deepEqual(sanitizeHref('19.md'), { href: '#nip-19', nipId: '19', external: false });
  assert.deepEqual(sanitizeHref('https://github.com/nostr-protocol/nips'), {
    href: 'https://github.com/nostr-protocol/nips',
    external: true,
  });
});
