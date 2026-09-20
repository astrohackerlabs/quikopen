# Signed-magnitude reference vectors

`signed-magnitude-vectors.json` comes from MIT-licensed Libauth commit
`60aec239cc2d57ae21d0069c5bbafb346abc9b66`, not WebBuf. The permission notice
is retained in `LIBAUTH-LICENSE.txt`. Reproduce from the monorepo root in Nu:

```nu
bun -e 'import {bigIntToVmNumber} from "./vendor/libauth/src/lib/vm/instruction-sets/common/instruction-sets-utils.ts"; const values=[...Array.from({length:33},(_,i)=>BigInt(i-16)),127n,128n,255n,256n,-127n,-128n,-255n,-256n,32767n,32768n,-32768n,1n<<32n,-(1n<<32n),1n<<64n,-(1n<<64n),1n<<512n,-(1n<<512n)]; console.log(JSON.stringify(values.map(n=>({value:n.toString(),hex:Buffer.from(bigIntToVmNumber(n)).toString("hex")})),null,2));'
```

There are 50 vectors. BCH encodes zero as empty; the generic WebBuf default
encodes zero as `00`. Tests explicitly account for this difference and reverse
the independently expected LE bytes for BE, without using the new encoders to
derive expectations. The identical fixture in bchlib tests BCH's empty zero.
