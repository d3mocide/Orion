import { useEffect, useRef, useState } from "react";
import { wrap } from "comlink";
import type { PropagatorAPI, SatelliteMetadata } from "@/features/orbital-mechanics/types";
import { classifyOrbitRegime } from "@/features/orbital-mechanics/orbitUtils";
import { bootstrapGroup, type IngestionResult } from "@/features/telemetry-ingestion";
import {
  allocatePoints,
  applyFilters,
  type PointCatalogEntry,
} from "@/features/spatial-rendering/three/satPoints";
import { loadUCSData, getUCSRecord } from "@/features/osint-intelligence/ucs-database";
import { readCachedUCS } from "@/features/telemetry-ingestion/cache/indexeddb";
import { OrionScene } from "@/features/spatial-rendering/three/OrionScene";
import { TopBar } from "@/features/ui-shell/TopBar";
import { Sidebar } from "@/features/ui-shell/Sidebar";
import { StatusBar } from "@/features/ui-shell/StatusBar";
import { MobileNav } from "@/features/ui-shell/MobileNav";
import { SatelliteDetailPanel } from "@/features/ui-shell/SatelliteDetailPanel";
import { VirtualizedCatalogTable } from "@/features/ui-shell/VirtualizedCatalogTable";
import { useUIStore } from "@/shared/store/ui.store";
import { useIsMobile } from "@/shared/hooks/useMediaQuery";
import { useSelectionStore } from "@/shared/store/selection.store";
import { useFiltersStore } from "@/shared/store/filters.store";
import type { OMMRecord } from "@/shared/types/omm";

function buildCatalogEntries(records: OMMRecord[]): PointCatalogEntry[] {
  return records.map((r) => {
    const ucs = getUCSRecord(r.NORAD_CAT_ID);
    return {
      noradId: r.NORAD_CAT_ID,
      status: "unknown" as const,
      regime: classifyOrbitRegime(r),
      operator: ucs?.operator ?? "",
      country: ucs?.country ?? "",
      purpose: ucs?.purpose ?? "",
    };
  });
}

function App() {
  const [propagator, setPropagator] = useState<PropagatorAPI | null>(null);
  const [catalogRows, setCatalogRows] = useState<OMMRecord[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<SatelliteMetadata | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const group = useUIStore((s) => s.group);
  const setCatalogSize = useUIStore((s) => s.setCatalogSize);
  const setDetailPanelOpen = useUIStore((s) => s.setDetailPanelOpen);
  const openExclusivePanel = useUIStore((s) => s.openExclusivePanel);
  const setDataSource = useUIStore((s) => s.setDataSource);
  const setUcsLoaded = useUIStore((s) => s.setUcsLoaded);
  const selectedId = useSelectionStore((s) => s.selectedNoradId);
  const isMobile = useIsMobile();

  // Open detail panel when a satellite is selected. On phones only one
  // bottom sheet fits at a time, so selection swaps the open panel.
  useEffect(() => {
    if (selectedId && isMobile) {
      openExclusivePanel("detail");
    } else {
      setDetailPanelOpen(selectedId !== null);
    }
  }, [selectedId, isMobile, setDetailPanelOpen, openExclusivePanel]);

  // Fetch propagator metadata when selection changes
  useEffect(() => {
    if (!selectedId || !propagator) {
      setSelectedMeta(null);
      return;
    }
    void propagator.getMetadata(selectedId).then(setSelectedMeta);
  }, [selectedId, propagator]);

  // Filter state changes → O(n) point visibility update
  useEffect(() => {
    const unsub = useFiltersStore.subscribe(({ regimes, operators, countries, purposes }) => {
      applyFilters(regimes, operators, countries, purposes);
    });
    return unsub;
  }, []);

  // Boot once: UCS from IndexedDB + spin up the propagation worker
  useEffect(() => {
    void readCachedUCS().then((csv) => {
      if (csv) {
        loadUCSData(csv);
        setUcsLoaded(true);
      }
    });

    const worker = new Worker(
      new URL("./features/orbital-mechanics/worker/propagator.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    // Comlink proxies are function-typed; wrap in an updater so React stores
    // the proxy instead of invoking it as a setState updater function
    const api = wrap<PropagatorAPI>(worker);
    setPropagator(() => api);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setUcsLoaded]);

  // Catalog ingestion — reruns when the constellation group changes
  useEffect(() => {
    if (!propagator) return;
    const api = propagator;
    let cancelled = false;

    const applyCatalog = async (result: IngestionResult) => {
      const { accepted } = await api.loadCatalog(result.records);
      if (cancelled) return;
      setCatalogSize(accepted);
      setCatalogRows(result.records);
      allocatePoints(buildCatalogEntries(result.records));
      const f = useFiltersStore.getState();
      applyFilters(f.regimes, f.operators, f.countries, f.purposes);
      setDataSource(result.demo ? "demo" : result.fromCache ? "cache" : "live");
    };

    setDataSource("loading");
    useSelectionStore.getState().select(null);

    void (async () => {
      try {
        const result = await bootstrapGroup(group, (update) => {
          void applyCatalog(update);
        });
        if (!cancelled) await applyCatalog(result);
      } catch (err) {
        console.error("[App] Failed to bootstrap catalog:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [propagator, group, setCatalogSize, setDataSource]);

  return (
    <div className="bg-void relative h-full w-full overflow-hidden">
      <OrionScene propagator={propagator} />

      {/* UI shell: a non-interactive flex column over the globe. Rows own
          their space (top bar / panels / drawer / status), so panels can
          never overlap each other regardless of viewport size. */}
      <div
        className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-2 sm:gap-3 sm:p-3"
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <TopBar
          searchRows={catalogRows.map((r) => ({ noradId: r.NORAD_CAT_ID, name: r.OBJECT_NAME }))}
        />

        {/* Main row: sidebar | globe (spacer) | detail panel */}
        <div className="flex min-h-0 flex-1 items-stretch gap-3">
          <Sidebar />
          <div className="min-w-0 flex-1" />
          <SatelliteDetailPanel meta={selectedMeta} propagator={propagator} />
        </div>

        <VirtualizedCatalogTable
          rows={catalogRows.map((r) => ({
            noradId: r.NORAD_CAT_ID,
            name: r.OBJECT_NAME,
            epoch: r.EPOCH,
          }))}
        />
        <StatusBar />
        <MobileNav />
      </div>
    </div>
  );
}

export default App;
