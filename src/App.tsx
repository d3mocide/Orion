import { useEffect, useState, useRef } from "react";
import { wrap } from "comlink";
import type { PropagatorAPI } from "@/features/orbital-mechanics/types";
import { bootstrapGroup } from "@/features/telemetry-ingestion";
import { allocatePoints } from "@/features/spatial-rendering/cesium/pointPrimitivePool";
import { CesiumGlobe } from "@/features/spatial-rendering/cesium/CesiumGlobe";
import { TopBar } from "@/features/ui-shell/TopBar";
import { Sidebar } from "@/features/ui-shell/Sidebar";
import { SatelliteDetailPanel } from "@/features/ui-shell/SatelliteDetailPanel";
import { VirtualizedCatalogTable } from "@/features/ui-shell/VirtualizedCatalogTable";
import { useUIStore } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";
import type { OMMRecord } from "@/shared/types/omm";

function App() {
  const [propagator, setPropagator] = useState<PropagatorAPI | null>(null);
  const [catalogRows, setCatalogRows] = useState<OMMRecord[]>([]);
  const workerRef = useRef<Worker | null>(null);

  const setCatalogSize = useUIStore((s) => s.setCatalogSize);
  const setDetailPanelOpen = useUIStore((s) => s.setDetailPanelOpen);
  const selectedId = useSelectionStore((s) => s.selectedNoradId);

  // Open detail panel when a satellite is selected
  useEffect(() => {
    setDetailPanelOpen(selectedId !== null);
  }, [selectedId, setDetailPanelOpen]);

  // Boot: spin up worker, load catalog
  useEffect(() => {
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
          // Background revalidation delta — merge into catalog
          const { accepted } = await api.loadCatalog(update.records);
          setCatalogSize(accepted);
          setCatalogRows(update.records);
          allocatePoints(
            update.records.map((r) => ({ noradId: r.NORAD_CAT_ID, status: "unknown" as const })),
          );
        });

        const { accepted } = await api.loadCatalog(result.records);
        setCatalogSize(accepted);
        setCatalogRows(result.records);
        allocatePoints(
          result.records.map((r) => ({ noradId: r.NORAD_CAT_ID, status: "unknown" as const })),
        );
      } catch (err) {
        console.error("[App] Failed to bootstrap catalog:", err);
      }
    })();

    return () => {
      worker.terminate();
    };
  }, [setCatalogSize]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-space-bg">
      <CesiumGlobe propagator={propagator} />
      <TopBar />
      <Sidebar />
      <SatelliteDetailPanel />
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
