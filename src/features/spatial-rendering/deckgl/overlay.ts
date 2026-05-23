/** deck.gl overlay integration — Phase 3 implementation.
 *  Phase 1 stub: exports the interface, wiring done in Phase 3. */

export interface DeckOverlayHandle {
  destroy(): void;
  updateOrbitTrack(positions: Float64Array | null): void;
}

export function createDeckOverlay(_cesiumCanvas: HTMLCanvasElement): DeckOverlayHandle {
  // Phase 3 stub
  return {
    destroy() {},
    updateOrbitTrack(_positions) {},
  };
}
