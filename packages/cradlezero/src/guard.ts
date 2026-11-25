/** Small runtime type guards shared by the validators. Internal. */

export type Plain = Readonly<Record<string, unknown>>;

export function isPlain(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

const DECIMAL = /^-?(0|[1-9][0-9]*)$/;

/** Reads a decimal string (or a safe integer number) as a bigint. */
export function readDecimal(value: unknown): bigint | null {
  if (typeof value === "string" && DECIMAL.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}
