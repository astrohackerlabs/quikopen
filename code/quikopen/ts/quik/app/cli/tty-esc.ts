/**
 * Detect Esc (0x1b), Ctrl+C (0x03) and Left/Right arrows on stdin / PTY.
 *
 * Ghostty does not forward Esc into the TermSurf webview; it encodes Esc to
 * the surface PTY where the quik client is the foreground process.
 *
 * setRawMode(true) disables ISIG, so terminal Ctrl+C is delivered as byte 0x03
 * instead of raising SIGINT — we must map 0x03 to the interrupt exit path.
 *
 * Product buffer type is WebBuf; Node stream chunks convert at the edge.
 */
import type { Readable } from "node:stream";
import { WebBuf } from "@webbuf/webbuf";

export const ESC_BYTE = 0x1b;
/** ETX — Ctrl+C when ISIG is off (raw mode). */
export const CTRL_C_BYTE = 0x03;

export type StdinControlByte = "esc" | "ctrl-c" | null;

/** Left (−1) or Right (+1) arrow from a CSI/SS3 key sequence. */
export type ArrowStep = -1 | 1;

export type StdinEvent = "esc" | "ctrl-c" | ArrowStep;

export interface StdinScan {
  events: StdinEvent[];
  /** A bare Esc ended the chunk; it may begin a split key sequence. */
  pendingEsc: boolean;
}

/** Hold for a lone trailing Esc before treating it as exit. */
export const ESC_HOLD_MS = 30;

const CSI_INTRO = 0x5b; // '['
const SS3_INTRO = 0x4f; // 'O'

/**
 * Scan stdin bytes. A bare Esc exits; an Esc that starts a CSI (`ESC [`) or
 * SS3 (`ESC O`) key sequence is a key, so arrow keys never close the viewer.
 * Pass `pendingEsc` from the previous chunk to join a split sequence.
 */
export function scanStdin(buf: WebBuf, pendingEsc = false): StdinScan {
  const bytes = pendingEsc ? [ESC_BYTE, ...buf.bytes] : Array.from(buf.bytes);
  const events: StdinEvent[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === CTRL_C_BYTE) {
      events.push("ctrl-c");
      i++;
      continue;
    }
    if (b !== ESC_BYTE) {
      i++;
      continue;
    }
    if (i === bytes.length - 1) return { events, pendingEsc: true };
    const intro = bytes[i + 1];
    if (intro !== CSI_INTRO && intro !== SS3_INTRO) {
      events.push("esc");
      i++;
      continue;
    }
    // Parameter (0x30–0x3f) and intermediate (0x20–0x2f) bytes, then final.
    let j = i + 2;
    while (j < bytes.length) {
      const p = bytes[j] ?? 0;
      if (p < 0x20 || p > 0x3f) break;
      j++;
    }
    const final = bytes[j];
    if (final === 0x43) events.push(1); // 'C' Right
    if (final === 0x44) events.push(-1); // 'D' Left
    i = j + 1;
  }
  return { events, pendingEsc: false };
}
/**
 * Classify a complete chunk (Esc preferred if both). A trailing bare Esc
 * counts as Esc; key sequences such as arrows do not.
 */
export function classifyControlByte(buf: WebBuf): StdinControlByte {
  const scan = scanStdin(buf);
  if (scan.pendingEsc || scan.events.includes("esc")) return "esc";
  return scan.events.includes("ctrl-c") ? "ctrl-c" : null;
}

/** True if buffer contains a bare ESC byte. */
export function bufferContainsEsc(buf: WebBuf): boolean {
  return classifyControlByte(buf) === "esc";
}

/**
 * Convert Node stream chunk (uncontrolled API) to WebBuf immediately.
 * Prefer one-shot webbuf helpers — do not rebuild bytes with DataView loops.
 */
export function chunkToWebBuf(
  chunk: string | ArrayBufferView | ArrayBuffer,
): WebBuf {
  if (typeof chunk === "string") {
    return WebBuf.fromUtf8(chunk);
  }
  if (chunk instanceof ArrayBuffer) {
    return WebBuf.fromUint8Array(new Uint8Array(chunk));
  }
  // Node Buffer and TypedArray are ArrayBufferViews; Buffer is a Uint8Array.
  if (ArrayBuffer.isView(chunk)) {
    return WebBuf.fromArrayBufferView(chunk);
  }
  // Unreachable for documented Node data events; keep types honest.
  return WebBuf.fromUint8Array(new Uint8Array(0));
}

export interface EscWatchHandle {
  /** Remove listeners and restore TTY raw mode if we changed it. */
  stop: () => void;
}

export interface WatchEscHandlers {
  onEsc: () => void;
  /** Required when enableRawMode may turn off ISIG (maps 0x03 → interrupt). */
  onCtrlC?: () => void;
  /** Left (−1) or Right (+1) arrow key sequences; these never exit. */
  onArrow?: (step: ArrowStep) => void;
}

export interface WatchEscOptions {
  /**
   * When true and `input` is a TTY with setRawMode, enable raw mode so Esc is
   * delivered without Enter. Disables ISIG — pair with onCtrlC for 0x03.
   */
  enableRawMode?: boolean;
}

type MaybeTty = Readable & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
};

/**
 * Watch `input` for Esc, (optionally) raw Ctrl+C, and arrow keys.
 * Invokes at most one of the handlers once (caller debounces multi-source exit).
 */
export function watchEscInput(
  input: Readable,
  handlers: WatchEscHandlers | (() => void),
  opts: WatchEscOptions = {},
): EscWatchHandle {
  // Back-compat: single callback = onEsc only
  let onEsc: () => void;
  let onCtrlC: (() => void) | undefined;
  let onArrow: ((step: ArrowStep) => void) | undefined;
  if (typeof handlers === "function") {
    onEsc = handlers;
  } else {
    onEsc = handlers.onEsc;
    onCtrlC = handlers.onCtrlC;
    onArrow = handlers.onArrow;
  }

  let stopped = false;
  let fired = false;
  const tty: MaybeTty = input;
  let restoredRaw = false;
  let wasRaw = false;

  if (opts.enableRawMode && tty.isTTY && typeof tty.setRawMode === "function") {
    try {
      wasRaw = !!tty.isRaw;
      if (!wasRaw) {
        tty.setRawMode(true);
        restoredRaw = true;
      }
    } catch {
      /* non-fatal: still try to read if possible */
    }
  }

  try {
    tty.resume();
  } catch {
    /* */
  }

  let pendingEsc = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const fire = (event: "esc" | "ctrl-c"): void => {
    if (stopped || fired) return;
    fired = true;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (event === "esc") onEsc();
    else if (onCtrlC) onCtrlC();
    else onEsc(); // last resort: still exit rather than ignore interrupt
  };

  // Node types chunk as Buffer | string — convert to WebBuf on the next line.
  const onData = (chunk: Buffer | string): void => {
    if (stopped || fired) return;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    const scan = scanStdin(chunkToWebBuf(chunk), pendingEsc);
    pendingEsc = scan.pendingEsc;
    for (const event of scan.events) {
      if (event === "esc" || event === "ctrl-c") {
        fire(event);
        return;
      }
      onArrow?.(event);
    }
    if (pendingEsc) {
      // A lone trailing Esc may be the first byte of a split arrow sequence.
      holdTimer = setTimeout(() => {
        holdTimer = null;
        fire("esc");
      }, ESC_HOLD_MS);
    }
  };

  const onEnd = (): void => {
    /* ignore — control UDS owns lifecycle */
  };

  input.on("data", onData);
  input.on("end", onEnd);
  input.on("error", onEnd);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      try {
        input.off("data", onData);
        input.off("end", onEnd);
        input.off("error", onEnd);
      } catch {
        /* */
      }
      if (restoredRaw && typeof tty.setRawMode === "function") {
        try {
          tty.setRawMode(wasRaw);
        } catch {
          /* */
        }
      }
    },
  };
}
