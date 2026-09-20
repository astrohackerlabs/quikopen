type UnsignedArray = Uint16Array | Uint32Array | BigUint64Array;
type Width = 2 | 4 | 8;
const typedArrayPrototype = Object.getPrototypeOf(
  Uint8Array.prototype,
) as object;

function validateArray(values: unknown, name: string): number {
  if (
    !ArrayBuffer.isView(values) ||
    Reflect.get(typedArrayPrototype, Symbol.toStringTag, values) !== name
  ) {
    throw new TypeError(`Expected ${name}`);
  }
  // Native ValidateTypedArray rejects detached/out-of-bounds views, unlike
  // length getters that would report zero. No iteration or user hooks occur.
  Uint8Array.prototype.values.call(values);
  return Reflect.get(typedArrayPrototype, "length", values) as number;
}

/** Internal numeric serialization, never native backing-byte reinterpretation. */
export function encodeUnsignedArray(
  values: UnsignedArray,
  width: Width,
  little: boolean,
): Uint8Array<ArrayBuffer> {
  const name =
    width === 8
      ? "BigUint64Array"
      : width === 4
        ? "Uint32Array"
        : "Uint16Array";
  const length = validateArray(values, name);
  const bytes = new Uint8Array(length * width);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < length; i++) {
    if (width === 8) view.setBigUint64(i * width, values[i] as bigint, little);
    else if (width === 4)
      view.setUint32(i * width, values[i] as number, little);
    else view.setUint16(i * width, values[i] as number, little);
  }
  return bytes;
}

export function decodeUnsignedArray(
  bytes: Uint8Array,
  width: 2,
  little: boolean,
): Uint16Array<ArrayBuffer>;
export function decodeUnsignedArray(
  bytes: Uint8Array,
  width: 4,
  little: boolean,
): Uint32Array<ArrayBuffer>;
export function decodeUnsignedArray(
  bytes: Uint8Array,
  width: 8,
  little: boolean,
): BigUint64Array<ArrayBuffer>;
export function decodeUnsignedArray(
  bytes: Uint8Array,
  width: Width,
  little: boolean,
): UnsignedArray {
  const length = validateArray(bytes, "Uint8Array");
  if (length % width !== 0)
    throw new RangeError(`Byte length must be divisible by ${String(width)}`);
  const buffer = Reflect.get(
    typedArrayPrototype,
    "buffer",
    bytes,
  ) as ArrayBufferLike;
  const offset = Reflect.get(
    typedArrayPrototype,
    "byteOffset",
    bytes,
  ) as number;
  const view = new DataView(buffer, offset, length);
  const count = length / width;
  if (width === 8) {
    const values = new BigUint64Array(count);
    for (let i = 0; i < count; i++)
      values[i] = view.getBigUint64(i * width, little);
    return values;
  }
  if (width === 4) {
    const values = new Uint32Array(count);
    for (let i = 0; i < count; i++)
      values[i] = view.getUint32(i * width, little);
    return values;
  }
  const values = new Uint16Array(count);
  for (let i = 0; i < count; i++) values[i] = view.getUint16(i * width, little);
  return values;
}
