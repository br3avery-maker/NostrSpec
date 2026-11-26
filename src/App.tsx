import { useCallback, useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { NipsIndexData } from './lib/nipsParser';
import { ApiReferenceView } from './components/ApiReferenceView';
import { CompatibilityView } from './components/CompatibilityView';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { NipsDirectoryView } from './components/NipsDirectoryView';
import { EventKindsView } from './components/EventKindsView';
import { SdkReferenceView } from './components/SdkReferenceView';
import { SdkPlaygroundView, type PlaygroundTab } from './components/SdkPlaygroundView';
import { RoadmapView } from './components/RoadmapView';

type AppView = 'nips' | 'kinds' | 'api' | 'sdk' | 'compatibility' | 'playground' | 'roadmap';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('api');
  const [selectedNipId, setSelectedNipId] = useState<string>('01');
  const [selectedKindSearch, setSelectedKindSearch] = useState<string>('');
  const [selectedOperationId, setSelectedOperationId] = useState<string>('events.publish');
  const [selectedSdkModule, setSelectedSdkModule] = useState<string>('nip01');
  const [playgroundTab, setPlaygroundTab] = useState<PlaygroundTab>('signer');
  const [searchOpen, setSearchOpen] = useState(false);

  const [indexData, setIndexData] = useState<NipsIndexData | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadIndex = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setSyncing(true);
    else setIndexLoading(true);
    try {
      const res = await fetch(forceRefresh ? '/api/nips/index?refresh=1' : '/api/nips/index');
      if (res.ok) {
        const data = (await res.json()) as NipsIndexData;
        setIndexData(data);
      }
    } finally {
      setIndexLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadIndex(false);
  }, [loadIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (
        e.key === '/' &&
        !searchOpen &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  const handleSelectNip = useCallback((nipId: string) => {
    setSelectedNipId(nipId.toUpperCase());
    setActiveView('nips');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectKind = useCallback((kind: string) => {
    setSelectedKindSearch(kind);
    setActiveView('kinds');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectOperation = useCallback((operationId: string) => {
    setSelectedOperationId(operationId);
    setActiveView('api');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenSdkModule = useCallback((moduleId: string) => {
    setSelectedSdkModule(moduleId);
    setActiveView('sdk');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenPlayground = useCallback((tab: PlaygroundTab = 'signer') => {
    setPlaygroundTab(tab);
    setActiveView('playground');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'nips', label: 'NIPs' },
    { id: 'kinds', label: 'Event Kinds' },
    { id: 'api', label: 'API Reference' },
    { id: 'sdk', label: 'SDK Modules' },
    { id: 'compatibility', label: 'Compatibility' },
    { id: 'playground', label: 'Playground' },
    { id: 'roadmap', label: 'Roadmap' },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => handleSelectOperation('events.publish')}
            className="text-lg font-display font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-600 rounded"
          >
            NostrSpec
          </button>

          {/* Zone 2: Single-line text navigation links */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-5">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-1 text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'text-indigo-700 border-indigo-600'
                      : 'text-slate-600 hover:text-slate-950 border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Global Search trigger + primary SDK download */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Open global fuzzy search"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline font-mono text-[10px] text-slate-400">⌘K</kbd>
            </button>
            <a
              href="/api/sdk/bundle"
              download="nostrspec-sdk.ts"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download SDK</span>
            </a>
          </div>
        </div>

        {/* Compact mobile & tablet navigation row */}
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden flex items-center gap-1 px-3 py-1.5 border-t border-slate-100 bg-slate-50/80 overflow-x-auto"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1">
        {activeView === 'nips' && (
          <NipsDirectoryView
            nips={indexData?.nips ?? []}
            eventKinds={indexData?.eventKinds ?? []}
            selectedNipId={selectedNipId}
            onSelectNip={handleSelectNip}
            onOpenSdkModule={handleOpenSdkModule}
            onOpenPlayground={handleOpenPlayground}
            onSyncUpstream={() => loadIndex(true)}
            syncing={syncing}
            indexLoading={indexLoading}
            fetchedAt={indexData?.fetchedAt}
            fromFallback={indexData?.fromFallback}
          />
        )}

        {activeView === 'kinds' && (
          <EventKindsView
            key={selectedKindSearch}
            eventKinds={indexData?.eventKinds ?? []}
            wireMessages={indexData?.wireMessages ?? []}
            onSelectNip={handleSelectNip}
            loading={indexLoading}
            initialSearch={selectedKindSearch}
          />
        )}

        {activeView === 'api' && (
          <ApiReferenceView
            selectedOperationId={selectedOperationId}
            onSelectOperation={handleSelectOperation}
            onSelectNip={handleSelectNip}
            onOpenSdkModule={handleOpenSdkModule}
            onOpenPlayground={handleOpenPlayground}
          />
        )}

        {activeView === 'sdk' && (
          <SdkReferenceView
            selectedModuleId={selectedSdkModule}
            onSelectModule={setSelectedSdkModule}
            onSelectNip={handleSelectNip}
            onOpenPlayground={handleOpenPlayground}
          />
        )}

        {activeView === 'compatibility' && (
          <CompatibilityView
            nips={indexData?.nips ?? []}
            loading={indexLoading}
            onSelectNip={handleSelectNip}
            onOpenSdkModule={handleOpenSdkModule}
            onOpenRoadmap={() => {
              setActiveView('roadmap');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {activeView === 'playground' && (
          <SdkPlaygroundView
            key={playgroundTab}
            initialTab={playgroundTab}
            onSelectNip={handleSelectNip}
          />
        )}

        {activeView === 'roadmap' && (
          <RoadmapView
            onSelectNip={handleSelectNip}
            onOpenSdkModule={handleOpenSdkModule}
          />
        )}
      </div>

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        nips={indexData?.nips ?? []}
        eventKinds={indexData?.eventKinds ?? []}
        onSelectNip={handleSelectNip}
        onSelectKind={handleSelectKind}
        onOpenSdkModule={handleOpenSdkModule}
        onSelectOperation={handleSelectOperation}
      />
    </div>
  );
}
