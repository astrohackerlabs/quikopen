import { expect, test } from "vitest";
import { BufReader, BufWriter } from "../dist/index.js";
import { U64LE, U64BE } from "@webbuf/numbers";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import vectors from "./compact-size-vectors.json";

test("LE CompactSize matches independent Libauth vectors exactly", () => {
  for (const { value, hex } of vectors) {
    const n = new U64LE(BigInt(value));
    expect(BufWriter.varIntU64LEBuf(n).toHex()).toBe(hex);
    const writer = new BufWriter();
    expect(writer.writeVarIntU64LE(n)).toBe(writer);
    expect(writer.toBuf().toHex()).toBe(hex);
    const data = WebBuf.fromHex("aabb" + hex + hex + "cc").subarray(1);
    const reader = new BufReader(data);
    reader.pos = 1;
    const number = reader.readVarIntU64LE();
    expect(number.bn).toBe(BigInt(value));
    expect(reader.pos).toBe(1 + hex.length / 2);
    const raw = reader.readVarIntLEBuf();
    expect(raw.toHex()).toBe(hex);
    expect(reader.pos).toBe(1 + hex.length);
    data.fill(0);
    expect(number.bn).toBe(BigInt(value));
    expect(raw.toHex()).toBe(hex);
    n.buf.buf.fill(0);
    expect(writer.toBuf().toHex()).toBe(hex);
  }
});

test("nonminimal and truncated CompactSize leave the reader unchanged", () => {
  const invalid = [
    "fd0000",
    "fdfc00",
    "feffff0000",
    "ff0000000000000000",
    "ffffffffff00000000",
  ];
  for (const { hex } of vectors)
    for (let end = 0; end < hex.length; end += 2)
      invalid.push(hex.slice(0, end));
  for (const hex of invalid)
    for (const method of ["readVarIntLEBuf", "readVarIntU64LE"] as const) {
      const reader = new BufReader(WebBuf.fromHex("aa" + hex));
      reader.pos = 1;
      expect(() => reader[method]()).toThrow();
      expect(reader.pos).toBe(1);
    }
});

test("CompactSize validates storage, argument kinds and positions atomically", () => {
  for (const method of ["readVarIntLEBuf", "readVarIntU64LE"] as const) {
    const invalid = new BufReader({} as WebBuf);
    expect(() => invalid[method]()).toThrow(TypeError);
    expect(invalid.pos).toBe(0);
  }
  const one = BufWriter.varIntU64LEBuf(new U64LE(256));
  const two = BufWriter.varIntU64LEBuf(new U64LE(256));
  one.fill(0);
  expect(two.toHex()).toBe("fd0001");
  for (const pos of [-1, 0.5, NaN, Infinity, 2, Number.MAX_SAFE_INTEGER + 1]) {
    const reader = new BufReader(WebBuf.fromHex("00"));
    reader.pos = pos;
    expect(() => reader.readVarIntU64LE()).toThrow();
    expect(Object.is(reader.pos, pos)).toBe(true);
  }
  const forged = new U64LE(FixedBuf.alloc(1) as never);
  for (const value of [0n, 0, null, {}, new U64BE(1), forged]) {
    const writer = new BufWriter([WebBuf.fromHex("aa")]);
    expect(() => writer.writeVarIntU64LE(value as U64LE)).toThrow();
    expect(writer.toBuf().toHex()).toBe("aa");
    expect(() => BufWriter.varIntU64LEBuf(value as U64LE)).toThrow();
  }
  for (const length of [0, 8]) {
    const storage = new ArrayBuffer(length);
    const buf = new WebBuf(storage);
    const num = length === 8 ? new U64LE(FixedBuf.fromBuf(8, buf)) : null;
    structuredClone(storage, { transfer: [storage] });
    const reader = new BufReader(buf);
    expect(() => reader.readVarIntLEBuf()).toThrow();
    expect(reader.pos).toBe(0);
    expect(() => reader.readVarIntU64LE()).toThrow();
    if (num) expect(() => BufWriter.varIntU64LEBuf(num)).toThrow();
  }
  const storage = Reflect.construct(ArrayBuffer, [
    16,
    { maxByteLength: 32 },
  ]) as ArrayBuffer & { resize(n: number): void };
  const buf = new WebBuf(storage, 8, 8);
  const num = new U64LE(FixedBuf.fromBuf(8, buf));
  storage.resize(4);
  expect(() => new BufReader(buf).readVarIntU64LE()).toThrow();
  expect(() => BufWriter.varIntU64LEBuf(num)).toThrow();
});
