import { createContext, useContext, useSyncExternalStore } from "react";
import type { MotionMode, MotionModeStore, MotionSnapshot } from "./state";

export const MotionContext = createContext<MotionModeStore | null>(null);

/** `ready` lets consumers defer animation until the saved preference is known. */
export function useMotionMode(): MotionSnapshot & {
  setMode: (mode: MotionMode) => void;
} {
  const store = useContext(MotionContext);
  if (!store) throw new Error("useMotionMode requires MotionModeProvider");
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...snapshot, setMode: store.setMode };
}
