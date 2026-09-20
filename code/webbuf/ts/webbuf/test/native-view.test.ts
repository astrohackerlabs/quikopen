import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { WebBuf } from "../src/webbuf.js";

const constructors = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
];

describe("fromArrayBufferView", () => {
  for (const Type of constructors) {
    it(`copies raw selected bytes of ${Type.name}, not its elements`, () => {
      const bytes = new Uint8Array(24).fill(0xee);
      bytes.set([1, 2, 3, 4, 5, 6, 7, 8], 8);
      const view = new Type(bytes.buffer, 8, 8 / Type.BYTES_PER_ELEMENT);
      const copied = WebBuf.fromArrayBufferView(view);
      expect(copied.toHex()).toBe("0102030405060708");
      expect(copied.buffer).not.toBe(bytes.buffer);
      bytes[8] = 9;
      expect(copied.bytes[0]).toBe(1);
      copied.bytes[1] = 10;
      expect(bytes[9]).toBe(2);
      copied.wipe();
      expect([...bytes.subarray(8, 16)]).toEqual([9, 2, 3, 4, 5, 6, 7, 8]);
      expect(bytes[7]).toBe(0xee);
      expect(bytes[16]).toBe(0xee);
    });
  }

  it("copies Float16Array raw bytes when the runtime provides it", () => {
    const Type = Reflect.get(globalThis, "Float16Array") as
      | (new (
          buffer: ArrayBuffer,
          offset: number,
          length: number,
        ) => ArrayBufferView)
      | undefined;
    if (!Type) return; // Optional runtime family; all mandatory families run above.
    const bytes = new Uint8Array([0xee, 0xee, 1, 2, 3, 4, 0xee, 0xee]);
    const copied = WebBuf.fromArrayBufferView(new Type(bytes.buffer, 2, 2));
    bytes.fill(0);
    expect(copied.toHex()).toBe("01020304");
  });

  it("copies unaligned DataView and selected Node Buffer", () => {
    for (const view of [
      new DataView(new Uint8Array([0xee, 1, 2, 3, 0xff]).buffer, 1, 3),
      Buffer.from([0xee, 1, 2, 3, 0xff]).subarray(1, 4),
    ]) {
      const copied = WebBuf.fromArrayBufferView(view);
      expect(copied.toHex()).toBe("010203");
      expect(copied.buffer).not.toBe(view.buffer);
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength).fill(0);
      expect(copied.toHex()).toBe("010203");
    }
  });

  it("copies empty views without retaining backing storage", () => {
    const buffer = new ArrayBuffer(8);
    for (const view of [
      new DataView(buffer, 8, 0),
      new Uint32Array(buffer, 8, 0),
    ]) {
      const copied = WebBuf.fromArrayBufferView(view);
      expect(copied.length).toBe(0);
      expect(copied.buffer).not.toBe(buffer);
    }
  });

  it("copies shared-memory DataView and typed arrays into ordinary storage", () => {
    for (const make of [
      (buffer: SharedArrayBuffer): DataView<SharedArrayBuffer> =>
        new DataView(buffer, 2, 4),
      (buffer: SharedArrayBuffer): Uint16Array<SharedArrayBuffer> =>
        new Uint16Array(buffer, 2, 2),
    ]) {
      const buffer = new SharedArrayBuffer(8);
      const bytes = new Uint8Array(buffer);
      bytes.set([0xee, 0xee, 1, 2, 3, 4, 0xff, 0xff]);
      const copied = WebBuf.fromArrayBufferView(make(buffer));
      expect(copied.buffer).toBeInstanceOf(ArrayBuffer);
      bytes[2] = 9;
      expect(copied.toHex()).toBe("01020304");
      copied.wipe();
      expect([...bytes]).toEqual([0xee, 0xee, 9, 2, 3, 4, 0xff, 0xff]);
    }
  });

  it("accepts cross-realm native views without instanceof", () => {
    const views = runInNewContext(`
      const bytes = new Uint8Array([99, 1, 2, 88]);
      [new DataView(bytes.buffer, 1, 2), bytes.subarray(1, 3)]
    `) as ArrayBufferView[];
    for (const view of views) {
      expect(view instanceof DataView || view instanceof Uint8Array).toBe(
        false,
      );
      expect(WebBuf.fromArrayBufferView(view).toHex()).toBe("0102");
    }
  });

  it("rejects detached native views rather than inventing empty data", () => {
    const buffer = new ArrayBuffer(4);
    const views = [new DataView(buffer), new Uint8Array(buffer)];
    structuredClone(buffer, { transfer: [buffer] });
    for (const view of views)
      expect(() => WebBuf.fromArrayBufferView(view)).toThrow(TypeError);
  });

  it("rejects non-views and objects mimicking view fields", () => {
    for (const invalid of [
      WebBuf.alloc(0),
      new ArrayBuffer(0),
      new SharedArrayBuffer(0),
      "",
      [],
      null,
      undefined,
      { buffer: new ArrayBuffer(4), byteOffset: 0, byteLength: 4 },
    ]) {
      expect(() =>
        WebBuf.fromArrayBufferView(invalid as ArrayBufferView),
      ).toThrow(TypeError);
    }
  });
});
