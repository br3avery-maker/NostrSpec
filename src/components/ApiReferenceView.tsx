import { useMemo, useState } from 'react';
import { ArrowRight, Download, Search, Terminal } from 'lucide-react';
import {
  generateCliInvocation,
  generateConformanceSuite,
  generateHttpRequestExample,
  generateMcpToolsManifest,
  generateOpenApiSpec,
  generateSingleOperationOpenApi,
  generateTypeScriptInterface,
} from '../registry/generators';
import {
  LANGUAGE_META,
  OPERATION_GROUPS,
  OPERATION_REGISTRY,
  type CompatibilityState,
  type OperationContract,
  type TargetLanguage,
} from '../registry/operations';
import { CodeBlock } from './CodeBlock';
import type { PlaygroundTab } from './SdkPlaygroundView';

interface ApiReferenceViewProps {
  selectedOperationId: string;
  onSelectOperation: (operationId: string) => void;
  onSelectNip: (nipId: string) => void;
  onOpenSdkModule: (moduleId: string) => void;
  onOpenPlayground: (tab?: PlaygroundTab) => void;
}

type ApiSubMode = 'docs' | 'artifacts';
type DerivedContractTab = 'types' | 'mcp' | 'openapi';
type ArtifactTab = 'openapi' | 'mcp' | 'conformance' | 'registry';

const LANGUAGES: TargetLanguage[] = [
  'typescript',
  'python',
  'rust',
  'go',
  'csharp',
  'cli',
  'http',
];

function formatCompatibilityCell(state: CompatibilityState): { label: string; className: string } {
  switch (state) {
    case 'implemented':
      return { label: 'Live SDK', className: 'text-emerald-700 font-medium' };
    case 'generated':
      return { label: 'Generated', className: 'text-indigo-700 font-medium' };
    case 'illustrative':
      return { label: 'Contract', className: 'text-slate-500' };
  }
}

export function ApiReferenceView({
  selectedOperationId,
  onSelectOperation,
  onSelectNip,
  onOpenSdkModule,
  onOpenPlayground,
}: ApiReferenceViewProps) {
  const [subMode, setSubMode] = useState<ApiSubMode>('docs');
  const [language, setLanguage] = useState<TargetLanguage>('typescript');
  const [search, setSearch] = useState('');
  const [derivedTab, setDerivedTab] = useState<DerivedContractTab>('types');
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('openapi');

  const activeOp: OperationContract = useMemo(
    () =>
      OPERATION_REGISTRY.find((op) => op.id === selectedOperationId) ?? OPERATION_REGISTRY[0],
    [selectedOperationId],
  );

  const filteredOperations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return OPERATION_REGISTRY;
    return OPERATION_REGISTRY.filter(
      (op) =>
        op.title.toLowerCase().includes(q) ||
        op.id.toLowerCase().includes(q) ||
        op.group.toLowerCase().includes(q) ||
        op.mcpToolName.toLowerCase().includes(q) ||
        op.nips.some((n) => `nip-${n.toLowerCase()}`.includes(q) || n.toLowerCase().includes(q)),
    );
  }, [search]);

  const activeCode = useMemo(() => {
    if (language === 'cli') return generateCliInvocation(activeOp);
    if (language === 'http') return generateHttpRequestExample(activeOp);
    return activeOp.examples[language];
  }, [activeOp, language]);

  const activeLanguageMeta = LANGUAGE_META[language];

  const derivedContractPreview = useMemo(() => {
    if (derivedTab === 'types') {
      return {
        title: `${activeOp.id}.d.ts`,
        language: 'typescript',
        code: generateTypeScriptInterface(activeOp),
      };
    }
    if (derivedTab === 'mcp') {
      const manifest = generateMcpToolsManifest([activeOp]);
      return {
        title: `mcp-tool — ${activeOp.mcpToolName}.json`,
        language: 'json',
        code: JSON.stringify(manifest.tools[0], null, 2),
      };
    }
    return {
      title: `openapi-3.1 — ${activeOp.http.method} ${activeOp.http.path}`,
      language: 'json',
      code: JSON.stringify(generateSingleOperationOpenApi(activeOp), null, 2),
    };
  }, [activeOp, derivedTab]);

  const fullArtifacts = useMemo(() => {
    return {
      openapi: {
        label: 'OpenAPI 3.1 Spec',
        endpoint: '/api/registry/openapi.json',
        filename: 'nostrspec-openapi-3.1.json',
        code: JSON.stringify(generateOpenApiSpec(OPERATION_REGISTRY), null, 2),
      },
      mcp: {
        label: 'MCP Tools Manifest',
        endpoint: '/api/registry/mcp-tools.json',
        filename: 'nostrspec-mcp-tools.json',
        code: JSON.stringify(generateMcpToolsManifest(OPERATION_REGISTRY), null, 2),
      },
      conformance: {
        label: 'Conformance Test Suite',
        endpoint: '/api/registry/conformance.json',
        filename: 'nostrspec-conformance-vectors.json',
        code: JSON.stringify(generateConformanceSuite(OPERATION_REGISTRY), null, 2),
      },
      registry: {
        label: 'Full Operation Registry',
        endpoint: '/api/registry',
        filename: 'nostrspec-operation-registry.json',
        code: JSON.stringify(
          {
            registry: 'nostrspec-operation-registry',
            version: '1.0.0',
            operationCount: OPERATION_REGISTRY.length,
            operations: OPERATION_REGISTRY,
          },
          null,
          2,
        ),
      },
    };
  }, []);

  const relatedOperations = useMemo(
    () =>
      activeOp.relatedIds
        .map((id) => OPERATION_REGISTRY.find((o) => o.id === id))
        .filter((o): o is OperationContract => Boolean(o)),
    [activeOp],
  );

  return (
    <div className="max-w-[1440px] mx-auto flex min-h-[calc(100vh-57px)]">
      {/* Left Operations Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[276px] shrink-0 border-r border-slate-200 bg-white sticky top-[57px] h-[calc(100vh-57px)]">
        <div className="p-4 space-y-3 border-b border-slate-200">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-slate-900">API Reference</div>
            <div className="text-[11px] text-slate-500 font-mono">
              {OPERATION_REGISTRY.length} operations · 7 distributions
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-slate-100 border border-slate-200/70">
            <button
              type="button"
              onClick={() => {
                setSubMode('docs');
                window.scrollTo({ top: 0 });
              }}
              className={`py-1 text-[11px] font-medium rounded transition-colors ${
                subMode === 'docs'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Operations
            </button>
            <button
              type="button"
              onClick={() => {
                setSubMode('artifacts');
                window.scrollTo({ top: 0 });
              }}
              className={`py-1 text-[11px] font-medium rounded transition-colors ${
                subMode === 'artifacts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Artifacts & Matrix
            </button>
          </div>

          {subMode === 'docs' && (
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="api-ops-search" className="sr-only">
                Search API operations
              </label>
              <input
                id="api-ops-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search publish, nip19, mcp..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        <nav aria-label="API Operations" className="flex-1 overflow-y-auto">
          {OPERATION_GROUPS.map((group) => {
            const ops = filteredOperations.filter((o) => o.group === group);
            if (ops.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-4 py-2 bg-slate-50/90 border-y border-slate-200/70 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  {group}
                </div>
                <div className="divide-y divide-slate-100">
                  {ops.map((op) => {
                    const isSelected = subMode === 'docs' && op.id === activeOp.id;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => {
                          onSelectOperation(op.id);
                          setSubMode('docs');
                        }}
                        className={`w-full text-left px-4 py-2.5 transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/75 text-indigo-950'
                            : 'bg-white hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div
                          className={`text-[13px] font-medium leading-snug ${
                            isSelected ? 'text-indigo-800' : 'text-slate-900'
                          }`}
                        >
                          {op.title}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">
                          <span>{op.nips.slice(0, 2).map((n) => `NIP-${n}`).join(' · ')}</span>
                          {op.origin === 'sdk-extension' && (
                            <>
                              <span className="mx-1" aria-hidden="true">·</span>
                              <span className="text-amber-800 font-sans font-medium">Add-On</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50/60 space-y-1.5 text-[11px]">
          <div className="font-semibold text-slate-700">Machine-Readable Exports</div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-indigo-700">
            <a
              href="/api/registry/openapi.json"
              download="nostrspec-openapi-3.1.json"
              className="hover:underline font-medium"
            >
              OpenAPI 3.1
            </a>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <a
              href="/api/registry/mcp-tools.json"
              download="nostrspec-mcp-tools.json"
              className="hover:underline font-medium"
            >
              MCP Tools
            </a>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <a
              href="/api/registry/conformance.json"
              download="nostrspec-conformance-vectors.json"
              className="hover:underline font-medium"
            >
              Test Vectors
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-10 py-8">
        {/* Mobile Controls */}
        <div className="lg:hidden mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setSubMode('docs')}
              className={`py-1.5 text-xs font-medium rounded-md ${
                subMode === 'docs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Operation Docs
            </button>
            <button
              type="button"
              onClick={() => setSubMode('artifacts')}
              className={`py-1.5 text-xs font-medium rounded-md ${
                subMode === 'artifacts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Artifacts & Matrix
            </button>
          </div>
          {subMode === 'docs' && (
            <div>
              <label htmlFor="mobile-op-select" className="block text-xs font-medium text-slate-600 mb-1">
                Select Operation
              </label>
              <select
                id="mobile-op-select"
                value={activeOp.id}
                onChange={(e) => onSelectOperation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
              >
                {OPERATION_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {OPERATION_REGISTRY.filter((o) => o.group === group).map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.title} ({op.nips.map((n) => `NIP-${n}`).join(', ')})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* MODE A: Multi-Language Operation Documentation */}
        {subMode === 'docs' ? (
          <div className="max-w-[1120px] space-y-6">
            {/* Operation Breadcrumb & Metadata Header */}
            <header className="pb-6 border-b border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">API reference</span>
                {activeOp.breadcrumb.map((crumb, idx) => (
                  <span key={crumb} className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">/</span>
                    <span className={idx === activeOp.breadcrumb.length - 1 ? 'text-slate-900 font-medium' : ''}>
                      {crumb}
                    </span>
                  </span>
                ))}
              </div>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {activeOp.title}
                  </h1>
                  <p className="text-[15px] leading-relaxed text-slate-600 max-w-[66ch]">
                    {activeOp.summary}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenSdkModule(activeOp.sdkModuleId)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    View {activeOp.sdkModuleId}.ts
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPlayground(activeOp.playgroundTab)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Run in Playground</span>
                  </button>
                </div>
              </div>

              {/* Unboxed Protocol & Origin Metadata Line */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 pt-1">
                <span>
                  {activeOp.nips.map((nipId, idx) => (
                    <span key={nipId}>
                      {idx > 0 && ', '}
                      <button
                        type="button"
                        onClick={() => onSelectNip(nipId)}
                        className="font-mono font-semibold text-indigo-700 hover:underline"
                      >
                        NIP-{nipId}
                      </button>
                    </span>
                  ))}
                </span>
                {activeOp.eventKinds.length > 0 && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono text-slate-800">
                      Kind {activeOp.eventKinds.join(', ')}
                    </span>
                  </>
                )}
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span
                  className={
                    activeOp.origin === 'sdk-extension'
                      ? 'text-amber-800 font-medium'
                      : 'text-slate-800 font-medium'
                  }
                >
                  {activeOp.origin === 'sdk-extension'
                    ? 'SDK Engineering Add-On (not official NIP text)'
                    : 'Official NIP Contract'}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono text-slate-500">
                  MCP: {activeOp.mcpToolName}
                </span>
              </div>

              {activeOp.origin === 'sdk-extension' && activeOp.engineeringNote && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-950">
                  <strong className="font-semibold">
                    Added SDK Layer — Not from the official NIP documents:
                  </strong>{' '}
                  {activeOp.engineeringNote}
                </div>
              )}
            </header>

            {/* 2-Column Stripe-Style Contract & Multi-Language Implementation Split */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              {/* Left Column: Specification, Parameters, Returns, Errors, Test Vectors */}
              <div className="xl:col-span-6 space-y-8 min-w-0">
                {/* Parameters Table */}
                <section className="space-y-3">
                  <h2 className="text-base font-semibold text-slate-900">Parameters</h2>
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/80">
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Name</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Type</th>
                            <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 w-20">Required</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeOp.parameters.map((param) => (
                            <tr key={param.name} className="align-top">
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs font-semibold text-slate-900">
                                  {param.name}
                                </div>
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                  {param.description}
                                </p>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                                {param.type}
                              </td>
                              <td className="px-4 py-3 text-xs whitespace-nowrap">
                                <span
                                  className={
                                    param.required
                                      ? 'font-semibold text-slate-900'
                                      : 'text-slate-500'
                                  }
                                >
                                  {param.required ? 'Yes' : 'No'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                {/* Returns */}
                <section className="space-y-3">
                  <h2 className="text-base font-semibold text-slate-900">Returns</h2>
                  <p className="text-sm text-slate-700 leading-relaxed">{activeOp.returns.summary}</p>
                  <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {activeOp.returns.fields.map((field) => (
                      <div key={field.name} className="px-4 py-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900">{field.name}</span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500">{field.type}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{field.description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Error Conditions */}
                <section className="space-y-3">
                  <h2 className="text-base font-semibold text-slate-900">Error Conditions</h2>
                  <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {activeOp.errors.map((err) => (
                      <div key={err.code} className="px-4 py-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-red-800">{err.code}</span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500">HTTP {err.httpStatus}</span>
                        </div>
                        <p className="text-xs text-slate-700">{err.condition}</p>
                        <p className="text-xs text-slate-500">Recovery: {err.recovery}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Conformance Test Vectors */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      Shared Conformance Vectors
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setArtifactTab('conformance');
                        setSubMode('artifacts');
                      }}
                      className="text-xs font-medium text-indigo-700 hover:underline"
                    >
                      View full test suite
                    </button>
                  </div>
                  {activeOp.testVectors.map((vec) => (
                    <div
                      key={vec.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-900">{vec.title}</div>
                        <span className="font-mono text-[11px] text-slate-500">{vec.id}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{vec.description}</p>
                      <CodeBlock
                        code={JSON.stringify({ input: vec.input, expected: vec.expected }, null, 2)}
                        language="json"
                        title={`vector — ${vec.id}.json`}
                        maxHeightClass="max-h-[200px]"
                      />
                    </div>
                  ))}
                </section>

                {/* Related Operations & Runtime Dependencies */}
                <section className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-slate-900">Related operations</h2>
                    <div className="flex flex-wrap gap-2">
                      {relatedOperations.map((rel) => (
                        <button
                          key={rel.id}
                          type="button"
                          onClick={() => onSelectOperation(rel.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-md transition-colors"
                        >
                          <span>{rel.title}</span>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Dependencies:</span>{' '}
                    {activeOp.dependencies.join(' · ')}
                  </div>
                </section>
              </div>

              {/* Right Column: Language Selector, Code Distribution & Derived Machine Contracts */}
              <div className="xl:col-span-6 xl:sticky xl:top-[76px] space-y-5 min-w-0">
                <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      Language / Distribution
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {activeOp.http.method} {activeOp.http.path}
                    </span>
                  </div>

                  {/* Segmented Language Selector */}
                  <div
                    role="tablist"
                    aria-label="Target language selector"
                    className="flex items-center gap-1 p-1 rounded-md bg-slate-100 border border-slate-200/80 overflow-x-auto"
                  >
                    {LANGUAGES.map((langKey) => {
                      const isSelected = language === langKey;
                      return (
                        <button
                          key={langKey}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => setLanguage(langKey)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                            isSelected
                              ? 'bg-white text-slate-950 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {LANGUAGE_META[langKey].label}
                        </button>
                      );
                    })}
                  </div>

                  <CodeBlock
                    code={activeCode}
                    language={activeLanguageMeta.codeLanguage}
                    title={`${activeLanguageMeta.label} — ${activeOp.id}`}
                    maxHeightClass="max-h-[340px]"
                  />

                  {/* Explicit Honesty & Binding Provenance Line */}
                  <div
                    className={`rounded-md border px-3.5 py-2.5 text-xs leading-relaxed ${
                      activeLanguageMeta.maturity === 'implemented'
                        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                        : activeLanguageMeta.maturity === 'generated'
                          ? 'border-indigo-200 bg-indigo-50/70 text-indigo-950'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-semibold">
                      {activeLanguageMeta.maturity === 'implemented'
                        ? 'Live SDK Binding: '
                        : activeLanguageMeta.maturity === 'generated'
                          ? 'Registry-Generated Interface: '
                          : 'Illustrative API Design: '}
                    </span>
                    <span>{activeLanguageMeta.statusNote}</span>
                  </div>
                </section>

                {/* Live Derived Contract Inspector for This Operation */}
                <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900">
                      Derived from This Contract
                    </div>
                    <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 border border-slate-200/70">
                      {(
                        [
                          ['types', 'TS Types'],
                          ['mcp', 'MCP Tool'],
                          ['openapi', 'OpenAPI 3.1'],
                        ] as Array<[DerivedContractTab, string]>
                      ).map(([tab, label]) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setDerivedTab(tab)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                            derivedTab === tab
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <CodeBlock
                    code={derivedContractPreview.code}
                    language={derivedContractPreview.language}
                    title={derivedContractPreview.title}
                    maxHeightClass="max-h-[260px]"
                  />
                </section>
              </div>
            </div>
          </div>
        ) : (
          /* MODE B: Machine-Readable Artifacts & Multi-Runtime Compatibility Matrix */
          <div className="max-w-[1120px] space-y-8">
            <header className="pb-6 border-b border-slate-200 space-y-2">
              <div className="text-xs text-slate-500">
                <span>API reference</span>
                <span className="mx-1.5" aria-hidden="true">/</span>
                <span className="text-slate-900 font-medium">
                  Machine-Readable Registry & Compatibility
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                One Registry, Every Runtime Interface
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                Every page in API Reference, every OpenAPI 3.1 route, every MCP agent tool schema, every CLI command, and every shared conformance test vector is generated live from <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">src/registry/operations.ts</code>.
              </p>
            </header>

            {/* Implementation & Compatibility Matrix */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  Implementation & Compatibility Matrix ({OPERATION_REGISTRY.length} Operations)
                </h2>
                <div className="text-xs text-slate-500">
                  <span className="text-emerald-700 font-medium">Live SDK</span> = implemented in repo
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="text-indigo-700 font-medium">Generated</span> = live schema output
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="text-slate-600">Contract</span> = spec-ready for binding
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600">
                        <th className="px-4 py-2.5 font-semibold">Operation</th>
                        <th className="px-3 py-2.5 font-semibold">Provenance</th>
                        <th className="px-3 py-2.5 font-semibold">TypeScript</th>
                        <th className="px-3 py-2.5 font-semibold">OpenAPI</th>
                        <th className="px-3 py-2.5 font-semibold">MCP Tool</th>
                        <th className="px-3 py-2.5 font-semibold">CLI</th>
                        <th className="px-3 py-2.5 font-semibold">Py / Rust / Go</th>
                        <th className="px-3 py-2.5 font-semibold">C# / Unity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {OPERATION_REGISTRY.map((op) => {
                        const ts = formatCompatibilityCell(op.compatibility.typescript);
                        const oa = formatCompatibilityCell(op.compatibility.openapi);
                        const mcp = formatCompatibilityCell(op.compatibility.mcp);
                        const cli = formatCompatibilityCell(op.compatibility.cli);
                        const others = formatCompatibilityCell(op.compatibility.python);
                        const cs = formatCompatibilityCell(op.compatibility.csharpUnity);
                        return (
                          <tr key={op.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectOperation(op.id);
                                  setSubMode('docs');
                                }}
                                className="font-medium text-indigo-700 hover:underline text-left"
                              >
                                {op.title}
                              </button>
                              <div className="font-mono text-[11px] text-slate-400">{op.id}</div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span
                                className={
                                  op.origin === 'sdk-extension'
                                    ? 'text-amber-800 font-medium'
                                    : 'text-slate-700'
                                }
                              >
                                {op.origin === 'sdk-extension' ? 'SDK Add-On' : 'NIP Contract'}
                              </span>
                            </td>
                            <td className={`px-3 py-2.5 whitespace-nowrap ${ts.className}`}>{ts.label}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap ${oa.className}`}>{oa.label}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap ${mcp.className}`}>{mcp.label}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap ${cli.className}`}>{cli.label}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap ${others.className}`}>{others.label}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap ${cs.className}`}>{cs.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Live Machine-Readable Artifact Inspector */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80 overflow-x-auto self-start">
                  {(
                    [
                      ['openapi', 'OpenAPI 3.1'],
                      ['mcp', 'MCP Tools'],
                      ['conformance', 'Conformance Vectors'],
                      ['registry', 'Full Registry JSON'],
                    ] as Array<[ArtifactTab, string]>
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setArtifactTab(tab)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        artifactTab === tab
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <a
                  href={fullArtifacts[artifactTab].endpoint}
                  download={fullArtifacts[artifactTab].filename}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download {fullArtifacts[artifactTab].filename}</span>
                </a>
              </div>

              <CodeBlock
                code={fullArtifacts[artifactTab].code}
                language="json"
                title={`${fullArtifacts[artifactTab].label} — GET ${fullArtifacts[artifactTab].endpoint}`}
                downloadFilename={fullArtifacts[artifactTab].filename}
                maxHeightClass="max-h-[500px]"
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
