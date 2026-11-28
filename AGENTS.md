# AGENTS.md: CradleZero SDK

Public repository. Everything here is visible to everyone. It holds thin public headers only: constants, the Construct ABI, the manifest validator, telemetry frame types, and the cradlezero.dev manual.

## Commands

- Setup: `mise install && pnpm install`
- Full gate (same as CI): `pnpm gate`
- Lint and format: `pnpm check` / `pnpm fix`
- Tests: `pnpm test`
- Public API snapshot: `pnpm api` (refresh after an intended change: `pnpm api:update`, plus a changeset)
- Release notes: `pnpm changeset`

## Rules

- Zero runtime dependencies in `packages/cradlezero`.
- Never add engine logic, tuning values, heuristics, or anything from private repositories.
- Never commit secrets, tokens, or personal data. CradleZero is the only business and copyright name.
- The ABI is versioned and immutable: add `cz_v2_*` alongside `cz_v1_*`; never change a published version.
- Wire and manifest fields are snake_case (`entity_qualifier_property_unit`). Energy is integer microjoules (`_uj`) sent as decimal strings; shares are integer basis points (`_bps`).
- Telemetry readers are tolerant: ignore unknown fields, default missing optional ones. Add a fixture for every new frame version.
- TypeScript: strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, relative imports with `.ts` extensions, erasable syntax only.
- Work on a branch and open a pull request. `main` accepts squash merges only after `gate` passes.

## Engineering Operating System (EOS)

- Maintainer pull requests must include the `## EOS Metadata` trailer block from `.github/pull_request_template.md` (`EOS-Tier`, `EOS-Linear`, plus `EOS-Plan` and `EOS-Phase` for Tier 1 and Tier 2), obey `.cz-protected-paths.json`, and pass `scripts/plan-guard.mjs` inside CI `gate`.
- Never include private repository URLs, private operational details, or commercial terms in pull requests or repository files, and never click the GitHub Web UI "Update branch" button.
