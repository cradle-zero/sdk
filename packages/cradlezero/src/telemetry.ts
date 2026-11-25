import { isIntegerIn, isPlain, readDecimal } from "./guard.ts";

/** Current public telemetry protocol version. */
export const PROTOCOL_VERSION = 1;

export interface HelloFrame {
  readonly protocol_version: number;
  readonly kind: "hello";
  readonly epoch_slug: string;
  readonly tick: bigint;
}

export interface TickFrame {
  readonly protocol_version: number;
  readonly kind: "tick";
  readonly tick: bigint;
  readonly chunk_x: number;
  readonly chunk_y: number;
  readonly solar_output_uj: bigint;
  readonly auton_count: number;
}

export type Frame = HelloFrame | TickFrame;

const COORD_LIMIT = 1_000_000;

/**
 * Reads one public telemetry frame. Tolerant: unknown fields are ignored and missing optional
 * fields get defaults. Returns null for unknown kinds or required fields that cannot be read.
 */
export function readFrame(input: unknown): Frame | null {
  if (!isPlain(input)) return null;
  const protocol_version = isIntegerIn(input.protocol_version, 1, 65_535)
    ? input.protocol_version
    : PROTOCOL_VERSION;
  const tick = readDecimal(input.tick);
  if (tick === null || tick < 0n) return null;

  if (input.kind === "hello") {
    const epoch_slug = typeof input.epoch_slug === "string" ? input.epoch_slug : "";
    return { protocol_version, kind: "hello", epoch_slug, tick };
  }
  if (input.kind === "tick") {
    const solar_output_uj = readDecimal(input.solar_output_uj ?? "0");
    const { chunk_x, chunk_y } = input;
    if (solar_output_uj === null) return null;
    if (!isIntegerIn(chunk_x, -COORD_LIMIT, COORD_LIMIT)) return null;
    if (!isIntegerIn(chunk_y, -COORD_LIMIT, COORD_LIMIT)) return null;
    const auton_count = isIntegerIn(input.auton_count, 0, Number.MAX_SAFE_INTEGER)
      ? input.auton_count
      : 0;
    return { protocol_version, kind: "tick", tick, chunk_x, chunk_y, solar_output_uj, auton_count };
  }
  return null;
}

/** Encodes a frame for the wire: bigint values become decimal strings. */
export function writeFrame(frame: Frame): Record<string, string | number> {
  if (frame.kind === "hello") {
    return {
      protocol_version: frame.protocol_version,
      kind: frame.kind,
      epoch_slug: frame.epoch_slug,
      tick: frame.tick.toString(),
    };
  }
  return {
    protocol_version: frame.protocol_version,
    kind: frame.kind,
    tick: frame.tick.toString(),
    chunk_x: frame.chunk_x,
    chunk_y: frame.chunk_y,
    solar_output_uj: frame.solar_output_uj.toString(),
    auton_count: frame.auton_count,
  };
}
