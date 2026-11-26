import { useEffect, useState } from 'react';
import { ArrowRight, Download, Terminal } from 'lucide-react';
import { SDK_MODULE_MANIFEST, type SdkModuleManifest } from '../sdk/index';
import { CodeBlock } from './CodeBlock';

interface SdkReferenceViewProps {
  selectedModuleId: string;
  onSelectModule: (moduleId: string) => void;
  onSelectNip: (nipId: string) => void;
  onOpenPlayground: (tab?: 'signer' | 'nip19' | 'relays' | 'filters' | 'delivery') => void;
}

export function SdkReferenceView({
  selectedModuleId,
  onSelectModule,
  onSelectNip,
  onOpenPlayground,
}: SdkReferenceViewProps) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeModule: SdkModuleManifest =
    SDK_MODULE_MANIFEST.find((m) => m.id === selectedModuleId) ?? SDK_MODULE_MANIFEST[0];

  const nipContractModules = SDK_MODULE_MANIFEST.filter((m) => m.origin === 'nip-contract');
  const sdkExtensionModules = SDK_MODULE_MANIFEST.filter((m) => m.origin === 'sdk-extension');

  useEffect(() => {
    let active = true;
    async function loadSources() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/sdk/modules');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load SDK modules');
        if (active) setSources(data.sources ?? {});
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load SDK source');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSources();
    return () => {
      active = false;
    };
  }, []);

  const activeSource = sources[activeModule.file] ?? '';

  const renderSidebarGroup = (
    heading: string,
    sublabel: string,
    modules: SdkModuleManifest[],
    isExtensionGroup: boolean,
  ) => (
    <div key={heading}>
      <div className="px-4 py-2.5 bg-slate-50/90 border-y border-slate-200/80">
        <div
          className={`text-[11px] font-semibold uppercase tracking-wider ${
            isExtensionGroup ? 'text-amber-900' : 'text-slate-700'
          }`}
        >
          {heading}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{sublabel}</div>
      </div>
      <div className="divide-y divide-slate-100">
        {modules.map((mod) => {
          const isSelected = mod.id === activeModule.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => onSelectModule(mod.id)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                isSelected ? 'bg-indigo-50/75 text-indigo-950' : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div
                className={`font-mono text-xs font-semibold ${
                  isSelected ? 'text-indigo-700' : 'text-slate-900'
                }`}
              >
                {mod.file}
              </div>
              <div className="text-xs text-slate-600 mt-0.5 line-clamp-1">{mod.title}</div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
                {mod.nips.length > 3
                  ? `${mod.nips.slice(0, 3).map((n) => `NIP-${n}`).join(' · ')} +${mod.nips.length - 3} more`
                  : mod.nips.map((n) => `NIP-${n}`).join(' · ')}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const playgroundTabForModule = (
    moduleId: string,
  ): 'signer' | 'nip19' | 'relays' | 'filters' | 'delivery' => {
    if (moduleId === 'nip19') return 'nip19';
    if (moduleId === 'nip65' || moduleId === 'relay') return 'relays';
    if (moduleId === 'delivery' || moduleId === 'blossom' || moduleId === 'nsite') return 'delivery';
    return 'signer';
  };

  return (
    <div className="max-w-[1440px] mx-auto flex min-h-[calc(100vh-57px)]">
      {/* Left Module Sidebar */}
      <aside className="hidden lg:block w-[280px] shrink-0 border-r border-slate-200 bg-white sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto">
        <div className="p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-900">TypeScript SDK Modules</div>
          <div className="text-[11px] text-slate-500 font-mono">
            @nostrspec/sdk · {nipContractModules.length} NIP core · {sdkExtensionModules.length} add-ons
          </div>
        </div>

        <nav aria-label="SDK Modules">
          {renderSidebarGroup(
            'Core NIP Contracts',
            'From official nostr-protocol/nips',
            nipContractModules,
            false,
          )}
          {renderSidebarGroup(
            'SDK Engineering Add-Ons',
            'Added reliability layer · Not official NIP text',
            sdkExtensionModules,
            true,
          )}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <a
            href="/api/sdk/bundle"
            download="nostrspec-sdk.ts"
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download Full Bundle (.ts)</span>
          </a>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Zero-bloat TypeScript built on audited @noble/curves, @noble/hashes, and @scure/base.
          </p>
        </div>
      </aside>

      {/* Main Module Documentation */}
      <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-10 py-8">
        <div className="max-w-[920px] space-y-8">
          {/* Mobile Module Selector */}
          <div className="lg:hidden">
            <label htmlFor="sdk-module-select" className="block text-xs font-medium text-slate-600 mb-1.5">
              Select SDK Module
            </label>
            <select
              id="sdk-module-select"
              value={activeModule.id}
              onChange={(e) => onSelectModule(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
            >
              <optgroup label="Core NIP Contracts (Official nostr-protocol/nips)">
                {nipContractModules.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.file} — {mod.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="SDK Engineering Add-Ons (Not Official NIP Text)">
                {sdkExtensionModules.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.file} — {mod.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Module Header */}
          <header className="pb-6 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono text-slate-700">src/sdk/{activeModule.file}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  activeModule.origin === 'sdk-extension'
                    ? 'text-amber-800 font-medium'
                    : 'text-slate-700 font-medium'
                }
              >
                {activeModule.origin === 'sdk-extension'
                  ? 'SDK Engineering Add-On (not official NIP text)'
                  : 'Official NIP Contract'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {activeModule.origin === 'sdk-extension' ? 'Builds on ' : 'Implements '}
                {activeModule.nips.map((nipId, idx) => (
                  <span key={nipId}>
                    {idx > 0 && ', '}
                    <button
                      type="button"
                      onClick={() => onSelectNip(nipId)}
                      className="text-indigo-700 hover:underline font-medium"
                    >
                      NIP-{nipId}
                    </button>
                  </span>
                ))}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {activeModule.title}
              </h1>
              <button
                type="button"
                onClick={() => onOpenPlayground(playgroundTabForModule(activeModule.id))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Run in Playground</span>
              </button>
            </div>

            <p className="text-[15px] leading-relaxed text-slate-600 max-w-[74ch]">
              {activeModule.summary}
            </p>

            {activeModule.origin === 'sdk-extension' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-950 max-w-[74ch]">
                <strong className="font-semibold">
                  Added SDK Layer — Not from the official NIP documents:
                </strong>{' '}
                {activeModule.engineeringNote ??
                  'This module provides optional client-side safety, routing, or storage policies built on top of official Nostr NIPs. It is not normative text from nostr-protocol/nips.'}
              </div>
            )}
          </header>

          {/* Usage Example */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Usage Example</h2>
            <CodeBlock
              code={activeModule.exampleCode}
              language="typescript"
              title={`example-${activeModule.id}.ts`}
            />
          </section>

          {/* Exported Symbols Table */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Exported API Reference ({activeModule.symbols.length})
            </h2>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Symbol & Signature</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Behavior</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 w-28">Spec</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeModule.symbols.map((sym) => (
                      <tr key={sym.name} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 align-top">
                          <div className="font-mono text-xs font-semibold text-slate-900">
                            {sym.name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 mt-1 break-all">
                            {sym.signature}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 align-top leading-relaxed">
                          {sym.summary}
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {sym.nips.map((nipId) => (
                              <button
                                key={nipId}
                                type="button"
                                onClick={() => onSelectNip(nipId)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                              >
                                <span>NIP-{nipId}</span>
                                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Live TypeScript Source Code */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Complete Module Source
              </h2>
              <span className="text-xs font-mono text-slate-500">src/sdk/{activeModule.file}</span>
            </div>

            {loading ? (
              <div className="h-64 rounded-lg bg-slate-100 animate-pulse" />
            ) : error ? (
              <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <CodeBlock
                code={activeSource}
                language="typescript"
                title={`src/sdk/${activeModule.file}`}
                downloadFilename={activeModule.file}
                maxHeightClass="max-h-[540px]"
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
