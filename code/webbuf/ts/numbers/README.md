# @webbuf/numbers

Fixed-size unsigned integers with big-endian and little-endian support.

## WebBuf 4

Numeric wire bytes remain unchanged. Access native bytes through
`number.buf.buf.bytes`: FixedNum owns a FixedBuf, which owns a WebBuf.
Same-endian buffer factories retain their input selection; opposite-endian
factories reverse a copy. Buffer output conversions return independent copies.
Existing BE/LE support is preserved. For sequential fields, use the matching
`@webbuf/rw` BE/LE reader and writer methods for 16/32/64/128/256 bits.

Hex is numeric display, not necessarily storage order:
`U32LE.fromN(0x12345678).toHex()` is `12345678`, while
`U32LE.fromN(0x12345678).toLEBuf().toHex()` is `78563412`.
For exact integers beyond JavaScript's safe-integer range, use `fromBn()` and
`.bn`, not `fromN()` or `.n`.

## ZigZag transforms

`zigZagEncode(value: bigint): bigint` maps signed integers to unsigned integers:
0, -1, 1, -2, 2 map to 0, 1, 2, 3, 4. `zigZagDecode(value: bigint): bigint`
performs the inverse. Both preserve arbitrary precision, including beyond 256
bits; neither writes bytes or silently narrows values. Non-bigint arguments
throw TypeError; negative decode input throws RangeError.

For protobuf `sint32`/`sint64`, validate the signed field range, transform, then
write the unsigned result with `BufWriter.writeULEB128` and its 32/64-bit limit.
Read ULEB128 first and then decode ZigZag. This is not SLEB128; for example -1
becomes `01` with ZigZag+ULEB128, versus `7f` with SLEB128. The pure transforms
are also available from the `webbuf` umbrella package.

## Variable-width signed integers

`encodeSignedBE(value: bigint, byteLength?: number): WebBuf` and
`encodeSignedLE(value: bigint, byteLength?: number): WebBuf` encode two's
complement with explicit byte order. Omitted/undefined width chooses minimal
nonempty bytes: zero is 00, BE 128 is 0080, and BE -128 is 80.
Explicit width sign-extends to exactly that many bytes; for n > 0 the range is
-2^(8n-1) through 2^(8n-1)-1. Zero width accepts only zero and returns empty.
Overflow is rejected, never truncated.

`decodeSignedBE(bytes: WebBuf): bigint` and
`decodeSignedLE(bytes: WebBuf): bigint` accept redundant sign extension and
return 0n for empty bytes. Decoders read only the selected range, without
mutation. Encoders return independent storage, including empty results.
Values are exact bigint, not Number. These functions are also exported by
`webbuf`; they are not LEB128, ZigZag or a ScriptNum compatibility mode.

Wrong argument kinds throw TypeError; negative, fractional, nonfinite or
unsafe-integer widths and overflow throw RangeError. Detached/out-of-bounds
decode storage throws TypeError, including before empty handling. Large
valid widths remain subject to native allocation limits. There is no
constant-time or secure-erasure guarantee.

## Installation

```bash
npm install @webbuf/numbers
```

## Usage

```typescript
import {
  decodeSignedBE,
  decodeSignedLE,
  encodeSignedBE,
  encodeSignedLE,
  U8,
  U16BE,
  U16LE,
  U32BE,
  U32LE,
  U64BE,
  U64LE,
  U128BE,
  U128LE,
  U256BE,
  U256LE,
  zigZagEncode,
  zigZagDecode,
} from "@webbuf/numbers";

const signedBE = encodeSignedBE(-129n);
const signedLE = encodeSignedLE(-129n);
if (signedBE.toHex() !== "ff7f" || signedLE.toHex() !== "7fff")
  throw new Error("Wrong signed byte order");
if (decodeSignedBE(signedBE) !== -129n || decodeSignedLE(signedLE) !== -129n)
  throw new Error("Wrong signed value");
if (encodeSignedBE(-128n, 2).toHex() !== "ff80")
  throw new Error("Expected explicit sign extension");
if (encodeSignedLE(0n, 0).length !== 0 || encodeSignedBE(0n).toHex() !== "00")
  throw new Error("Wrong zero encoding");

if (zigZagEncode(-2n) !== 3n) throw new Error("Wrong ZigZag encoding");
if (zigZagDecode(3n) !== -2n) throw new Error("Wrong ZigZag decoding");

// Create from number or bigint
const a = U32BE.fromN(1000);
const b = U64BE.fromBn(0x123456789abcdef0n);

// Arithmetic
const sum = a.add(U32BE.fromN(500));
const diff = a.sub(U32BE.fromN(100));
const product = a.mul(U32BE.fromN(2));
const quotient = a.div(U32BE.fromN(10));

// Convert to number/bigint
a.n; // 1000 (number)
a.bn; // 1000n (bigint)

// Buffer conversions
const beBuf = a.toBEBuf(); // Big-endian FixedBuf
const leBuf = a.toLEBuf(); // Little-endian FixedBuf
const restored = U32BE.fromBEBuf(beBuf);

// Hex conversions
const hex = a.toHex(); // "000003e8"
const fromHex = U32BE.fromHex("000003e8");
```

## Types

| Type               | Size     | Range              |
| ------------------ | -------- | ------------------ |
| `U8`               | 1 byte   | 0 to 255           |
| `U16BE`, `U16LE`   | 2 bytes  | 0 to 65,535        |
| `U32BE`, `U32LE`   | 4 bytes  | 0 to 4,294,967,295 |
| `U64BE`, `U64LE`   | 8 bytes  | 0 to 2^64-1        |
| `U128BE`, `U128LE` | 16 bytes | 0 to 2^128-1       |
| `U256BE`, `U256LE` | 32 bytes | 0 to 2^256-1       |

`BE` = Big Endian, `LE` = Little Endian

## API

### Static Methods

| Method           | Description                      |
| ---------------- | -------------------------------- |
| `fromN(n)`       | Create from number               |
| `fromBn(bn)`     | Create from bigint               |
| `fromBEBuf(buf)` | Create from big-endian buffer    |
| `fromLEBuf(buf)` | Create from little-endian buffer |
| `fromHex(hex)`   | Create from hex string           |

### Instance Properties/Methods

| Property/Method | Description                     |
| --------------- | ------------------------------- |
| `n`             | Get value as number             |
| `bn`            | Get value as bigint             |
| `add(other)`    | Add                             |
| `sub(other)`    | Subtract                        |
| `mul(other)`    | Multiply                        |
| `div(other)`    | Divide                          |
| `toBEBuf()`     | Convert to big-endian buffer    |
| `toLEBuf()`     | Convert to little-endian buffer |
| `toHex()`       | Convert to hex string           |

## License

MIT

## Signed-magnitude integers

`encodeSignedMagnitudeLE/BE(value: bigint, byteLength?: number)` returns a
WebBuf. The highest byte carries the sign bit and the remaining bits carry the
absolute value. Default width is minimal and nonempty (zero is `00`). Explicit
width zero accepts only zero; larger widths zero-pad magnitude and preserve the
sign at the most significant end. Overflow and invalid widths throw, never truncate.

`decodeSignedMagnitudeLE/BE(bytes: WebBuf)` returns bigint without mutation.
Empty bytes, positive zero and negative zero decode to `0n`; padded encodings
are accepted. Selected subviews are respected; invalid/detached/out-of-bounds
storage throws. Encoders return independent storage. Native allocation limits
apply; no constant-time or secure-erasure guarantee is made.

For example, `encodeSignedMagnitudeLE(-1n, 2)` is `0180`; the BE version is
`8001`. This differs from existing `encodeSignedLE/BE`, which remain two's
complement (`ffff` for -1 at width 2). BCH's empty-zero/minimality rules belong
to bchlib, not these generic codecs. All four functions are re-exported by `webbuf`.
