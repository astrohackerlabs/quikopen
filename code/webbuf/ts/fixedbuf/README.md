# @webbuf/fixedbuf

Fixed-size buffer wrapper with compile-time size enforcement.

## WebBuf 4

`fixed.buf` remains a WebBuf; native byte access is `fixed.buf.bytes`.
`fromBuf` retains the supplied WebBuf and its selected storage. `clone` copies;
`wipe` clears only the selected bytes, including shared views. `fromRandom`
fills native bytes with Web Crypto and returns a FixedBuf, not a typed array.

`FixedBuf.fromUint8Array<N>(size: N, bytes: Uint8Array): FixedBuf<N>` copies
only the selected native bytes and rejects a byte length different from `size`
with `invalid size error`. A literal size infers the corresponding fixed type;
a dynamic number produces `FixedBuf<number>`. Node Buffer and
SharedArrayBuffer-backed Uint8Array inputs are supported by copying into
independent ArrayBuffer storage. Copying shared memory is not an atomic
snapshot of concurrent writes. DataView and other typed arrays are not inputs
to this method. Use `fromBuf` when intentionally retaining a WebBuf view.

## Zero predicate

`fixed.isZero(): boolean` checks every selected byte, delegating to WebBuf.
Empty `FixedBuf<0>` returns true. It reads current bytes without copying or
mutation, so shared-view changes are visible on the next call. Detached or
out-of-bounds storage throws TypeError. It may exit early and is not constant-time.

## Base64url

`FixedBuf.fromBase64Url(size, text, stripWhitespace = false)` decodes strict
Base64url into independently owned bytes, with `FixedBuf<N>` literal size
inference. `size` must be a nonnegative safe integer and match the decoded byte
length exactly (zero is supported); otherwise it throws RangeError. Malformed
text or invalid options throw TypeError, following WebBuf's URL-safe alphabet,
canonical pad-bit, exact-padding and whitespace rules. `toBase64Url(padding =
false)` encodes selected bytes without mutation; padding is optional and output
is unpadded by default. Existing `fromBase64` behavior is unchanged.

## Installation

```bash
npm install @webbuf/fixedbuf
```

## Usage

```typescript
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

// Create fixed-size buffers
const buf32 = FixedBuf.alloc<32>(32); // 32-byte buffer
const buf16 = FixedBuf.alloc<16>(16, 0xff); // 16 bytes filled with 0xff
const random = FixedBuf.fromRandom<32>(32); // 32 random bytes

// Empty and all-zero buffers are zero; no timing guarantee is implied
const empty: FixedBuf<0> = FixedBuf.alloc(0);
if (!empty.isZero() || !buf32.isZero())
  throw new Error("Expected zero buffers");
if (buf16.isZero()) throw new Error("Expected nonzero bytes");

// Create from encoded strings
const fromHex = FixedBuf.fromHex<4>(4, "deadbeef");
const fromB64 = FixedBuf.fromBase64(14, "SGVsbG8gV29ybGQhISE=");
const urlFixed: FixedBuf<2> = FixedBuf.fromBase64Url(2, "-_8=");
if (urlFixed.toBase64Url() !== "-_8")
  throw new Error("Expected URL-safe bytes");
if (urlFixed.toBase64Url(true) !== "-_8=") throw new Error("Expected padding");

// Create from WebBuf
const webBuf = WebBuf.alloc(32);
const fixed = FixedBuf.fromBuf<32>(32, webBuf);

// Copy a selected native range; later source mutations do not affect it
const native = new Uint8Array([0xaa, 1, 2, 0xbb]);
const copied: FixedBuf<2> = FixedBuf.fromUint8Array(2, native.subarray(1, 3));
native[1] = 9;
if (copied.toHex() !== "0102") throw new Error("Expected an independent copy");

// Access underlying buffer
const underlying: WebBuf = fixed.buf;

// Convert to strings
fromHex.toHex(); // "deadbeef"
fromB64.toBase64(); // "SGVsbG8gV29ybGQhISE="

// Clone and reverse
const cloned = fixed.clone();
const reversed = fixed.toReverse();
```

## API

### Static Methods

| Method                                    | Description                |
| ----------------------------------------- | -------------------------- |
| `FixedBuf.alloc<N>(size, fill?)`          | Allocate fixed-size buffer |
| `FixedBuf.fromBuf<N>(size, buf)`          | Create from WebBuf         |
| `FixedBuf.fromUint8Array<N>(size, bytes)` | Copy selected native bytes |
| `FixedBuf.fromHex<N>(size, hex)`          | Create from hex string     |
| `FixedBuf.fromBase64(size, b64)`          | Create from base64 string  |
| `FixedBuf.fromRandom<N>(size)`            | Create with random bytes   |

### Instance Properties/Methods

| Property/Method | Description              |
| --------------- | ------------------------ |
| `buf`           | Get underlying WebBuf    |
| `toHex()`       | Convert to hex string    |
| `toBase64()`    | Convert to base64 string |
| `clone()`       | Create a copy            |
| `toReverse()`   | Create reversed copy     |

## License

MIT
