/** Construct ABI version 1. Published versions never change; new capabilities go in a new version. */
export const ABI_V1_VERSION = 1;
/** WebAssembly import module name for every v1 host call. */
export const ABI_V1_MODULE = "cz_v1";

export type WasmValueType = "i32" | "i64";

export interface AbiFunction {
  readonly name: string;
  readonly params: readonly WasmValueType[];
  readonly result: WasmValueType | null;
  readonly summary: string;
}

/** Host calls a Construct may import from `cz_v1`. */
export const ABI_V1_IMPORTS: readonly AbiFunction[] = [
  {
    name: "cz_v1_sense",
    params: ["i32"],
    result: "i64",
    summary: "Reads one local sensor channel. Returns the reading as an integer.",
  },
  {
    name: "cz_v1_draw_joules",
    params: ["i64"],
    result: "i64",
    summary:
      "Requests up to the given microjoules from the construct's input. Returns microjoules granted.",
  },
  {
    name: "cz_v1_emit_wave",
    params: ["i64"],
    result: "i32",
    summary:
      "Emits a local wave with the given microjoules of strength. Returns 1 if emitted, 0 if not.",
  },
];

/** Functions every v1 Construct must export. */
export const ABI_V1_EXPORTS: readonly AbiFunction[] = [
  {
    name: "cz_tick",
    params: [],
    result: null,
    summary: "Runs once per tick while the construct is powered.",
  },
];

/** Linear memory ceiling for a v1 Construct, in 64 KiB pages. */
export const ABI_V1_MEMORY_PAGE_LIMIT = 2;
/** Largest gas limit a v1 manifest may declare, in metered instructions per tick. */
export const ABI_V1_GAS_LIMIT_MAX = 1_000_000;
/** Largest compiled module size accepted, in bytes. */
export const ABI_V1_MODULE_BYTE_LIMIT = 65_536;
