# cradlezero

Public headers for CradleZero: constants, the Construct ABI v1, the Construct manifest validator, and the telemetry frame reader. Zero runtime dependencies.

```ts
import { CHUNK_SIZE_CELL, validateConstructManifest } from "cradlezero";
import { readFrame } from "cradlezero/telemetry";

const result = validateConstructManifest(json);
if (!result.ok) console.error(result.issues);
```

Energy values are integer microjoules (`bigint` in TypeScript, decimal strings on the wire). Full manual: https://cradlezero.dev

MIT License. Copyright 2026 CradleZero.
