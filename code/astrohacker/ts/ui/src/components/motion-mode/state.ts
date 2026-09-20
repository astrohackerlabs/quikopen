export type MotionMode = "motion" | "no-motion" | "system";

export function parseMotionMode(value: unknown): MotionMode {
  return value === "motion" || value === "no-motion" ? value : "system";
}

export function resolveReducedMotion(
  mode: MotionMode,
  systemReducedMotion: boolean,
): boolean {
  return mode === "system" ? systemReducedMotion : mode === "no-motion";
}

export interface MotionModeSource {
  getMode: () => MotionMode;
  subscribe: (listener: () => void) => () => void;
}

export interface MutableMotionModeSource extends MotionModeSource {
  setMode: (mode: MotionMode) => void;
}

/** A live channel lets a lazy renderer read the latest mode without remounting. */
export function createMotionModeSource(
  initial: MotionMode = "system",
): MutableMotionModeSource {
  let mode = initial;
  const listeners = new Set<() => void>();
  return {
    getMode: (): MotionMode => mode,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setMode(next: MotionMode): void {
      if (next === mode) return;
      mode = next;
      for (const listener of listeners) listener();
    },
  };
}

export interface MotionSnapshot {
  readonly mode: MotionMode;
  readonly ready: boolean;
}

const SERVER_SNAPSHOT: MotionSnapshot = { mode: "system", ready: false };

export interface MotionModeStore {
  getSnapshot: () => MotionSnapshot;
  getServerSnapshot: () => MotionSnapshot;
  subscribe: (listener: () => void) => () => void;
  start: (target: Window) => () => void;
  setMode: (mode: MotionMode) => void;
}

/** Storage is optional; the in-memory choice remains authoritative after errors. */
export function createMotionModeStore(storageKey: string): MotionModeStore {
  let snapshot = SERVER_SNAPSHOT;
  let browser: Window | undefined;
  const listeners = new Set<() => void>();
  const publish = (mode: MotionMode): void => {
    if (snapshot.ready && snapshot.mode === mode) return;
    snapshot = { mode, ready: true };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: (): MotionSnapshot => snapshot,
    getServerSnapshot: (): MotionSnapshot => SERVER_SNAPSHOT,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(target: Window): () => void {
      browser = target;
      try {
        publish(parseMotionMode(target.localStorage.getItem(storageKey)));
      } catch {
        publish(snapshot.mode);
      }
      const onStorage = (event: StorageEvent): void => {
        try {
          if (event.storageArea !== target.localStorage) return;
          if (event.key === storageKey || event.key === null) {
            publish(parseMotionMode(event.newValue));
          }
        } catch {
          // Storage access can be revoked while the page remains open.
        }
      };
      target.addEventListener("storage", onStorage);
      return () => {
        target.removeEventListener("storage", onStorage);
        browser = undefined;
      };
    },
    setMode(mode: MotionMode): void {
      publish(mode);
      try {
        browser?.localStorage.setItem(storageKey, mode);
      } catch {
        // Keep the selected in-memory mode when persistence is unavailable.
      }
    },
  };
}
