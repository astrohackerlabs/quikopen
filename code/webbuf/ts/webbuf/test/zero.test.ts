import { describe, expect, it } from "vitest";
import { WebBuf } from "../src/webbuf.js";

const wrap = (buf: WebBuf): WebBuf => buf;

describe("isZero", () => {
  it("matches an independent byte oracle without mutation", () => {
    const cases = [[], [0], [1], [128], [255], Array(65).fill(0) as number[]];
    for (const position of [0, 32, 64]) {
      const bytes = Array(65).fill(0) as number[];
      bytes[position] = 128;
      cases.push(bytes);
    }
    for (let seed = 0; seed < 32; seed++) {
      cases.push(Array.from({ length: seed }, (_, i) => (seed * i) % 256));
    }
    for (const bytes of cases) {
      const buf = WebBuf.fromArray(bytes);
      const subject = wrap(buf);
      expect(subject.isZero()).toBe(bytes.every((byte) => byte === 0));
      expect([...buf]).toEqual(bytes);
    }
  });

  it("uses only the selected range and reads current aliased bytes", () => {
    const backing = WebBuf.fromArray([255, 0, 0, 255]);
    const selected = wrap(backing.subarray(1, 3));
    expect(selected.isZero()).toBe(true);
    expect(wrap(backing.subarray(0, 0)).isZero()).toBe(true);
    backing.bytes[1] = 1;
    expect(selected.isZero()).toBe(false);
    backing.bytes[1] = 0;
    expect(selected.isZero()).toBe(true);
    expect([...backing]).toEqual([255, 0, 0, 255]);
    const inverse = WebBuf.fromArray([0, 0, 128, 0]);
    expect(wrap(inverse.subarray(1, 3)).isZero()).toBe(false);
    expect([...inverse]).toEqual([0, 0, 128, 0]);
  });

  it("rejects detached storage, even originally empty storage", () => {
    for (const length of [0, 4]) {
      const storage = new ArrayBuffer(length);
      const subject = wrap(new WebBuf(storage));
      structuredClone(storage, { transfer: [storage] });
      expect(() => subject.isZero()).toThrow(TypeError);
    }
  });

  it("rejects out-of-bounds resizable storage and recovers after regrowth", () => {
    const storage = Reflect.construct(ArrayBuffer, [
      8,
      { maxByteLength: 16 },
    ]) as ArrayBuffer & { resizable: boolean; resize(length: number): void };
    expect(storage.resizable).toBe(true);
    const subject = wrap(new WebBuf(storage, 4, 4));
    expect(subject.isZero()).toBe(true);
    storage.resize(2);
    expect(() => subject.isZero()).toThrow(TypeError);
    storage.resize(8);
    expect(subject.isZero()).toBe(true);
  });
});
