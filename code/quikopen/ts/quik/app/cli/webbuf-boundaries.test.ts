import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import { WebBuf } from "@webbuf/webbuf";
import {
  chunkToWebBuf,
  classifyControlByte,
  watchEscInput,
} from "./tty-esc.ts";
import {
  buildSetOverlayFrame,
  peekSetOverlayUrl,
  setOverlayDefaults,
} from "./termsurf-encode.ts";

test("native selected chunks copy exact bytes without sentinel leakage", () => {
  for (const make of [
    (bytes: Uint8Array): ArrayBufferView => bytes.subarray(1, 5),
    (bytes: Uint8Array): ArrayBufferView => Buffer.from(bytes.buffer, 1, 4),
    (bytes: Uint8Array): ArrayBufferView => new DataView(bytes.buffer, 1, 4),
  ]) {
    const native = new Uint8Array([0x99, 0, 0xff, 0x80, 0x7f, 0x88]);
    const value = chunkToWebBuf(make(native));
    expect(value.toHex()).toBe("00ff807f");
    expect(value).not.toBeInstanceOf(Uint8Array);
    native.fill(0x11);
    expect(value.toHex()).toBe("00ff807f");
    value.fill(0x22);
    expect([...native]).toEqual([17, 17, 17, 17, 17, 17]);
  }
  expect(chunkToWebBuf(new ArrayBuffer(0)).length).toBe(0);
  expect(chunkToWebBuf(new Uint8Array(0)).length).toBe(0);
  expect(chunkToWebBuf("é").toHex()).toBe("c3a9");
  expect(chunkToWebBuf(new Uint8Array([0, 255]).buffer).toHex()).toBe("00ff");
  expect(classifyControlByte(WebBuf.fromHex("1b031b").subarray(1, 2))).toBe(
    "ctrl-c",
  );
  expect(classifyControlByte(WebBuf.fromHex("031b"))).toBe("esc");
});

test("fake TTY raw mode is enabled once and restored by stop", () => {
  const stream = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode(raw: boolean): void {
      this.isRaw = raw;
      modes.push(raw);
    },
  });
  const modes: boolean[] = [];
  let exits = 0;
  const watcher = watchEscInput(
    stream,
    () => {
      exits++;
    },
    { enableRawMode: true },
  );
  stream.write(new Uint8Array([27]));
  stream.write(new Uint8Array([27]));
  expect(exits).toBe(1);
  watcher.stop();
  watcher.stop();
  expect(modes).toEqual([true, false]);
  expect(stream.isRaw).toBe(false);
  expect(stream.listenerCount("data")).toBe(0);
  stream.destroy();
});

test("independent long UTF-8 protobuf vector and selected frame decode", () => {
  const url = "é".repeat(64);
  const frame = buildSetOverlayFrame(
    setOverlayDefaults({
      paneId: "p",
      col: 1,
      row: 2,
      width: 128,
      height: 24,
      url,
    }),
  );
  // 156-byte SetOverlay body; 160-byte outer payload. All varints are LEB128.
  const hex =
    "a00000009a019c010a0170100118022080012818328001" +
    "c3a9".repeat(64) +
    "3a0764656661756c7440014a00";
  expect(frame.toHex()).toBe(hex);
  const guarded = WebBuf.fromHex(`99${hex}88`);
  expect(peekSetOverlayUrl(guarded.subarray(1, guarded.length - 1))).toBe(url);
  expect(guarded.toHex()).toBe(`99${hex}88`);
});
