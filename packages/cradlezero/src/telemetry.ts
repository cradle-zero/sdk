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

/** What the energy injection looked like on the stream. */
export const IGNITION_PHENOMENA = ["spark", "flare", "corona", "supernova", "pulse"] as const;
export type IgnitionPhenomenon = (typeof IGNITION_PHENOMENA)[number];

/** Who caused it: a viewer, a patron, or the universe itself (scheduled pulses and milestones). */
export const IGNITION_SOURCES = ["observer", "patron", "cosmic"] as const;
export type IgnitionSource = (typeof IGNITION_SOURCES)[number];

/** Callsign shown when a patron stays anonymous or the requested callsign is not allowed. */
export const ANONYMOUS_CALLSIGN = "ANONYMOUS";

const CALLSIGN = /^[A-Za-z0-9_]{2,16}$/;

/** Energy added to the Sun, with the reserve and daily output after it landed. */
export interface IgnitionFrame {
  readonly protocol_version: number;
  readonly kind: "ignition";
  readonly event_id: string;
  readonly tick: bigint;
  readonly phenomenon_type: IgnitionPhenomenon;
  readonly joules_added_uj: bigint;
  readonly solar_reserve_uj: bigint;
  readonly solar_output_daily_uj: bigint;
  readonly callsign: string;
  readonly source_kind: IgnitionSource;
}

export type Frame = HelloFrame | TickFrame | IgnitionFrame;

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

const COORD_LIMIT = 1_000_000;

/**
 * Reads one public telemetry frame. Tolerant: unknown fields are ignored and missing optional
 * fields get defaults. Returns null for unknown kinds or required fields that cannot be read. An
 * ignition callsign that is missing or not 2 to 16 letters, digits or underscores reads as
 * ANONYMOUS.
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
  if (input.kind === "ignition") {
    const { event_id, phenomenon_type, source_kind } = input;
    const joules_added_uj = readDecimal(input.joules_added_uj);
    const solar_reserve_uj = readDecimal(input.solar_reserve_uj ?? "0");
    const solar_output_daily_uj = readDecimal(input.solar_output_daily_uj ?? "0");
    if (typeof event_id !== "string" || event_id === "") return null;
    if (!isOneOf(IGNITION_PHENOMENA, phenomenon_type)) return null;
    if (!isOneOf(IGNITION_SOURCES, source_kind)) return null;
    if (joules_added_uj === null || joules_added_uj < 0n) return null;
    if (solar_reserve_uj === null || solar_reserve_uj < 0n) return null;
    if (solar_output_daily_uj === null || solar_output_daily_uj < 0n) return null;
    const callsign =
      typeof input.callsign === "string" && CALLSIGN.test(input.callsign)
        ? input.callsign
        : ANONYMOUS_CALLSIGN;
    return {
      protocol_version,
      kind: "ignition",
      event_id,
      tick,
      phenomenon_type,
      joules_added_uj,
      solar_reserve_uj,
      solar_output_daily_uj,
      callsign,
      source_kind,
    };
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
  if (frame.kind === "ignition") {
    return {
      protocol_version: frame.protocol_version,
      kind: frame.kind,
      event_id: frame.event_id,
      tick: frame.tick.toString(),
      phenomenon_type: frame.phenomenon_type,
      joules_added_uj: frame.joules_added_uj.toString(),
      solar_reserve_uj: frame.solar_reserve_uj.toString(),
      solar_output_daily_uj: frame.solar_output_daily_uj.toString(),
      callsign: frame.callsign,
      source_kind: frame.source_kind,
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
