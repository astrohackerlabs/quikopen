import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { WebBuf } from "../src/index.js";

type Unsigned = Uint16Array | Uint32Array | BigUint64Array;
interface ArrayCase {
  name: string;
  width: number;
  values: bigint[];
  be: string;
  le: string;
  make: (values: bigint[]) => Unsigned;
  encode: (values: unknown, littleEndian: boolean) => WebBuf;
  decode: (values: WebBuf, littleEndian: boolean) => Unsigned;
}
const cases: ArrayCase[] = [
  {
    name: "Uint16",
    width: 2,
    values: [0x1234n, 0xabcdn],
    be: "1234abcd",
    le: "3412cdab",
    make: (v: bigint[]) => new Uint16Array(v.map(Number)),
    encode: (v: unknown, le: boolean) =>
      le
        ? WebBuf.fromUint16ArrayLE(v as Uint16Array)
        : WebBuf.fromUint16ArrayBE(v as Uint16Array),
    decode: (v: WebBuf, le: boolean) =>
      le ? v.toUint16ArrayLE() : v.toUint16ArrayBE(),
  },
  {
    name: "Uint32",
    width: 4,
    values: [0x01234567n, 0x89abcdefn],
    be: "0123456789abcdef",
    le: "67452301efcdab89",
    make: (v: bigint[]) => new Uint32Array(v.map(Number)),
    encode: (v: unknown, le: boolean) =>
      le
        ? WebBuf.fromUint32ArrayLE(v as Uint32Array)
        : WebBuf.fromUint32ArrayBE(v as Uint32Array),
    decode: (v: WebBuf, le: boolean) =>
      le ? v.toUint32ArrayLE() : v.toUint32ArrayBE(),
  },
  {
    name: "BigUint64",
    width: 8,
    values: [0x0123456789abcdefn],
    be: "0123456789abcdef",
    le: "efcdab8967452301",
    make: (v: bigint[]) => new BigUint64Array(v),
    encode: (v: unknown, le: boolean) =>
      le
        ? WebBuf.fromBigUint64ArrayLE(v as BigUint64Array)
        : WebBuf.fromBigUint64ArrayBE(v as BigUint64Array),
    decode: (v: WebBuf, le: boolean) =>
      le ? v.toBigUint64ArrayLE() : v.toBigUint64ArrayBE(),
  },
];
const asBigints = (values: Unsigned): bigint[] =>
  Array.from(values as Iterable<number | bigint>, BigInt);

for (const spec of cases)
  for (const little of [false, true]) {
    describe(`${spec.name} ${little ? "LE" : "BE"}`, () => {
      it("encodes and decodes independent literals and empty arrays", () => {
        const hex = little ? spec.le : spec.be;
        expect(spec.encode(spec.make(spec.values), little).toHex()).toBe(hex);
        const decoded = spec.decode(WebBuf.fromHex(hex), little);
        expect(asBigints(decoded)).toEqual(spec.values);
        expect(decoded.constructor).toBe(spec.make([]).constructor);
        expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
        expect(spec.encode(spec.make([]), little).length).toBe(0);
        const a = spec.decode(WebBuf.alloc(0), little),
          b = spec.decode(WebBuf.alloc(0), little);
        expect(a.length).toBe(0);
        expect(a.buffer).not.toBe(b.buffer);
        expect(spec.encode(spec.make([]), little).buffer).not.toBe(
          spec.encode(spec.make([]), little).buffer,
        );
      });

      it("matches independent Node numeric codecs for limits and deterministic samples", () => {
        const mask = (1n << BigInt(spec.width * 8)) - 1n;
        const values = [0n, mask, 1n << BigInt(spec.width * 8 - 1), 1n];
        if (spec.width === 8)
          values.push(9007199254740993n, 0xffffffffffffffffn);
        let state = 0x5a17n;
        for (let i = 0; i < 128; i++) {
          state = (state * 6364136223846793005n + 1n) & mask;
          values.push(state);
        }
        const expected = Buffer.alloc(values.length * spec.width);
        values.forEach((value, i) => {
          if (spec.width === 8) {
            if (little) expected.writeBigUInt64LE(value, i * 8);
            else expected.writeBigUInt64BE(value, i * 8);
          } else if (little)
            expected.writeUIntLE(Number(value), i * spec.width, spec.width);
          else expected.writeUIntBE(Number(value), i * spec.width, spec.width);
        });
        expect(spec.encode(spec.make(values), little).toHex()).toBe(
          expected.toString("hex"),
        );
        const decoded = spec.decode(WebBuf.fromUint8Array(expected), little);
        const oracle = values.map((_, i) =>
          spec.width === 8
            ? little
              ? expected.readBigUInt64LE(i * 8)
              : expected.readBigUInt64BE(i * 8)
            : BigInt(
                little
                  ? expected.readUIntLE(i * spec.width, spec.width)
                  : expected.readUIntBE(i * spec.width, spec.width),
              ),
        );
        expect(asBigints(decoded)).toEqual(oracle);
      });

      it("copies selected numeric elements and unaligned selected bytes without mutation", () => {
        const source = spec.make([9n, ...spec.values, 8n]);
        const selection = source.subarray(1, source.length - 1);
        const encoded = spec.encode(selection, little);
        const expected = little ? spec.le : spec.be;
        expect(encoded.toHex()).toBe(expected);
        source[1] = spec.width === 8 ? 0n : 0;
        expect(encoded.toHex()).toBe(expected);
        encoded.wipe();
        expect(asBigints(source)[0]).toBe(9n);
        expect(asBigints(source).at(-1)).toBe(8n);
        const bytes = WebBuf.fromHex("aa" + expected + "bb");
        const decoded = spec.decode(bytes.subarray(1, -1), little);
        expect(asBigints(decoded)).toEqual(spec.values);
        expect(decoded.byteOffset).toBe(0);
        expect(decoded.byteLength).toBe(spec.values.length * spec.width);
        decoded[0] = spec.width === 8 ? 0n : 0;
        expect(bytes.toHex()).toBe("aa" + expected + "bb");
        const copy = spec.decode(bytes.subarray(1, -1), little);
        bytes.wipe();
        expect(asBigints(copy)).toEqual(spec.values);
      });

      it("validates width, genuine array identity and incomplete input", () => {
        const wrong: unknown[] = [
          null,
          undefined,
          5,
          [],
          {},
          { length: 0 },
          new ArrayBuffer(0),
          new DataView(new ArrayBuffer(0)),
          new Uint8Array(),
          new Uint8ClampedArray(),
          new Int16Array(),
          new Int32Array(),
          new BigInt64Array(),
          new Float32Array(),
          new Float64Array(),
          WebBuf.alloc(0),
          { [Symbol.toStringTag]: spec.name + "Array" },
          new Proxy(spec.make([]), {}),
        ];
        for (const other of cases)
          if (other.name !== spec.name) wrong.push(other.make([]));
        for (const value of wrong)
          expect(() => spec.encode(value, little)).toThrow(TypeError);
        for (let remainder = 1; remainder < spec.width; remainder++)
          for (const whole of [0, 2])
            expect(() =>
              spec.decode(WebBuf.alloc(whole * spec.width + remainder), little),
            ).toThrow(RangeError);
      });

      it("supports genuine foreign/subclass arrays and rejects detached inputs", () => {
        const foreign = runInNewContext(
          `new ${spec.name}Array([${spec.values.map((v) => String(v) + (spec.width === 8 ? "n" : "")).join(",")}])`,
        ) as unknown;
        expect(spec.encode(foreign, little).toHex()).toBe(
          little ? spec.le : spec.be,
        );
        const subclass = runInNewContext(
          `new (class extends ${spec.name}Array { get length() { throw Error("do not use overridden length"); } get [Symbol.toStringTag]() { return "Fake"; } })([${spec.width === 8 ? "1n" : "1"}])`,
        ) as unknown;
        expect(spec.encode(subclass, little).length).toBe(spec.width);
        const input = spec.make([1n]);
        structuredClone(input.buffer, { transfer: [input.buffer] });
        expect(() => spec.encode(input, little)).toThrow(TypeError);
        const bytes = WebBuf.alloc(spec.width);
        structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
        expect(() => spec.decode(bytes, little)).toThrow(TypeError);
      });

      it("copies shared memory without promising atomic snapshots", () => {
        const input = spec.make([1n, 2n]);
        const sharedBuffer = new SharedArrayBuffer(input.byteLength);
        new Uint8Array(sharedBuffer).set(new Uint8Array(input.buffer));
        const shared =
          spec.width === 8
            ? new BigUint64Array(sharedBuffer)
            : spec.width === 4
              ? new Uint32Array(sharedBuffer)
              : new Uint16Array(sharedBuffer);
        const result = spec.encode(shared, little);
        expect(result.buffer).toBeInstanceOf(ArrayBuffer);
        expect(result.toHex()).toBe(spec.encode(input, little).toHex());
        new Uint8Array(sharedBuffer).fill(0);
        expect(asBigints(spec.decode(result, little))).toEqual([1n, 2n]);
      });

      it("rejects resizable out-of-bounds inputs when supported", () => {
        const feature = runInNewContext(
          `typeof ArrayBuffer.prototype.resize === "function"`,
        ) as boolean;
        console.log("Resizable ArrayBuffer support:", feature);
        if (!feature) return;
        const input = runInNewContext(
          `const buffer = new ArrayBuffer(32, { maxByteLength: 64 }); const view = new ${spec.name}Array(buffer, 8, 1); buffer.resize(0); view`,
        ) as unknown;
        expect(() => spec.encode(input, little)).toThrow(TypeError);
        const resizable = Reflect.construct(ArrayBuffer, [
          32,
          { maxByteLength: 64 },
        ]) as ArrayBuffer & { resize(length: number): void };
        const selected = WebBuf.view(new Uint8Array(resizable, 8, spec.width));
        resizable.resize(0);
        expect(() => spec.decode(selected, little)).toThrow(TypeError);
      });

      it("handles at least 1 MiB without native-order shortcuts or spreading", () => {
        const count = 1048576 / spec.width;
        const first = spec.values[0];
        if (first === undefined) throw new Error("Missing fixture value");
        const values = spec.make(Array<bigint>(count).fill(first));
        const encoded = spec.encode(values, little);
        const word = (little ? spec.le : spec.be).slice(0, spec.width * 2);
        expect(encoded.toHex()).toBe(word.repeat(count));
        const decoded = spec.decode(WebBuf.fromHex(word.repeat(count)), little);
        expect(asBigints(decoded)).toEqual(asBigints(values));
      });
    });
  }
