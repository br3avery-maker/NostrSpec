import 'dotenv/config';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { parseNipDocument, parseNipsReadme, type NipsIndexData, type ParsedNipDocument } from './src/lib/nipsParser';
import {
  generateConformanceSuite,
  generateMcpToolsManifest,
  generateOpenApiSpec,
} from './src/registry/generators';
import { OPERATION_REGISTRY } from './src/registry/operations';
import { SDK_MODULE_MANIFEST } from './src/sdk/index';

const PORT = 3000;
const RAW_BASE = 'https://raw.githubusercontent.com/nostr-protocol/nips/master';
const CACHE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_SDK_FILES = [
  'types.ts',
  'nip01.ts',
  'nip19.ts',
  'nip65.ts',
  'auth.ts',
  'builders.ts',
  'signer.ts',
  'relay.ts',
  'delivery.ts',
  'blossom.ts',
  'nsite.ts',
  'index.ts',
] as const;

let indexCache: { data: NipsIndexData; expiresAt: number } | null = null;
const nipDocCache = new Map<string, { data: ParsedNipDocument; expiresAt: number }>();

const FALLBACK_README = `# NIPs

## List

- [NIP-01: Basic protocol flow description](01.md)
- [NIP-02: Follow List](02.md)
- [NIP-05: Mapping Nostr keys to DNS-based internet identifiers](05.md)
- [NIP-07: \`window.nostr\` capability for web browsers](07.md)
- [NIP-09: Event Deletion Request](09.md)
- [NIP-10: Text Notes and Threads](10.md)
- [NIP-11: Relay Information Document](11.md)
- [NIP-19: bech32-encoded entities](19.md)
- [NIP-21: \`nostr:\` URI scheme](21.md)
- [NIP-23: Long-form Content](23.md)
- [NIP-25: Reactions](25.md)
- [NIP-42: Authentication of clients to relays](42.md)
- [NIP-44: Encrypted Payloads (Versioned)](44.md)
- [NIP-46: Nostr Remote Signing](46.md)
- [NIP-55: Android Signer Application](55.md)
- [NIP-65: Relay List Metadata](65.md)
- [NIP-98: HTTP Auth](98.md)
- [NIP-B7: Blossom](B7.md)

## Event Kinds

| kind | description | NIP |
| --- | --- | --- |
| \`0\` | User Metadata | [01](01.md) |
| \`1\` | Short Text Note | [10](10.md) |
| \`3\` | Follows | [02](02.md) |
| \`5\` | Event Deletion Request | [09](09.md) |
| \`7\` | Reaction | [25](25.md) |
| \`10002\` | Relay List Metadata | [65](65.md) |
| \`22242\` | Client Authentication | [42](42.md) |
| \`24242\` | Blobs stored on mediaservers | [B7](B7.md) |
| \`27235\` | HTTP Auth | [98](98.md) |
| \`30023\` | Long-form Content | [23](23.md) |

## Message Types

### Client to Relay

| type | description | NIP |
| --- | --- | --- |
| \`EVENT\` | used to publish events | [01](01.md) |
| \`REQ\` | used to request events and subscribe to new updates | [01](01.md) |
| \`CLOSE\` | used to stop previous subscriptions | [01](01.md) |
| \`AUTH\` | used to send authentication events | [42](42.md) |

### Relay to Client

| type | description | NIP |
| --- | --- | --- |
| \`EVENT\` | used to send events requested by clients | [01](01.md) |
| \`OK\` | used to indicate acceptance or denial of an EVENT message | [01](01.md) |
| \`EOSE\` | used to indicate the end of stored events | [01](01.md) |
| \`CLOSED\` | used to indicate that a subscription was ended on the server side | [01](01.md) |
| \`NOTICE\` | used to send human-readable error messages | [01](01.md) |
| \`AUTH\` | used to send authentication challenges | [42](42.md) |
`;

async function fetchUpstreamText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NostrSpec-Docs-Server/1.0',
        Accept: 'text/plain, text/markdown;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Upstream GitHub returned HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 127) return true; // 127.0.0.0/8
    if (parts[0] === 0) return true; // 0.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local / metadata
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT
    if (parts[0] >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true; // link-local
    }
    if (lower.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

async function validatePublicRelayHttpUrl(rawRelayUrl: string): Promise<string> {
  const trimmed = rawRelayUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid relay URL format');
  }

  if (!['wss:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only wss:// or https:// relay endpoints are allowed for NIP-11 inspection');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in relay URLs are not allowed');
  }
  if (parsed.hash) {
    throw new Error('URL fragments are not allowed');
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private or loopback relay hosts are blocked');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Private or reserved IP addresses are blocked');
    }
  } else {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) {
      throw new Error('Unable to resolve relay hostname');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error('Relay host resolves to a private or reserved IP address');
      }
    }
  }

  parsed.protocol = 'https:';
  return parsed.toString();
}

async function readSdkSources(): Promise<Record<string, string>> {
  const sdkRoot = path.resolve(process.cwd(), 'src', 'sdk');
  const sources: Record<string, string> = {};

  for (const filename of ALLOWED_SDK_FILES) {
    const resolved = path.resolve(sdkRoot, filename);
    if (!resolved.startsWith(sdkRoot + path.sep)) {
      throw new Error(`Unsafe SDK file path: ${filename}`);
    }
    sources[filename] = await fs.readFile(resolved, 'utf8');
  }
  return sources;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/nips/index', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && indexCache && Date.now() < indexCache.expiresAt) {
      res.json(indexCache.data);
      return;
    }

    try {
      const readme = await fetchUpstreamText(`${RAW_BASE}/README.md`);
      const parsed = parseNipsReadme(readme, {
        fetchedAt: new Date().toISOString(),
        fromFallback: false,
      });
      indexCache = { data: parsed, expiresAt: Date.now() + CACHE_TTL_MS };
      res.json(parsed);
    } catch {
      const fallback = parseNipsReadme(FALLBACK_README, {
        fetchedAt: new Date().toISOString(),
        fromFallback: true,
      });
      res.json(fallback);
    }
  });

  app.get('/api/nips/:id', async (req, res) => {
    const rawId = String(req.params.id ?? '').trim().toUpperCase();
    if (!/^[0-9A-Z]{2}$/.test(rawId)) {
      res.status(400).json({ error: 'Invalid NIP identifier (expected 2 alphanumeric characters such as 01 or B7)' });
      return;
    }

    const forceRefresh = req.query.refresh === '1';
    const cached = nipDocCache.get(rawId);
    if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
      res.json(cached.data);
      return;
    }

    try {
      const markdown = await fetchUpstreamText(`${RAW_BASE}/${rawId}.md`);
      const doc = parseNipDocument(rawId, markdown, new Date().toISOString());
      nipDocCache.set(rawId, { data: doc, expiresAt: Date.now() + CACHE_TTL_MS });
      res.json(doc);
    } catch (err) {
      res.status(502).json({
        error: `Could not load NIP-${rawId} from nostr-protocol/nips`,
        detail: err instanceof Error ? err.message : 'Upstream fetch failed',
      });
    }
  });

  app.get('/api/sdk/modules', async (_req, res) => {
    try {
      const sources = await readSdkSources();
      res.json({
        packageName: '@nostrspec/sdk',
        version: '1.0.0',
        manifest: SDK_MODULE_MANIFEST,
        sources,
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to load SDK modules',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  app.get('/api/sdk/bundle', async (_req, res) => {
    try {
      const sources = await readSdkSources();
      const sections = ALLOWED_SDK_FILES.filter((f) => f !== 'index.ts').map(
        (file) => `// ============================================================\n// Module: ${file}\n// ============================================================\n\n${sources[file]}`,
      );
      const bundle = [
        '/**',
        ' * NostrSpec TypeScript SDK Bundle',
        ' * Built directly from official nostr-protocol/nips contracts.',
        ' * Runtime dependencies: @noble/curves, @noble/hashes, @scure/base',
        ' */',
        '',
        ...sections,
      ].join('\n\n');

      res.setHeader('Content-Type', 'text/typescript; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="nostrspec-sdk.ts"');
      res.send(bundle);
    } catch {
      res.status(500).json({ error: 'Failed to generate SDK bundle' });
    }
  });

  app.get('/api/registry', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      registry: 'nostrspec-operation-registry',
      version: '1.0.0',
      operationCount: OPERATION_REGISTRY.length,
      operations: OPERATION_REGISTRY,
    });
  });

  app.get('/api/registry/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(generateOpenApiSpec(OPERATION_REGISTRY));
  });

  app.get('/api/registry/mcp-tools.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(generateMcpToolsManifest(OPERATION_REGISTRY));
  });

  app.get('/api/registry/conformance.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(generateConformanceSuite(OPERATION_REGISTRY));
  });

  app.post('/api/relay/nip11', async (req, res) => {
    const relayUrl = typeof req.body?.relayUrl === 'string' ? req.body.relayUrl : '';
    if (!relayUrl) {
      res.status(400).json({ error: 'relayUrl is required' });
      return;
    }

    let safeHttpUrl: string;
    try {
      safeHttpUrl = await validatePublicRelayHttpUrl(relayUrl);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid relay URL' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const upstream = await fetch(safeHttpUrl, {
        headers: {
          Accept: 'application/nostr+json',
          'User-Agent': 'NostrSpec-NIP11-Inspector/1.0',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!upstream.ok) {
        res.status(502).json({ error: `Relay responded with HTTP ${upstream.status}` });
        return;
      }
      const text = await upstream.text();
      if (text.length > 131072) {
        res.status(502).json({ error: 'Relay NIP-11 response exceeded 128KB safety limit' });
        return;
      }
      const info = JSON.parse(text);
      res.json({ relayUrl, httpUrl: safeHttpUrl, info });
    } catch (err) {
      res.status(502).json({
        error: 'Failed to fetch NIP-11 relay metadata',
        detail: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NostrSpec server listening on http://localhost:${PORT}`);
  });
}

startServer();
