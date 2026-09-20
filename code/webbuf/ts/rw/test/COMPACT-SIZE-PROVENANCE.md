# CompactSize reference vectors

`compact-size-vectors.json` contains 15 vectors from Libauth commit
`60aec239cc2d57ae21d0069c5bbafb346abc9b66`. Source:
`src/lib/format/number.ts`, `bigIntToCompactUint`. MIT permission is retained in
`LIBAUTH-LICENSE.txt`. Reproduce from the monorepo root in Nushell:

```nu
bun -e 'import {bigIntToCompactUint} from "./vendor/libauth/src/lib/format/number.ts"; const values=[0n,1n,252n,253n,254n,255n,256n,65535n,65536n,2n**32n-1n,2n**32n,2n**53n-1n,2n**53n,2n**53n+1n,2n**64n-1n]; console.log(JSON.stringify(values.map(n=>({value:n.toString(),hex:Buffer.from(bigIntToCompactUint(n)).toString("hex")})),null,2));'
```

Tests use these bytes, not WebBuf-generated expectations. Invalid noncanonical
encodings follow BCHN `ReadCompactSizeWithLimit` at commit
`3c2c3de892bf835d777fc448beb076511b1127f1`, `src/serialize.h`.
Ordinary test execution requires neither vendor repositories nor network access.
