/** Cells along one edge of a chunk. */
export const CHUNK_SIZE_CELL = 64;
/** Microjoules in one joule. */
export const MICROJOULES_PER_JOULE = 1_000_000n;
/** Basis points that make up a whole (100 percent). */
export const BPS_WHOLE = 10_000;
/** The five elemental species of the substrate. */
export const ELEMENTS = ["flux", "mass", "conductor", "catalyst", "crystal"] as const;
export type Element = (typeof ELEMENTS)[number];
