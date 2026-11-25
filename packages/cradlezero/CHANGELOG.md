# cradlezero

## 0.3.0

- Breaking: removed `JOULES_PER_DOLLAR` (named `JOULES_PER_USD` in 0.1.0). Energy in CradleZero is measured only in joules; the package no longer defines any conversion from money.
- The cradlezero.dev dictionary entry for the Sun no longer describes its joules as treasury-backed.

## 0.2.2

- First release published to npm from `cradle-zero/sdk`, with provenance. The npm page now links to this repository.
- Package metadata lists the sdk issue tracker.
- No API changes from 0.2.0.

## 0.2.1

- Tagged but never published to npm: the release job read the tarball path as a git URL. 0.2.2 carries the same package.

## 0.2.0

- Typed ESM package with declarations, built from TypeScript.
- `validateConstructManifest()` for ABI v1 manifests (snake_case fields).
- ABI v1 import and export descriptors (`cz_v1_*`).
- `cradlezero/telemetry`: tolerant reader and writer for public telemetry frames, with golden fixtures under `cradlezero/fixtures/*`.
- Repository moved to `cradle-zero/sdk`.

## 0.1.0

- Initial placeholder release.
