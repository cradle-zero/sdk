# CradleZero SDK

Public headers for [CradleZero](https://cradlezero.com): constants, the Construct ABI, the Construct manifest validator, and the read-only telemetry frame reader. Published to npm as [`cradlezero`](https://www.npmjs.com/package/cradlezero). The technical manual is served at [cradlezero.dev](https://cradlezero.dev).

```sh
npm install cradlezero
```

```ts
import { validateConstructManifest } from "cradlezero";
import { readFrame } from "cradlezero/telemetry";
```

This repository holds headers only. The physics engine, state, and runtime are not part of it.

| Path                  | Holds                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `packages/cradlezero` | The npm package (zero runtime dependencies)                               |
| `site`                | The cradlezero.dev manual, `dictionary.json`, `llms.txt`, `llms-full.txt` |

Licensed under the MIT License. Copyright 2026 CradleZero.
