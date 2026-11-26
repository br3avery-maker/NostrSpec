import { classifyEventKind } from '../sdk/nip01';
import type { EventStorageClass } from '../sdk/types';

export type NipCategory =
  | 'Core Protocol'
  | 'Identity & Signing'
  | 'Relays & Sync'
  | 'Social & Content'
  | 'Messaging & Privacy'
  | 'Media & Storage'
  | 'Payments & Zaps'
  | 'Groups & Apps';

export interface NipSummary {
  id: string;
  file: string;
  title: string;
  category: NipCategory;
  unrecommended: boolean;
  unrecommendedReason?: string;
  sdkModules: string[];
  githubUrl: string;
}

export interface EventKindEntry {
  kind: string;
  numericKind: number | null;
  storageClass: EventStorageClass | 'range';
  description: string;
  nips: Array<{ id: string; label: string; external?: boolean }>;
  deprecated: boolean;
}

export interface WireMessageEntry {
  direction: 'client-to-relay' | 'relay-to-client';
  type: string;
  description: string;
  nips: Array<{ id: string; label: string }>;
}

export interface NipsIndexData {
  sourceRepo: string;
  branch: string;
  fetchedAt: string;
  fromFallback: boolean;
  nips: NipSummary[];
  eventKinds: EventKindEntry[];
  wireMessages: WireMessageEntry[];
}

export interface MarkdownHeading {
  level: number;
  text: string;
  slug: string;
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string; slug: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' };

export interface ParsedNipDocument {
  id: string;
  file: string;
  title: string;
  subtitle: string;
  statuses: string[];
  overview: string;
  keyTakeaways: string[];
  referencedKinds: number[];
  headings: MarkdownHeading[];
  blocks: MarkdownBlock[];
  codeExamples: Array<{ language: string; code: string; context: string }>;
  rawMarkdown: string;
  githubUrl: string;
  fetchedAt: string;
}

const SDK_SUPPORT_MAP: Record<string, string[]> = {
  '01': ['nip01', 'builders', 'signer', 'relay'],
  '02': ['builders'],
  '07': ['signer'],
  '09': ['builders'],
  '10': ['builders'],
  '11': ['relay'],
  '14': ['builders'],
  '17': ['delivery'],
  '19': ['nip19'],
  '21': ['nip19'],
  '23': ['builders'],
  '24': ['builders'],
  '25': ['builders'],
  '42': ['auth', 'delivery'],
  '59': ['delivery'],
  '5A': ['nsite'],
  '65': ['nip65', 'delivery'],
  '70': ['delivery'],
  '92': ['blossom'],
  '98': ['auth'],
  B7: ['auth', 'blossom', 'nsite'],
};

export function categorizeNip(id: string, title: string): NipCategory {
  const upper = id.toUpperCase();
  const lowerTitle = title.toLowerCase();

  if (['01', '09', '13', '19', '21', '40', '70', '73', '78'].includes(upper)) {
    return 'Core Protocol';
  }
  if (['05', '06', '07', '26', '39', '42', '46', '49', '55', '85', '98'].includes(upper)) {
    return 'Identity & Signing';
  }
  if (['11', '43', '45', '50', '65', '66', '67', '77', '86', 'BE'].includes(upper)) {
    return 'Relays & Sync';
  }
  if (['04', '17', '37', '44', '59', '62', 'EE'].includes(upper)) {
    return 'Messaging & Privacy';
  }
  if (['5A', '68', '71', '92', '94', '96', 'A0', 'B7', 'F4'].includes(upper)) {
    return 'Media & Storage';
  }
  if (['15', '47', '57', '60', '61', '69', '75', '87', '99', 'A3'].includes(upper)) {
    return 'Payments & Zaps';
  }
  if (['28', '29', '34', '35', '52', '53', '54', '64', '72', '89', '90', 'C0', 'C7', 'CC', 'CD'].includes(upper)) {
    return 'Groups & Apps';
  }
  if (lowerTitle.includes('relay')) return 'Relays & Sync';
  if (lowerTitle.includes('wallet') || lowerTitle.includes('zap') || lowerTitle.includes('payment')) {
    return 'Payments & Zaps';
  }
  return 'Social & Content';
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

/**
 * Validates that a URL is safe to render in `<a href>` (blocks `javascript:`, `data:`, `vbscript:`).
 */
export function sanitizeHref(rawHref: string): { href: string; nipId?: string; external: boolean } | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;

  const nipRelMatch = trimmed.match(/^(?:\.\/)?([0-9A-Za-z]{2})\.md(?:#.*)?$/);
  if (nipRelMatch) {
    return { href: `#nip-${nipRelMatch[1].toUpperCase()}`, nipId: nipRelMatch[1].toUpperCase(), external: false };
  }

  if (trimmed.startsWith('#')) {
    return { href: trimmed, external: false };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return { href: parsed.toString(), external: parsed.protocol !== 'mailto:' };
    }
    return null;
  } catch {
    return null;
  }
}

function parseNipRefsFromCell(cell: string): Array<{ id: string; label: string; external?: boolean }> {
  const refs: Array<{ id: string; label: string; external?: boolean }> = [];
  const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = mdLinkRe.exec(cell)) !== null) {
    const label = match[1].trim();
    const target = match[2].trim();
    const nipFile = target.match(/^([0-9A-Za-z]{2})\.md$/);
    if (nipFile) {
      refs.push({ id: nipFile[1].toUpperCase(), label: `NIP-${nipFile[1].toUpperCase()}` });
    } else {
      refs.push({ id: label, label, external: true });
    }
  }
  return refs;
}

/**
 * Parses the official `nostr-protocol/nips` README.md into structured NIP summaries,
 * the Event Kinds registry, and Client/Relay Wire Message tables.
 */
export function parseNipsReadme(
  markdown: string,
  meta?: { fetchedAt?: string; fromFallback?: boolean },
): NipsIndexData {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const nips: NipSummary[] = [];
  const eventKinds: EventKindEntry[] = [];
  const wireMessages: WireMessageEntry[] = [];

  let section: 'none' | 'list' | 'kinds' | 'c2r' | 'r2c' = 'none';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^##\s+List/i.test(line)) {
      section = 'list';
      continue;
    }
    if (/^##\s+Event Kinds/i.test(line)) {
      section = 'kinds';
      continue;
    }
    if (/^###\s+Client to Relay/i.test(line)) {
      section = 'c2r';
      continue;
    }
    if (/^###\s+Relay to Client/i.test(line)) {
      section = 'r2c';
      continue;
    }
    if (/^##\s+/.test(line) && !/^##\s+Message Types/i.test(line)) {
      section = 'none';
      continue;
    }

    if (section === 'list' && line.startsWith('- ')) {
      const unrecommended = line.includes('~~') || /\*\*unrecommended\*\*/i.test(line);
      const linkMatch = line.match(/\[NIP-([0-9A-Za-z]{2}):\s*([^\]]+)\]\(([0-9A-Za-z]{2}\.md)\)/);
      if (linkMatch) {
        const id = linkMatch[1].toUpperCase();
        const title = linkMatch[2].replace(/`/g, '').trim();
        const file = linkMatch[3];
        let reason: string | undefined;
        const reasonMatch = line.match(/\*\*unrecommended\*\*:\s*([^~]+)/i);
        if (reasonMatch) {
          reason = reasonMatch[1]
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
        }
        nips.push({
          id,
          file,
          title,
          category: categorizeNip(id, title),
          unrecommended,
          unrecommendedReason: reason,
          sdkModules: SDK_SUPPORT_MAP[id] ?? [],
          githubUrl: `https://github.com/nostr-protocol/nips/blob/master/${file}`,
        });
      }
      continue;
    }

    if (section === 'kinds' && line.startsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length >= 3 && !/^-+$/.test(cells[0]) && cells[0].toLowerCase() !== 'kind') {
        const kindRaw = cells[0].replace(/`/g, '').trim();
        const description = cells[1].replace(/`/g, '').trim();
        const nipCell = cells[2];
        const numericMatch = kindRaw.match(/^(\d+)$/);
        const numericKind = numericMatch ? Number.parseInt(numericMatch[1], 10) : null;
        const storageClass: EventStorageClass | 'range' =
          numericKind !== null ? classifyEventKind(numericKind) : 'range';

        eventKinds.push({
          kind: kindRaw,
          numericKind,
          storageClass,
          description,
          nips: parseNipRefsFromCell(nipCell),
          deprecated: /deprecated/i.test(nipCell) || /deprecated/i.test(description),
        });
      }
      continue;
    }

    if ((section === 'c2r' || section === 'r2c') && line.startsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length >= 3 && !/^-+$/.test(cells[0]) && cells[0].toLowerCase() !== 'type') {
        wireMessages.push({
          direction: section === 'c2r' ? 'client-to-relay' : 'relay-to-client',
          type: cells[0].replace(/`/g, '').trim(),
          description: cells[1].replace(/`/g, '').trim(),
          nips: parseNipRefsFromCell(cells[2]).map(({ id, label }) => ({ id, label })),
        });
      }
    }
  }

  return {
    sourceRepo: 'nostr-protocol/nips',
    branch: 'master',
    fetchedAt: meta?.fetchedAt ?? new Date().toISOString(),
    fromFallback: meta?.fromFallback ?? false,
    nips,
    eventKinds,
    wireMessages,
  };
}

/**
 * Pure, safe Markdown block parser (produces React-renderable AST blocks without innerHTML).
 */
export function parseMarkdownBlocks(markdown: string): {
  blocks: MarkdownBlock[];
  headings: MarkdownHeading[];
} {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  const headings: MarkdownHeading[] = [];
  const slugCounts = new Map<string, number>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})([\w-]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1][0];
      const language = fenceMatch[2] || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence.repeat(3))) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/\s+#*$/, '').trim();
      const baseSlug = slugifyHeading(text);
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      headings.push({ level, text, slug });
      blocks.push({ type: 'heading', level, text, slug });
      i++;
      continue;
    }

    // GFM Table
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]+\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = parseRow(trimmed);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join(' ') });
      continue;
    }

    // Unordered or ordered list
    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        const itemMatch = ordered ? cur.match(/^\d+\.\s+(.+)$/) : cur.match(/^[-*+]\s+(.+)$/);
        if (itemMatch) {
          items.push(itemMatch[1]);
          i++;
        } else if (cur === '') {
          break;
        } else if (lines[i].startsWith('  ') && items.length > 0) {
          items[items.length - 1] += ` ${cur}`;
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Paragraph
    const paraLines: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        /^(#{1,6}\s|```|~~~|>|[-*+]\s|\d+\.\s|---+$|\*\*\*+$)/.test(next) ||
        (next.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(next);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
  }

  return { blocks, headings };
}

/**
 * Parses an individual official NIP Markdown file (e.g. `01.md`) into a human-readable
 * documentation model with extracted statuses, overview, key takeaways, kinds, and examples.
 */
export function parseNipDocument(id: string, markdown: string, fetchedAt = new Date().toISOString()): ParsedNipDocument {
  const normalizedId = id.toUpperCase();
  const { blocks, headings } = parseMarkdownBlocks(markdown);

  const h1 = headings.find((h) => h.level === 1);
  const title = h1 ? h1.text : `NIP-${normalizedId}`;

  // Extract official status flags like `draft`, `optional`, `mandatory`, `unrecommended`
  const statusSet = new Set<string>();
  const statusLine = blocks.slice(0, 4).find(
    (b) => b.type === 'paragraph' && /`(draft|optional|mandatory|unrecommended|deprecated)`/i.test(b.text),
  );
  if (statusLine && statusLine.type === 'paragraph') {
    const matches = statusLine.text.matchAll(/`(draft|optional|mandatory|unrecommended|deprecated)`/gi);
    for (const m of matches) {
      statusSet.add(m[1].toLowerCase());
    }
  }
  if (statusSet.size === 0) {
    statusSet.add('specification');
  }

  // Extract human-readable overview paragraph (skipping status lines and short title duplicates)
  const normalizedTitleLower = title.toLowerCase();
  const proseParagraphs = blocks
    .filter((b): b is Extract<MarkdownBlock, { type: 'paragraph' }> => b.type === 'paragraph' && b !== statusLine)
    .map((b) => b.text.trim())
    .filter((text) => {
      const plain = text.replace(/[`*_~]/g, '').trim();
      if (plain.length < 35) return false;
      if (normalizedTitleLower.includes(plain.toLowerCase())) return false;
      return true;
    });

  const substantiveLead =
    proseParagraphs.find((p) => p.length >= 65) ?? proseParagraphs[0];
  const overview =
    substantiveLead ??
    `Official Nostr Implementation Possibility NIP-${normalizedId}.`;

  // Extract second heading or short subtitle
  const h2 = headings.find((h) => h.level === 2);
  const subtitle = h2 ? h2.text : 'Protocol Specification';

  // Extract referenced event kind numbers mentioned in the spec
  const kindMatches = new Set<number>();
  const kindRe = /\bkind"?(?:\s+|:)\s*`?(\d{1,5})`?/gi;
  let km: RegExpExecArray | null;
  while ((km = kindRe.exec(markdown)) !== null) {
    const num = Number.parseInt(km[1], 10);
    if (num >= 0 && num <= 65535) kindMatches.add(num);
  }
  const referencedKinds = Array.from(kindMatches).sort((a, b) => a - b).slice(0, 16);

  // Extract high-signal key takeaways (avoiding colon-ending lead-ins or low-level escape micro-bullets)
  const keyTakeaways: string[] = [];
  for (const block of blocks) {
    if (block.type === 'list') {
      for (const item of block.items) {
        const clean = item.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '').trim();
        const isMicroEscapeBullet = /0x[0-9a-f]{2}/i.test(clean) || clean.endsWith(':');
        if (!isMicroEscapeBullet && clean.length >= 42 && clean.length <= 220 && keyTakeaways.length < 5) {
          keyTakeaways.push(clean);
        }
      }
    }
    if (keyTakeaways.length >= 5) break;
  }

  // Fallback to substantive section prose if the spec has few narrative list items
  if (keyTakeaways.length < 3) {
    for (const para of proseParagraphs.slice(1, 6)) {
      const firstSentence = para
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`/g, '')
        .split(/(?<=\.)\s+/)[0]
        ?.trim();
      if (
        firstSentence &&
        firstSentence.length >= 40 &&
        firstSentence.length <= 220 &&
        !keyTakeaways.includes(firstSentence) &&
        keyTakeaways.length < 5
      ) {
        keyTakeaways.push(firstSentence);
      }
    }
  }

  // Extract code examples with preceding heading context
  const codeExamples: Array<{ language: string; code: string; context: string }> = [];
  let currentHeading = title;
  for (const block of blocks) {
    if (block.type === 'heading') {
      currentHeading = block.text;
    } else if (block.type === 'code' && block.code.trim().length > 0) {
      codeExamples.push({
        language: block.language,
        code: block.code,
        context: currentHeading,
      });
    }
  }

  return {
    id: normalizedId,
    file: `${normalizedId}.md`,
    title,
    subtitle,
    statuses: Array.from(statusSet),
    overview,
    keyTakeaways,
    referencedKinds,
    headings: headings.filter((h) => h.level >= 2 && h.level <= 3),
    blocks,
    codeExamples,
    rawMarkdown: markdown,
    githubUrl: `https://github.com/nostr-protocol/nips/blob/master/${normalizedId}.md`,
    fetchedAt,
  };
}
