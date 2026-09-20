/**
 * Detect Esc (0x1b) and Ctrl+C (0x03) on a readable stream (stdin / PTY).
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

/** Classify first matching control byte in buffer (Esc preferred if both). */
export function classifyControlByte(buf: WebBuf): StdinControlByte {
  let sawCtrlC = false;
  for (let i = 0; i < buf.length; i++) {
    const b = buf.bytes[i];
    if (b === ESC_BYTE) return "esc";
    if (b === CTRL_C_BYTE) sawCtrlC = true;
  }
  return sawCtrlC ? "ctrl-c" : null;
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
 * Watch `input` for Esc and (optionally) raw Ctrl+C.
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
  if (typeof handlers === "function") {
    onEsc = handlers;
  } else {
    onEsc = handlers.onEsc;
    onCtrlC = handlers.onCtrlC;
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

  // Node types chunk as Buffer | string — convert to WebBuf on the next line.
  const onData = (chunk: Buffer | string): void => {
    if (stopped || fired) return;
    const buf = chunkToWebBuf(chunk);
    const kind = classifyControlByte(buf);
    if (kind === "esc") {
      fired = true;
      onEsc();
      return;
    }
    if (kind === "ctrl-c") {
      fired = true;
      if (onCtrlC) onCtrlC();
      else onEsc(); // last resort: still exit rather than ignore interrupt
      return;
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
