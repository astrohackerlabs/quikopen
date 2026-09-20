# @webbuf/webbuf

Byte-buffer wrapper with base64/hex encoding, optimized with Rust/WASM.

## WebBuf 4 migration

WebBuf **has** a native `Uint8Array`; it no longer extends one. Access mutable
bytes with `buf.bytes[i]` and pass `buf.bytes` to Web Crypto, TextDecoder,
Node Buffer, WASM and other native-array APIs. WebBuf is not an ArrayBuffer
view and cannot be passed as a `BufferSource` itself. The `bytes` property is
readonly in TypeScript; the bytes themselves remain mutable.

`length`, `byteLength`, `byteOffset`, `buffer`, iteration and named WebBuf
encoding/compare/mutation helpers remain available. Use `.bytes` for other
native typed-array methods instead of relying on inherited methods.

| Operation                                                          | Storage behavior                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| `new WebBuf(length)` / `alloc`                                     | Allocate ordinary ArrayBuffer storage                 |
| `new WebBuf(arrayLikeOrIterable)` / `fromUint8Array` / `fromArray` | Copy                                                  |
| `new WebBuf(arrayBuffer, offset?, length?)`                        | View the selected backing storage                     |
| `view(arrayOrWebBuf)`                                              | Share selected bytes, preserving offset and length    |
| `from(arrayOrWebBuf)` without mapper                               | Share (preserved behavior)                            |
| `from(input, mapper)`                                              | Mapped copy, including native-array and WebBuf inputs |
| `slice` / `clone` / `toReverse`                                    | Independent copy                                      |
| `subarray` / `read`                                                | Shared view                                           |

Stored arrays always use ordinary `ArrayBuffer` backing. SharedArrayBuffer
views cannot be wrapped: explicitly copy with `fromUint8Array(sharedView)` or
`new WebBuf(sharedView)`. Native-array subclasses such as Node Buffer are
normalized to a plain Uint8Array view when wrapping, without copying storage.

`fill` uses native Uint8Array coercion, including negative indices and byte
value normalization. A mapper supplied to `from` is honored for native arrays
instead of being ignored. `wipe`, `set`, `write`, `reverse` and `fill` mutate
shared storage; `copy` handles overlapping regions.

WebBuf 4.0.0 was released with this composition-based API. All 29 WebBuf npm
libraries were released together at 4.0.0. Existing WebBuf 3 consumers must
update native-array boundaries and indexed access as described above.

## Zero predicate

`buf.isZero(): boolean` returns true when every selected byte is zero,
including for an empty buffer. It reads current bytes without copying or
mutation; changes through shared views are visible on the next call.
Bytes outside the selected range are ignored. Detached or out-of-bounds
storage throws TypeError. This predicate may exit early and is not constant-time.

## Copying native views

`WebBuf.fromArrayBufferView(view: ArrayBufferView): WebBuf` accepts DataView
and native typed arrays, including Node Buffer, and copies their selected
`byteOffset`/`byteLength` range into independent ordinary ArrayBuffer storage.
It copies raw bytes, not numeric elements: two Uint16Array elements produce
four bytes without endian conversion. Use numeric APIs for wire byte order.
Empty views produce independent empty buffers. Source and result mutations,
including wiping, do not affect each other.

SharedArrayBuffer-backed views are accepted by copying, but this does not
promise an atomic snapshot of concurrent writes. Cross-realm native views are
accepted. Non-views (including WebBuf, bare buffers and view-shaped objects)
throw TypeError. Detached views propagate native access/construction errors;
native range semantics apply to resized storage, with no concurrency recovery.

TypeScript's ArrayBufferView interface is structural: WebBuf has its three
required properties, so TypeScript alone cannot reject that argument. The
runtime `ArrayBuffer.isView` guard enforces native-view membership.
The existing `fromUint8Array`, `from`, `view`, `slice` and `subarray` contracts
are unchanged.

## Base64url

`fromBase64Url(text, stripWhitespace = false)` copies decoded bytes into owned
storage. `toBase64Url(padding = false)` encodes only the selected bytes without
mutation. Both have explicit `PureJs` and `Wasm` variants; the generic methods
follow the existing Base64 backend policy. The PureJs URL encoder supports large
buffers using bounded chunks.

Decoding accepts URL-safe `-`/`_`, either unpadded or with exactly the required
trailing `=` padding. It rejects ordinary `+`/`/`, mixed alphabets, nonzero unused
pad bits, invalid length, partial/excess/interior padding and whitespace.
Explicit `stripWhitespace = true` removes JavaScript `\s` before validation.
Empty text is valid. Malformed input, non-string input and non-boolean supplied
options throw TypeError. Omitted/undefined options use their defaults.
Existing Base64 methods retain their behavior.

## Unsigned numeric arrays

These conversions serialize numeric elements with explicit byte order; they do
not copy or reinterpret the host's native array-memory layout.

| Numeric array    | Encode to WebBuf                                | Decode from WebBuf                          |
| ---------------- | ----------------------------------------------- | ------------------------------------------- |
| `Uint16Array`    | `fromUint16ArrayBE` / `fromUint16ArrayLE`       | `toUint16ArrayBE` / `toUint16ArrayLE`       |
| `Uint32Array`    | `fromUint32ArrayBE` / `fromUint32ArrayLE`       | `toUint32ArrayBE` / `toUint32ArrayLE`       |
| `BigUint64Array` | `fromBigUint64ArrayBE` / `fromBigUint64ArrayLE` | `toBigUint64ArrayBE` / `toBigUint64ArrayLE` |

All methods allocate independent ordinary ArrayBuffer storage, including empty
results, and never mutate inputs. Selected offsets and lengths are respected;
decoding unaligned byte offsets is valid. Encoding requires a genuine matching
typed array (including cross-realm instances and subclasses), not plain arrays,
DataView, other widths, signed/float arrays or spoofed objects. Wrong input types,
detached views and out-of-bounds views throw TypeError. Decoding byte lengths not
divisible by the element width throws RangeError. Native allocation/access
failures propagate.

64-bit values remain bigint, with no lossy number conversion. Shared-memory
input is copied without an atomic-snapshot guarantee; no concurrent resize
recovery is promised. Output typed arrays are plain arrays of the named type,
not input subclasses. Use `fromArrayBufferView` for raw byte copying instead.
Existing byte-copy/view APIs are unchanged; 8-bit values need no endian suffix.

## Installation

```bash
npm install @webbuf/webbuf
```

## Usage

```typescript
import { WebBuf } from "@webbuf/webbuf";

// Create from various sources
const backing = new Uint8Array([0xee, 72, 105, 0xff]);
const selected = WebBuf.view(backing.subarray(1, 3));
new TextDecoder().decode(selected.bytes); // "Hi", not the sentinels
const shared = selected.subarray(0, 1);
const copied = selected.slice(0, 1);
shared.bytes[0] = 66;
selected.toUtf8(); // "Bi": subarray shares storage
copied.toUtf8(); // "H": slice owns a copy
selected instanceof Uint8Array; // false
ArrayBuffer.isView(selected); // false

// Copy only a DataView's selected raw bytes, excluding sentinels
const nativeBytes = new Uint8Array([0xee, 1, 2, 3, 0xff]);
const viewCopy = WebBuf.fromArrayBufferView(
  new DataView(nativeBytes.buffer, 1, 3),
);
nativeBytes.fill(0);
if (viewCopy.toHex() !== "010203")
  throw new Error("Expected copied view bytes");

const buf1 = WebBuf.alloc(32);
const buf2 = WebBuf.fromHex("deadbeef");
const buf3 = WebBuf.fromBase64("SGVsbG8=");
const buf4 = WebBuf.fromUtf8("Hello, world!");
const buf5 = WebBuf.fromArray([1, 2, 3, 4]);

// Ordinary byte predicates, not timing-safe secret comparisons
if (!buf1.isZero() || !WebBuf.alloc(0).isZero())
  throw new Error("Expected zero buffers");
if (buf2.isZero()) throw new Error("Expected nonzero bytes");

// Convert to strings
buf2.toHex(); // "deadbeef"
buf3.toBase64(); // "SGVsbG8="
buf4.toUtf8(); // "Hello, world!"

// Buffer operations
const combined = WebBuf.concat([buf1, buf2]);
const cloned = buf1.clone();
const reversed = buf1.toReverse();

// Comparison
buf1.equals(buf2); // false
buf1.compare(buf2); // -1, 0, or 1

// Numeric serialization does not depend on native array endianness.
const words = new Uint32Array([0x01234567, 0x89abcdef]);
const wordBytes = WebBuf.fromUint32ArrayBE(words);
if (wordBytes.toHex() !== "0123456789abcdef")
  throw new Error("BE word bytes differ");
if (WebBuf.fromUint16ArrayLE(new Uint16Array([0x1234])).toHex() !== "3412")
  throw new Error("LE word bytes differ");
const exact64 = 0x0123456789abcdefn;
if (
  WebBuf.fromBigUint64ArrayLE(
    new BigUint64Array([exact64]),
  ).toBigUint64ArrayLE()[0] !== exact64
)
  throw new Error("Lost 64-bit precision");
if (wordBytes.toUint32ArrayBE()[1] !== 0x89abcdef)
  throw new Error("Word decoding differs");

// Strict Base64url; selectors use the same unpadded output policy.
const urlBytes = WebBuf.fromBase64Url("-_8=");
if (urlBytes.toBase64Url() !== "-_8") throw new Error("Expected no padding");
if (urlBytes.toBase64Url(true) !== "-_8=") throw new Error("Expected padding");
if (WebBuf.from("-_8", "base64url").toString("base64url") !== "-_8")
  throw new Error("Selector mismatch");
if (WebBuf.fromString("-_8", "base64url").toHex() !== "fbff")
  throw new Error("Decoded bytes differ");
```

## API

### Static Methods

| Method                       | Description                   |
| ---------------------------- | ----------------------------- |
| `WebBuf.alloc(size, fill?)`  | Allocate buffer of given size |
| `WebBuf.concat(list)`        | Concatenate multiple buffers  |
| `WebBuf.fromUint8Array(arr)` | Create from Uint8Array        |
| `WebBuf.fromArray(arr)`      | Create from number array      |
| `WebBuf.fromHex(hex)`        | Create from hex string        |
| `WebBuf.fromBase64(b64)`     | Create from base64 string     |
| `WebBuf.fromUtf8(str)`       | Create from UTF-8 string      |

### Instance Methods

| Method                   | Description              |
| ------------------------ | ------------------------ |
| `toHex()`                | Convert to hex string    |
| `toBase64()`             | Convert to base64 string |
| `toUtf8()`               | Convert to UTF-8 string  |
| `clone()`                | Create a copy            |
| `toReverse()`            | Create reversed copy     |
| `equals(other)`          | Check equality           |
| `compare(other)`         | Compare (-1, 0, 1)       |
| `slice(start?, end?)`    | Get slice as WebBuf      |
| `subarray(start?, end?)` | Get subarray as WebBuf   |

## License

MIT
