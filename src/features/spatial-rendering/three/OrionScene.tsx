/**
 * React mount for the Three.js scene. React owns only lifecycle and tooltip
 * state; the render loop runs outside reconciliation and reads sim state via
 * zustand getState() (C6).
 *
 * Propagation is decoupled from the frame rate: the camera, Earth spin, and
 * ambience render at display refresh while SGP4 results stream in from the
 * worker as fast as the worker can produce them.
 */

import { useEffect, useRef, useState } from "react";
import type { PropagatorAPI, SatelliteMetadata } from "@/features/orbital-mechanics/types";
import { useUIStore } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";
import { useObserverStore } from "@/shared/store/observer.store";
import { lookAnglesFromEci } from "@/shared/utils/astro";
import { OrionSceneManager } from "./sceneManager";
import { updatePointPositions, pickSatellite, getSlotIndex, getEciAtIndex } from "./satPoints";

interface OrionSceneProps {
  propagator: PropagatorAPI | null;
}

interface TooltipState {
  x: number;
  y: number;
  noradId: string;
  name: string;
  altKm: number;
  velKms: number;
}

const MU_KM3_S2 = 398_600.4418;
const R_EARTH_KM = 6371;

export function OrionScene({ propagator }: OrionSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<OrionSceneManager | null>(null);
  const posBufferRef = useRef<Float64Array | null>(null);
  const propagatorRef = useRef<PropagatorAPI | null>(null);
  const metaCacheRef = useRef<Map<string, SatelliteMetadata>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  propagatorRef.current = propagator;

  const selectedId = useSelectionStore((s) => s.selectedNoradId);

  // Mount the scene manager once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const manager = new OrionSceneManager(container);
    managerRef.current = manager;

    // Observer marker follows the ground-station store
    manager.setObserver(useObserverStore.getState().location);
    const unsubObserver = useObserverStore.subscribe((s) => manager.setObserver(s.location));

    // ── Pointer interaction ──────────────────────────────────────────────
    const canvas = manager.renderer.domElement;
    let pickTimer: ReturnType<typeof setTimeout> | null = null;
    let downX = 0;
    let downY = 0;

    const onPointerMove = (ev: PointerEvent) => {
      if (pickTimer) clearTimeout(pickTimer);
      pickTimer = setTimeout(() => {
        const rect = canvas.getBoundingClientRect();
        const id = pickSatellite(
          ev.clientX - rect.left,
          ev.clientY - rect.top,
          manager.camera,
          rect.width,
          rect.height,
        );
        useSelectionStore.getState().hover(id);

        if (!id) {
          setTooltip(null);
          return;
        }

        let altKm = 0;
        let velKms = 0;
        const buf = posBufferRef.current;
        if (buf) {
          const eci = getEciAtIndex(buf, getSlotIndex(id));
          if (eci) {
            const r = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);
            altKm = r - R_EARTH_KM;
            velKms = Math.sqrt(MU_KM3_S2 / r); // circular approximation
          }
        }

        const cached = metaCacheRef.current.get(id);
        setTooltip({
          x: ev.clientX,
          y: ev.clientY,
          noradId: id,
          name: cached?.name ?? id,
          altKm,
          velKms,
        });

        const prop = propagatorRef.current;
        if (!cached && prop) {
          void prop.getMetadata(id).then((meta) => {
            if (!meta) return;
            metaCacheRef.current.set(id, meta);
            setTooltip((prev) =>
              prev && prev.noradId === id ? { ...prev, name: meta.name } : prev,
            );
          });
        }
      }, 50);
    };

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const onPointerUp = (ev: PointerEvent) => {
      // Ignore drags (orbit-control gestures)
      if (Math.abs(ev.clientX - downX) > 4 || Math.abs(ev.clientY - downY) > 4) return;
      const rect = canvas.getBoundingClientRect();
      const id = pickSatellite(
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        manager.camera,
        rect.width,
        rect.height,
      );
      useSelectionStore.getState().select(id);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);

    return () => {
      if (pickTimer) clearTimeout(pickTimer);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      unsubObserver();
      manager.dispose();
      managerRef.current = null;
    };
  }, []);

  // ── Render + propagation loops ─────────────────────────────────────────
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !propagator) return;

    const prop = propagator;
    const mgr: OrionSceneManager = manager;
    const setFps = useUIStore.getState().setFps;

    let cancelled = false;
    let rafId = 0;
    let simJd = useUIStore.getState().simTimeJd;
    let lastFrame = performance.now();
    let lastFpsUpdate = performance.now();
    let lastStatsUpdate = 0;
    let frameCount = 0;
    let propagationInFlight = false;
    const t0 = performance.now();

    function requestPropagation(jd: number) {
      if (propagationInFlight) return;
      propagationInFlight = true;
      prop
        .propagateAt(jd)
        .then((buf) => {
          if (cancelled) return;
          const positions = new Float64Array(buf);
          posBufferRef.current = positions;
          updatePointPositions(positions);

          // Selection marker + live stats ride along with fresh positions
          const sel = useSelectionStore.getState().selectedNoradId;
          if (sel) {
            const eci = getEciAtIndex(positions, getSlotIndex(sel));
            mgr.orbitTrack.setMarker(eci);

            const now = performance.now();
            if (eci && now - lastStatsUpdate > 500) {
              lastStatsUpdate = now;
              const r = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);
              const observer = useObserverStore.getState().location;
              const look = observer ? lookAnglesFromEci(eci, observer, simJd) : null;
              useSelectionStore.getState().setLiveStats({
                altKm: r - R_EARTH_KM,
                velKms: Math.sqrt(MU_KM3_S2 / r),
                azDeg: look?.azDeg ?? null,
                elDeg: look?.elDeg ?? null,
                rangeKm: look?.rangeKm ?? null,
              });
            }
          } else {
            mgr.orbitTrack.setMarker(null);
          }
        })
        .catch(() => {
          /* worker not ready — retry next frame */
        })
        .finally(() => {
          propagationInFlight = false;
        });
    }

    function frame() {
      if (cancelled) return;
      const now = performance.now();
      const dtSec = (now - lastFrame) / 1000;
      lastFrame = now;

      const ui = useUIStore.getState();
      if (!ui.simPaused) {
        simJd += (dtSec * ui.simSpeed) / 86_400;
        ui.setSimTimeJd(simJd);
      } else {
        simJd = ui.simTimeJd;
      }

      requestPropagation(simJd);
      mgr.update(simJd, dtSec, (now - t0) / 1000);

      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = now;
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [propagator]);

  // ── Orbit track: one full revolution of the selected satellite ─────────
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;

    if (!selectedId || !propagator) {
      manager.orbitTrack.setTrack(null);
      manager.orbitTrack.setMarker(null);
      return;
    }

    let cancelled = false;
    const prop = propagator;

    void prop.getMetadata(selectedId).then((meta) => {
      if (cancelled) return;
      // Period from mean motion; fall back to 90 min if metadata is missing
      const periodMin = meta ? 1440 / meta.meanMotionRevPerDay : 90;
      const jdStart = useUIStore.getState().simTimeJd;
      const jdEnd = jdStart + (periodMin * 1.02) / 1440;
      const stepSec = (periodMin * 60) / 240;

      void prop.propagateRange(selectedId, jdStart, jdEnd, stepSec).then((buf) => {
        if (cancelled) return;
        manager.orbitTrack.setTrack(new Float64Array(buf));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, propagator]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" data-testid="orion-canvas" />
      {tooltip && (
        <div
          style={{ left: tooltip.x + 14, top: tooltip.y - 34 }}
          className="glass-panel pointer-events-none absolute z-50 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <div className="font-mono text-[10px] text-aurora-teal">{tooltip.noradId}</div>
          <div className="font-medium text-slate-100">{tooltip.name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
            {tooltip.altKm.toFixed(0)} km · ~{tooltip.velKms.toFixed(2)} km/s
          </div>
        </div>
      )}
    </>
  );
}
