import { useSyncExternalStore } from "react";

/** Reactive CSS media query — re-renders when the match state flips. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Matches Tailwind's `max-md` range — phone / small-tablet layout. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
