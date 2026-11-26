export interface WorkflowStage {
  step: string;
  title: string;
  humanLayer: string;
  sdkLayer: string;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  deliverables: string[];
}

export interface RoadmapPhase {
  id: string;
  number: number;
  title: string;
  bridgeRef: string;
  status: 'Completed' | 'Next' | 'Planned';
  goal: string;
  milestones: RoadmapMilestone[];
  exitCriterion: string;
  nips: string[];
  sdkModules: string[];
}

export interface EcosystemBridge {
  id: number;
  tier: 'core' | 'extended';
  phaseId: string;
  wallTitle: string;
  bridgeTitle: string;
  wallSummary: string;
  bridgeSummary: string;
  sdkPrimitives: string[];
  nips: string[];
}

export interface StrategicCombination {
  id: string;
  title: string;
  bridges: number[];
  summary: string;
}

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    step: '01',
    title: 'Human Input',
    humanLayer:
      'Plain English goals, everyday files (RSS, Markdown, .ics calendars, CSVs, photo folders), voice memos, or visual space blocks.',
    sdkLayer:
      'Pure input parsers & normalizers with zero assumption about UI framework or storage backend.',
  },
  {
    step: '02',
    title: 'Smart Translation',
    humanLayer:
      'Maps everyday intent to active official NIPs while steering clear of deprecated or unrecommended specs.',
    sdkLayer:
      'Deterministic protocol automators (SHA-256, imeta, NIP-10 markers, NIP-65 routing) plus optional generative metadata drafting.',
  },
  {
    step: '03',
    title: 'Human Review & Sign',
    humanLayer:
      'Plain-English preview cards showing exactly what will be published—no raw JSON or secret-key exposure.',
    sdkLayer:
      'Strict unsigned EventTemplate boundary handed to the user’s signer (NIP-07 browser, NIP-46 bunker, NIP-55 Android, or local test key).',
  },
  {
    step: '04',
    title: 'Dual-World Output',
    humanLayer:
      'Works immediately as a normal shareable web page or printable flyer for outsiders, while staying native to Nostr clients.',
    sdkLayer:
      'Multi-relay Promise.allSettled publishing, Blossom blob verification, NIP-5A nsite manifests, and OpenGraph unfurling.',
  },
];

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 'phase-0',
    number: 0,
    title: 'Protocol Foundation (Spec-First Core)',
    bridgeRef: 'Foundation for all 12 bridges',
    status: 'Completed',
    goal: 'Anchor the SDK directly to the official nostr-protocol/nips repository so every primitive starts from canonical contracts rather than post-hoc app extraction.',
    milestones: [
      {
        id: 'M0.1',
        title: 'Live Official NIPs Index & Human-Readable Parser',
        deliverables: [
          'Live sync from nostr-protocol/nips README and individual XX.md specs',
          'Automated Event Kind storage classification (regular, replaceable, ephemeral, addressable)',
          'Safe React Markdown AST renderer with internal NIP-to-NIP navigation',
        ],
      },
      {
        id: 'M0.2',
        title: 'Audited Core TypeScript SDK & Interactive Playground',
        deliverables: [
          'Canonical NIP-01 UTF-8 serialization, SHA-256 IDs, BIP-340 Schnorr signing & verification',
          'NIP-19 Bech32/TLV codec, NIP-65 strict relay list parser, NIP-07/local signer boundary',
          'RelayPool lifecycle manager, NIP-11 relay inspector, NIP-42/98 & Blossom BUD-11 auth templates',
        ],
      },
    ],
    exitCriterion:
      'Core cryptographic primitives, live NIP documentation, and unit tests pass cleanly with zero app-specific coupling.',
    nips: ['01', '07', '11', '19', '42', '65', '98', 'B7'],
    sdkModules: ['nip01', 'nip19', 'nip65', 'signer', 'relay', 'auth', 'builders'],
  },
  {
    id: 'phase-1',
    number: 1,
    title: 'The Translation Engine',
    bridgeRef: 'Bridge 2 — Life-to-Nostr Importers',
    status: 'Next',
    goal: 'Eliminate tedious tag math and let people bring existing writing, calendars, photos, and catalogs onto Nostr without starting from scratch.',
    milestones: [
      {
        id: 'M1.1',
        title: 'Deterministic Protocol Automators',
        deliverables: [
          'NIP-10 auto-threader & NIP-27 nostr: URI / hashtag tag extractor',
          'NIP-92 imeta media packager (SHA-256, MIME, dimensions, BlurHash, Blossom upload auth)',
          'Typed builders for NIP-52 calendars, NIP-54 wikis, NIP-68 pictures, NIP-88 polls, and NIP-99 listings',
        ],
      },
      {
        id: 'M1.2',
        title: 'Everyday File & Feed Importers',
        deliverables: [
          'Substack / WordPress / Ghost RSS & Markdown folder converter -> kind:30023 articles',
          '.ics calendar importer -> kind:31922 / 31923 calendar events',
          'Photo folder & CSV product/swap sheet converters -> Blossom + kind:20 / kind:30402 drafts',
        ],
      },
      {
        id: 'M1.3',
        title: 'Optional Smart Metadata Assistant',
        deliverables: [
          'Auto-drafts stable d-tag slugs, summaries, normalized topic tags, and accessibility alt text',
          'Suggests NIP-36 content-warning tags when appropriate—always editable before signing',
        ],
      },
    ],
    exitCriterion:
      'A non-technical writer or organizer drops an RSS link or .ics file, reviews plain-English preview cards, and signs a valid batch of Nostr events in under 2 minutes.',
    nips: ['10', '23', '27', '36', '52', '54', '68', '88', '92', '99', 'B7'],
    sdkModules: ['builders', 'auth', 'nip01'],
  },
  {
    id: 'phase-2',
    number: 2,
    title: 'The Invisible Infrastructure Steward',
    bridgeRef: 'Bridge 3 — Reach, Backup & Share Links',
    status: 'Planned',
    goal: 'Eliminate “where did my post go?” and “what if a relay disappears?” by hiding relay plumbing behind plain-English health checks and portable backups.',
    milestones: [
      {
        id: 'M2.1',
        title: 'Plain-English Reach & Health Check',
        deliverables: [
          'Audits NIP-65 read/write relays against NIP-11 limits and Blossom blob availability',
          'Reports human-readable coverage with one-click re-broadcast & media mirroring',
        ],
      },
      {
        id: 'M2.2',
        title: 'Time-Capsule Personal Archive',
        deliverables: [
          'One-click export bundling raw signed JSONL events, readable HTML/Markdown copies, and a Blossom media inventory',
        ],
      },
      {
        id: 'M2.3',
        title: 'Outsider-Friendly Bridge Share Cards',
        deliverables: [
          'Server-side OpenGraph unfurler for npub, nevent, and naddr links',
          'Clean web reading view with smooth handoff to native Nostr apps',
        ],
      },
    ],
    exitCriterion:
      'Creators can verify reachability, download a complete offline backup, and share links that open cleanly in SMS, WhatsApp, and email.',
    nips: ['11', '19', '21', '65', 'B7'],
    sdkModules: ['nip65', 'relay', 'nip19'],
  },
  {
    id: 'phase-3',
    number: 3,
    title: 'No-Code Nostr Space Studio',
    bridgeRef: 'Bridge 1 — Personal Corners & NIP-5A Nsites',
    status: 'Planned',
    goal: 'Provide a Carrd / Bandcamp / Notion-simple studio so anyone can publish their own permanent corner of the web backed by native Nostr events.',
    milestones: [
      {
        id: 'M3.1',
        title: 'Curated Space Starter Templates',
        deliverables: [
          'Five human templates: Studio & Portfolio, Zine & Essays, Local Events, Neighborhood Swap, and Link Hub',
        ],
      },
      {
        id: 'M3.2',
        title: 'Dual-View Live Preview',
        deliverables: [
          'Side-by-side preview comparing Public Web Visitor View and Native Nostr Client View',
        ],
      },
      {
        id: 'M3.3',
        title: 'One-Click NIP-5A Nsite Compiler & Publisher',
        deliverables: [
          'Static directory walker, per-file SHA-256 inventory, Blossom upload plan, and unsigned kind:15128 / 35128 manifest builder',
        ],
      },
    ],
    exitCriterion:
      'A non-engineer builds a personal portfolio or zine and publishes a live NIP-5A nsite + native Nostr events without writing code.',
    nips: ['01', '23', '39', '51', '52', '5A', '68', '99', 'B7'],
    sdkModules: ['builders', 'auth', 'nip01'],
  },
  {
    id: 'phase-4',
    number: 4,
    title: 'Shared Community Kit',
    bridgeRef: 'Bridge 4 — Multi-Person Spaces Without Shared Keys',
    status: 'Planned',
    goal: 'Let real-world clubs, collectives, bands, and local groups collaborate in a shared space while every member keeps their own cryptographic key.',
    milestones: [
      {
        id: 'M4.1',
        title: 'Member Roster & Curated Governance Lens',
        deliverables: [
          'Curated space feeds scoped to NIP-51 member lists (kind:30000) or NIP-29 relay groups',
          'Zero shared nsec passwords—admins curate membership rather than handing out private keys',
        ],
      },
      {
        id: 'M4.2',
        title: 'Turnkey Group Modules',
        deliverables: [
          'Shared Calendar + RSVPs (NIP-52), Living Community Wiki (NIP-54), Group Polls (NIP-88), and Swap Bulletin (NIP-99)',
        ],
      },
      {
        id: 'M4.3',
        title: 'Frictionless Neighbor Onboarding',
        deliverables: [
          'Immediate read-only browsing with progressive signer onboarding only when RSVPing or posting',
        ],
      },
    ],
    exitCriterion:
      'A 20-person local club coordinates schedules, guides, and polls together without sharing a private key or running a server.',
    nips: ['29', '51', '52', '54', '88', '99'],
    sdkModules: ['builders', 'relay', 'signer'],
  },
  {
    id: 'phase-5',
    number: 5,
    title: 'Plain-English Intent-to-Blueprint Composer',
    bridgeRef: 'Bridge 5 — Protocol Lego Builder',
    status: 'Planned',
    goal: 'Turn plain-English community ideas into working, spec-compliant Nostr space blueprints—unlocking even niche active NIPs automatically.',
    milestones: [
      {
        id: 'M5.1',
        title: 'Natural-Language NIP Mapper',
        deliverables: [
          'Maps plain-English goals against the live nostr-protocol/nips index while excluding unrecommended/deprecated NIPs',
        ],
      },
      {
        id: 'M5.2',
        title: 'Schema-to-Form & Display Card Generator',
        deliverables: [
          'Generates human forms and display cards from active NIP tag contracts (Podcasts NIP-F4, Badges NIP-58, Geocaching NIP-CC, etc.)',
        ],
      },
      {
        id: 'M5.3',
        title: 'Three Portable Export Targets',
        deliverables: [
          'Publish as NIP-5A nsite, copy-paste an embeddable website widget, or export a clean TypeScript SDK starter repo',
        ],
      },
    ],
    exitCriterion:
      'A non-programmer describes a niche community tool in two sentences and gets a working, interoperable Nostr space.',
    nips: ['01', '51', '58', '5A', 'CC', 'F4'],
    sdkModules: ['nip01', 'builders', 'relay'],
  },
];

export const ECOSYSTEM_BRIDGES: EcosystemBridge[] = [
  {
    id: 1,
    tier: 'core',
    phaseId: 'phase-3',
    wallTitle: '“I Just Want My Own Corner” Wall',
    bridgeTitle: 'No-Code Nostr Space Studio (NIP-5A + Blossom)',
    wallSummary:
      'Joining Nostr today drops newcomers into a social feed rather than a place of their own like Carrd, Bandcamp, or Notion.',
    bridgeSummary:
      'Visual templates for portfolios, zines, local event hubs, and shops that compile into both a normal public web page (NIP-5A nsite) and native Nostr events.',
    sdkPrimitives: ['NIP-5A directory walker & manifest builder', 'Blossom batch upload planner', 'Addressable d-tag manager'],
    nips: ['01', '23', '51', '52', '5A', '68', '99', 'B7'],
  },
  {
    id: 2,
    tier: 'core',
    phaseId: 'phase-1',
    wallTitle: '“Starting From Scratch” Wall',
    bridgeTitle: 'Universal Life-to-Nostr Importers',
    wallSummary:
      'Non-engineers already have years of articles, photos, calendars, and product lists trapped in RSS feeds, .ics files, folders, and spreadsheets.',
    bridgeSummary:
      'Drop-in converters that turn everyday files into validated, human-previewed Nostr event drafts with automatic imeta, slugs, and alt-text suggestions.',
    sdkPrimitives: ['RSS/Markdown -> NIP-23 parser', '.ics -> NIP-52 converter', 'NIP-92 imeta & SHA-256 packager'],
    nips: ['23', '52', '68', '92', '99', 'B7'],
  },
  {
    id: 3,
    tier: 'core',
    phaseId: 'phase-2',
    wallTitle: '“Where Did My Post Go?” Wall',
    bridgeTitle: 'Invisible Infrastructure Steward',
    wallSummary:
      'Relay outbox rules, Blossom mirroring, and backup anxiety feel like sysadmin work disguised as social UX.',
    bridgeSummary:
      'Plain-English Reach Check, one-click Time-Capsule offline archives, and outsider-friendly OpenGraph share links that unfurl in SMS and email.',
    sdkPrimitives: ['NIP-65 outbox router & health prober', 'Signed JSONL + HTML archive exporter', 'NIP-19 server unfurler'],
    nips: ['11', '19', '21', '65', 'B7'],
  },
  {
    id: 4,
    tier: 'core',
    phaseId: 'phase-4',
    wallTitle: '“Real-World Communities” Wall',
    bridgeTitle: 'Shared Community Kit (No Shared Private Keys)',
    wallSummary:
      'Most Nostr apps assume one solo individual per account, pushing real clubs and collectives to give up or dangerously share a single nsec.',
    bridgeSummary:
      'Every member signs with their own key while the space curates approved members’ calendars, wikis, polls, and swap boards via NIP-51 / NIP-29.',
    sdkPrimitives: ['NIP-51 member-list feed scoping', 'NIP-29 group adapter', 'NIP-52 RSVP & NIP-88 poll aggregators'],
    nips: ['29', '51', '52', '54', '88', '99'],
  },
  {
    id: 5,
    tier: 'core',
    phaseId: 'phase-5',
    wallTitle: '“Intent-to-App” Wall',
    bridgeTitle: 'Plain-English Nostr Blueprint Builder',
    wallSummary:
      'Turning an idea into a Nostr tool currently requires knowing 90+ NIPs, which ones are deprecated, and how event kinds replace each other.',
    bridgeSummary:
      'Describe a community goal in plain English and synthesize active NIP templates, forms, feeds, and clean SDK code directly from the live official NIPs repo.',
    sdkPrimitives: ['Live NIP capability resolver', 'Tag-contract form schema compiler', 'Clean SDK code exporter'],
    nips: ['01', '51', '58', '5A', 'F4'],
  },
  {
    id: 6,
    tier: 'extended',
    phaseId: 'phase-3',
    wallTitle: '“Abandon Your Website” Wall',
    bridgeTitle: 'Drop-In Embeddable Nostr Widgets',
    wallSummary:
      'Artists, writers, and small shops already maintain WordPress, Ghost, or Squarespace sites and will not migrate overnight.',
    bridgeSummary:
      'Single-tag embeddable widgets for Nostr comment threads (NIP-22), Lightning Zap tip jars (NIP-57), guestbooks, and upcoming calendars that drop into any existing site.',
    sdkPrimitives: ['Lightweight read/reply widget bundle', 'NIP-22 comment threader', 'NIP-57 zap request builder'],
    nips: ['22', '52', '57', '68'],
  },
  {
    id: 7,
    tier: 'extended',
    phaseId: 'phase-2',
    wallTitle: '“Key Anxiety” Wall',
    bridgeTitle: 'Human Key Safety & Printable Recovery Kits',
    wallSummary:
      'Telling newcomers to guard a raw 63-character nsec forever creates immediate onboarding fear and drop-off.',
    bridgeSummary:
      'A NIP-49 (ncryptsec) passphrase backup wizard that generates a clean printable emergency recovery card plus a 3-question device signer recommender.',
    sdkPrimitives: ['NIP-49 ncryptsec encrypt/decrypt', 'Device-aware signer capability detector (NIP-07/46/55)'],
    nips: ['07', '46', '49', '55'],
  },
  {
    id: 8,
    tier: 'extended',
    phaseId: 'phase-4',
    wallTitle: '“Spam & Graph Math” Wall',
    bridgeTitle: 'Plain-English Neighborhood Safety Dials',
    wallSummary:
      'Web of Trust (WoT) solves decentralized spam, yet remains hidden behind raw relay filters and graph jargon.',
    bridgeSummary:
      'Four human dials—Living Room, Neighborhood, Town Square, Open Street—paired with shareable NIP-51 Community Starter Packs and mute sets.',
    sdkPrimitives: ['NIP-51 follow-set & mute-set resolver', '2-hop Web-of-Trust author filter builder'],
    nips: ['02', '51', '85'],
  },
  {
    id: 9,
    tier: 'extended',
    phaseId: 'phase-1',
    wallTitle: '“Hands-Free / Non-Writer” Wall',
    bridgeTitle: 'Voice-Memo-to-Structured-Nostr',
    wallSummary:
      'Chefs, gardeners, musicians, elders, and field organizers often prefer talking over filling out eight Markdown form fields.',
    bridgeSummary:
      'Speak a 30-second update to attach a NIP-A0 voice note while auto-drafting the matching structured NIP-52 calendar event or bulletin card for one-tap signing.',
    sdkPrimitives: ['NIP-A0 voice message builder', 'Audio-to-EventTemplate draft normalizer'],
    nips: ['52', '92', 'A0', 'B7'],
  },
  {
    id: 10,
    tier: 'extended',
    phaseId: 'phase-3',
    wallTitle: '“Screen-Only” Wall',
    bridgeTitle: 'Print-Ready Zines, Flyers & QR Bridges',
    wallSummary:
      'Real communities gather around bulletin boards, coffee shops, merch tables, and living rooms—not just feeds.',
    bridgeSummary:
      'One-click print exports turning NIP-52 calendars into neighborhood QR flyers, NIP-51/23 collections into printable zines, and profiles into table-tent Zap cards.',
    sdkPrimitives: ['Deterministic print-layout AST from NIP-23/51/52', 'NIP-21 nostr: QR link encoder'],
    nips: ['19', '21', '23', '51', '52', '57'],
  },
  {
    id: 11,
    tier: 'extended',
    phaseId: 'phase-4',
    wallTitle: '“Hosting Without DevOps” Wall',
    bridgeTitle: 'Cooperative Media & Relay Patronage Pool',
    wallSummary:
      'Groups gladly chip in $5/month for reliable hosting, but cannot run Linux servers or Docker containers.',
    bridgeSummary:
      'A transparent “Keep This Space Alive” patronage flow funding Blossom storage and relay retention for a group’s member list via NIP-47 / Cashu.',
    sdkPrimitives: ['NIP-47 Nostr Wallet Connect client', 'Blossom storage quota & mirror verifier'],
    nips: ['47', '51', '60', 'B7'],
  },
  {
    id: 12,
    tier: 'extended',
    phaseId: 'phase-0',
    wallTitle: '“Protocol Governance Is Only for Coders” Wall',
    bridgeTitle: 'Human-Readable NIP Digest & Impact Translator',
    wallSummary:
      'NIP specs decide privacy, moderation, and creator economics, yet read like systems-engineering RFCs.',
    bridgeSummary:
      'Pair every official NIP with plain-English impact summaries explaining what user problem it solves, storage rules, and practical interoperability.',
    sdkPrimitives: ['Official NIP markdown AST extractor', 'Status & kind-contract impact analyzer'],
    nips: ['01', '11', '65'],
  },
];

export const STRATEGIC_COMBINATIONS: StrategicCombination[] = [
  {
    id: 'carrd-meetup',
    title: '“Carrd + Meetup for Nostr”',
    bridges: [1, 4, 10],
    summary:
      'A no-code Space Studio where individuals or local clubs launch a web + Nostr home (Events, Gallery, Zine, Swap Board) and print QR flyers for their neighborhood.',
  },
  {
    id: 'onramp-embed',
    title: '“Nostr On-Ramp & Embed Kit”',
    bridges: [2, 6, 7],
    summary:
      'Meet non-technical creators on their existing websites—import RSS/calendars, drop in Nostr comment/zap/event widgets, and hand them a printable key recovery kit.',
  },
  {
    id: 'human-nostrspec',
    title: '“Two-Sided NostrSpec Platform”',
    bridges: [5, 12, 1],
    summary:
      'Protocol engineers get the live NIPs SDK & Playground, while non-technical builders get an intent-driven Space Blueprint Composer built on the exact same clean primitives.',
  },
];

export function exportRoadmapAsMarkdown(): string {
  const lines: string[] = [
    '# NostrSpec — Spec-First SDK Roadmap & Ecosystem Bridges',
    '',
    '> Built spec-first from the official `nostr-protocol/nips` repository: clean protocol primitives first, deterministic automators second, human-first spaces on top (avoiding post-hoc SDK extraction).',
    '',
    '## 1. Unified Four-Stage Workflow',
    '',
  ];

  for (const stage of WORKFLOW_STAGES) {
    lines.push(`### ${stage.step}. ${stage.title}`);
    lines.push(`- **Human Layer:** ${stage.humanLayer}`);
    lines.push(`- **SDK Layer:** ${stage.sdkLayer}`);
    lines.push('');
  }

  lines.push('## 2. Phased Roadmap & Milestones', '');
  for (const phase of ROADMAP_PHASES) {
    lines.push(`### Phase ${phase.number}: ${phase.title} (${phase.status})`);
    lines.push(`- **Bridge Focus:** ${phase.bridgeRef}`);
    lines.push(`- **Goal:** ${phase.goal}`);
    lines.push(`- **NIPs:** ${phase.nips.map((n) => `NIP-${n}`).join(', ')}`);
    lines.push(`- **Exit Criterion:** ${phase.exitCriterion}`);
    lines.push('');
    for (const m of phase.milestones) {
      lines.push(`#### ${m.id} — ${m.title}`);
      for (const item of m.deliverables) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }
  }

  lines.push('## 3. All 12 Ecosystem Bridges (Walls Worth Tearing Down)', '');
  for (const b of ECOSYSTEM_BRIDGES) {
    lines.push(`### Bridge ${b.id}: ${b.wallTitle} -> ${b.bridgeTitle}`);
    lines.push(`- **Tier:** ${b.tier === 'core' ? 'Core Roadmap' : 'Beyond the Feed'}`);
    lines.push(`- **The Wall:** ${b.wallSummary}`);
    lines.push(`- **The Bridge:** ${b.bridgeSummary}`);
    lines.push(`- **SDK Primitives Required:** ${b.sdkPrimitives.join('; ')}`);
    lines.push(`- **NIPs:** ${b.nips.map((n) => `NIP-${n}`).join(', ')}`);
    lines.push('');
  }

  lines.push('## 4. High-Leverage Combinations', '');
  for (const combo of STRATEGIC_COMBINATIONS) {
    lines.push(`- **${combo.title}** (Bridges ${combo.bridges.join(' + ')}): ${combo.summary}`);
  }
  lines.push('');

  return lines.join('\n');
}
