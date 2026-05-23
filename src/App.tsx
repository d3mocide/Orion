import { useEffect, useRef, useState } from "react";
import { wrap } from "comlink";
import type { PropagatorAPI, SatelliteMetadata } from "@/features/orbital-mechanics/types";
import { classifyOrbitRegime } from "@/features/orbital-mechanics/orbitUtils";
import { bootstrapGroup } from "@/features/telemetry-ingestion";
import {
  allocatePoints,
  applyFilters,
  type PointCatalogEntry,
} from "@/features/spatial-rendering/cesium/pointPrimitivePool";
import { loadUCSData, getUCSRecord } from "@/features/osint-intelligence/ucs-database";
import { readCachedUCS } from "@/features/telemetry-ingestion/cache/indexeddb";
import { CesiumGlobe } from "@/features/spatial-rendering/cesium/CesiumGlobe";
import { TopBar } from "@/features/ui-shell/TopBar";
import { Sidebar } from "@/features/ui-shell/Sidebar";
import { SatelliteDetailPanel } from "@/features/ui-shell/SatelliteDetailPanel";
import { VirtualizedCatalogTable } from "@/features/ui-shell/VirtualizedCatalogTable";
import { useUIStore } from "@/shared/store/ui.store";
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

  const setCatalogSize = useUIStore((s) => s.setCatalogSize);
  const setDetailPanelOpen = useUIStore((s) => s.setDetailPanelOpen);
  const setUcsLoaded = useUIStore((s) => s.setUcsLoaded);
  const selectedId = useSelectionStore((s) => s.selectedNoradId);

  // Open detail panel when a satellite is selected
  useEffect(() => {
    setDetailPanelOpen(selectedId !== null);
  }, [selectedId, setDetailPanelOpen]);

  // Fetch propagator metadata when selection changes
  useEffect(() => {
    if (!selectedId || !propagator) {
      setSelectedMeta(null);
      return;
    }
    void propagator.getMetadata(selectedId).then(setSelectedMeta);
  }, [selectedId, propagator]);

  // Subscribe to filter state changes → apply point visibility in O(n)
  useEffect(() => {
    const unsub = useFiltersStore.subscribe(({ regimes, operators, countries, purposes }) => {
      applyFilters(regimes, operators, countries, purposes);
    });
    return unsub;
  }, []);

  // Boot: load UCS data from IndexedDB, spin up worker, load catalog
  useEffect(() => {
    // UCS bootstrap (non-blocking)
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
    const api = wrap<PropagatorAPI>(worker);
    setPropagator(api);

    void (async () => {
      try {
        const result = await bootstrapGroup("active", async (update) => {
          const { accepted } = await api.loadCatalog(update.records);
          setCatalogSize(accepted);
          setCatalogRows(update.records);
          allocatePoints(buildCatalogEntries(update.records));
          // Re-apply current filter state after catalog update
          const f = useFiltersStore.getState();
          applyFilters(f.regimes, f.operators, f.countries, f.purposes);
        });

        const { accepted } = await api.loadCatalog(result.records);
        setCatalogSize(accepted);
        setCatalogRows(result.records);
        allocatePoints(buildCatalogEntries(result.records));
        // Apply filter state on initial load
        const f = useFiltersStore.getState();
        applyFilters(f.regimes, f.operators, f.countries, f.purposes);
      } catch (err) {
        console.error("[App] Failed to bootstrap catalog:", err);
      }
    })();

    return () => {
      worker.terminate();
    };
  }, [setCatalogSize, setUcsLoaded]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-space-bg">
      <CesiumGlobe propagator={propagator} />
      <TopBar />
      <Sidebar />
      <SatelliteDetailPanel meta={selectedMeta} />
      <VirtualizedCatalogTable
        rows={catalogRows.map((r) => ({
          noradId: r.NORAD_CAT_ID,
          name: r.OBJECT_NAME,
          epoch: r.EPOCH,
        }))}
      />
    </div>
  );
}

export default App;
