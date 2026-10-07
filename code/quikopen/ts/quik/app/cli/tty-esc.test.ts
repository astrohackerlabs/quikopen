import * as assert from "node:assert/strict";
import { Buffer } from "node:buffer";

describe("native stream view conversion", () => {
  for (const kind of ["DataView", "Uint16Array", "Buffer", "shared"] as const) {
    it(`copies selected ${kind} bytes and isolates mutations`, () => {
      const storage =
        kind === "shared" ? new SharedArrayBuffer(8) : new ArrayBuffer(8);
      const bytes = new Uint8Array(storage);
      bytes.set([99, 99, 1, 2, 3, 4, 88, 88]);
      const view =
        kind === "DataView"
          ? new DataView(storage, 2, 4)
          : kind === "Uint16Array"
            ? new Uint16Array(storage, 2, 2)
            : kind === "Buffer"
              ? Buffer.from(bytes).subarray(2, 6)
              : new DataView(storage, 2, 4);
      const native = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      );
      const copied = chunkToWebBuf(view);
      assert.deepEqual([...copied.bytes], [1, 2, 3, 4]);
      assert.notEqual(copied.buffer, view.buffer);
      native[0] = 9;
      assert.equal(copied.bytes[0], 1);
      copied.wipe();
      assert.deepEqual([...native], [9, 2, 3, 4]);
    });
  }
  it("preserves empty views, string encoding, bare buffer copying and fallback", () => {
    const backing = new Uint8Array([99, 1, 2, 88]);
    for (const view of [
      new DataView(backing.buffer, 4, 0),
      backing.subarray(4),
    ]) {
      const copy = chunkToWebBuf(view);
      assert.equal(copy.length, 0);
      assert.notEqual(copy.buffer, backing.buffer);
    }
    assert.deepEqual([...chunkToWebBuf("é").bytes], [0xc3, 0xa9]);
    const copied = chunkToWebBuf(backing.buffer);
    backing.fill(0);
    assert.deepEqual([...copied.bytes], [99, 1, 2, 88]);
    assert.equal(chunkToWebBuf(null as unknown as ArrayBuffer).length, 0);
  });
});

import { PassThrough } from "node:stream";
import { describe, it } from "bun:test";
import { WebBuf } from "@webbuf/webbuf";

import type { ProcessHandles } from "./process-runtime.ts";
import { waitForExit } from "./process-runtime.ts";
import {
  bufferContainsEsc,
  chunkToWebBuf,
  classifyControlByte,
  CTRL_C_BYTE,
  ESC_BYTE,
  ESC_HOLD_MS,
  scanStdin,
  watchEscInput,
} from "./tty-esc.ts";

describe("bufferContainsEsc / classifyControlByte", () => {
  it("detects 0x1b and ignores digits", () => {
    assert.equal(bufferContainsEsc(WebBuf.fromArray([ESC_BYTE])), true);
    assert.equal(bufferContainsEsc(WebBuf.fromUtf8("1+2=")), false);
    assert.equal(
      bufferContainsEsc(WebBuf.fromArray([0x31, ESC_BYTE, 0x32])),
      true,
    );
  });

  it("classifies raw Ctrl+C (0x03) when ISIG is off", () => {
    assert.equal(
      classifyControlByte(WebBuf.fromArray([CTRL_C_BYTE])),
      "ctrl-c",
    );
    assert.equal(classifyControlByte(WebBuf.fromArray([ESC_BYTE])), "esc");
    assert.equal(classifyControlByte(WebBuf.fromUtf8("7")), null);
  });

  it("chunkToWebBuf converts edge bytes to WebBuf", () => {
    const w = chunkToWebBuf(new Uint8Array([1, 2, 3]));
    assert.ok(w instanceof WebBuf);
    assert.equal(w.length, 3);
    assert.equal(w.bytes[0], 1);
  });
});

describe("watchEscInput", () => {
  it("fires onEsc once when Esc is written", async () => {
    const stream = new PassThrough();
    let count = 0;
    const watch = watchEscInput(stream, {
      onEsc: () => {
        count++;
      },
    });
    // Stream supplies native bytes; domain conversion happens at the edge.
    stream.write(new Uint8Array([0x31])); // '1'
    assert.equal(count, 0);
    stream.write(new Uint8Array([ESC_BYTE]));
    assert.equal(count, 0); // held: may begin a split arrow sequence
    await Bun.sleep(ESC_HOLD_MS + 20);
    assert.equal(count, 1);
    stream.write(new Uint8Array([ESC_BYTE]));
    assert.equal(count, 1); // once per watcher
    watch.stop();
  });

  it("fires onCtrlC when 0x03 is written (raw-mode SIGINT substitute)", () => {
    const stream = new PassThrough();
    let esc = 0;
    let ctrl = 0;
    const watch = watchEscInput(stream, {
      onEsc: () => {
        esc++;
      },
      onCtrlC: () => {
        ctrl++;
      },
    });
    stream.write(new Uint8Array([CTRL_C_BYTE]));
    assert.equal(ctrl, 1);
    assert.equal(esc, 0);
    watch.stop();
  });
});

function mockHandles(): {
  handles: ProcessHandles;
  closed: { n: number };
  nav: { n: number };
} {
  const closed = { n: 0 };
  const nav = { n: 0 };
  const handles: ProcessHandles = {
    token: "t",
    port: 1,
    http: null as unknown as ReturnType<typeof Bun.serve>,
    termsurf: null,
    close: () => {
      closed.n++;
    },
    requestExit: () => {
      /* waitForExit wraps this */
    },
    navigate: (step) => {
      nav.n += step;
    },
  };
  return { handles, closed, nav };
}

describe("waitForExit Esc path (shipped)", () => {
  it("resolves esc and tears down when stdin gets 0x1b", async () => {
    const { handles, closed } = mockHandles();
    const stdin = new PassThrough();
    const p = waitForExit(handles, { stdin, enableTtyRaw: false });
    // non-Esc must not finish
    stdin.write(new TextEncoder().encode("7"));
    await Promise.race([
      p.then(() => {
        throw new Error("exited on digit");
      }),
      new Promise((r) => setTimeout(r, 40)),
    ]);
    stdin.write(new Uint8Array([ESC_BYTE]));
    const reason = await p;
    assert.equal(reason, "esc");
    assert.equal(closed.n, 1);
  });

  it("still exits on UI × via requestExit", async () => {
    const { handles, closed } = mockHandles();
    const stdin = new PassThrough();
    const p = waitForExit(handles, { stdin, enableTtyRaw: false });
    handles.requestExit("ui-x");
    const reason = await p;
    assert.equal(reason, "ui-x");
    assert.equal(closed.n, 1);
  });

  it("maps raw Ctrl+C byte 0x03 to sigint (ISIG off under setRawMode)", async () => {
    const { handles, closed } = mockHandles();
    const stdin = new PassThrough();
    const p = waitForExit(handles, { stdin, enableTtyRaw: false });
    stdin.write(new Uint8Array([CTRL_C_BYTE]));
    const reason = await p;
    assert.equal(reason, "sigint");
    assert.equal(closed.n, 1);
  });
});

describe("arrow keys on stdin", () => {
  const right = [ESC_BYTE, 0x5b, 0x43];
  const left = [ESC_BYTE, 0x5b, 0x44];
  const ss3Right = [ESC_BYTE, 0x4f, 0x43];

  it("scans CSI and SS3 arrows as steps, never as exit", () => {
    assert.deepEqual(scanStdin(WebBuf.fromArray(right)), {
      events: [1],
      pendingEsc: false,
    });
    assert.deepEqual(scanStdin(WebBuf.fromArray([...left, ...ss3Right])), {
      events: [-1, 1],
      pendingEsc: false,
    });
    // Modified arrow (Shift+Right: ESC [ 1 ; 2 C) and other keys.
    assert.deepEqual(
      scanStdin(WebBuf.fromArray([ESC_BYTE, 0x5b, 0x31, 0x3b, 0x32, 0x43])),
      { events: [1], pendingEsc: false },
    );
    assert.deepEqual(scanStdin(WebBuf.fromArray([ESC_BYTE, 0x5b, 0x41])), {
      events: [],
      pendingEsc: false,
    });
    assert.equal(classifyControlByte(WebBuf.fromArray(right)), null);
  });

  it("keeps bare Esc and Ctrl+C mixed with arrows", () => {
    assert.deepEqual(
      scanStdin(WebBuf.fromArray([...right, ESC_BYTE, 0x61])).events,
      [1, "esc"],
    );
    assert.deepEqual(
      scanStdin(WebBuf.fromArray([...left, CTRL_C_BYTE])).events,
      [-1, "ctrl-c"],
    );
    assert.deepEqual(scanStdin(WebBuf.fromArray([...right, ESC_BYTE])), {
      events: [1],
      pendingEsc: true,
    });
  });

  it("joins a sequence split after its Esc", () => {
    const first = scanStdin(WebBuf.fromArray([ESC_BYTE]));
    assert.equal(first.pendingEsc, true);
    assert.deepEqual(scanStdin(WebBuf.fromArray([0x5b, 0x44]), true), {
      events: [-1],
      pendingEsc: false,
    });
    assert.deepEqual(scanStdin(WebBuf.fromArray([0x61]), true).events, ["esc"]);
  });

  it("watcher reports arrows and exits only on a held bare Esc", async () => {
    const stream = new PassThrough();
    const steps: number[] = [];
    let esc = 0;
    const watch = watchEscInput(stream, {
      onEsc: () => {
        esc++;
      },
      onArrow: (step) => {
        steps.push(step);
      },
    });
    stream.write(new Uint8Array(right));
    stream.write(new Uint8Array([ESC_BYTE]));
    stream.write(new Uint8Array([0x5b, 0x44]));
    await Bun.sleep(ESC_HOLD_MS + 20);
    assert.deepEqual(steps, [1, -1]);
    assert.equal(esc, 0);
    stream.write(new Uint8Array([ESC_BYTE]));
    await Bun.sleep(ESC_HOLD_MS + 20);
    assert.equal(esc, 1);
    watch.stop();
  });

  it("waitForExit forwards arrows to navigate and keeps running", async () => {
    const { handles, closed, nav } = mockHandles();
    const stdin = new PassThrough();
    const p = waitForExit(handles, { stdin, enableTtyRaw: false });
    stdin.write(new Uint8Array([...right, ...right, ...left]));
    await Bun.sleep(ESC_HOLD_MS + 20);
    assert.equal(nav.n, 1);
    assert.equal(closed.n, 0);
    stdin.write(new Uint8Array([ESC_BYTE]));
    assert.equal(await p, "esc");
    assert.equal(closed.n, 1);
  });
});
