/** Map an arbitrary-precision signed integer to an unsigned integer. */
export function zigZagEncode(value: bigint): bigint {
  if (typeof value !== "bigint") throw new TypeError("Expected bigint");
  return value >= 0n ? value * 2n : -value * 2n - 1n;
}

/** Invert ZigZag; this transform does not read or write encoded bytes. */
export function zigZagDecode(value: bigint): bigint {
  if (typeof value !== "bigint") throw new TypeError("Expected bigint");
  if (value < 0n) throw new RangeError("ZigZag input must be unsigned");
  return value % 2n === 0n ? value / 2n : -(value + 1n) / 2n;
}
