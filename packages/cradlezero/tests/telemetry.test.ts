import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readFrame, writeFrame } from "../src/telemetry.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/telemetry/v1/${name}`, import.meta.url), "utf8"));

describe("readFrame", () => {
  it("reads the hello and tick fixtures", () => {
    expect(readFrame(fixture("hello.json"))).toMatchObject({ kind: "hello", tick: 0n });
    expect(readFrame(fixture("tick.json"))).toMatchObject({
      kind: "tick",
      tick: 48_220n,
      solar_output_uj: 980_000n,
      auton_count: 4,
    });
  });

  it("ignores unknown fields", () => {
    expect(readFrame(fixture("tick-unknown-field.json"))).toMatchObject({ tick: 48_221n });
  });

  it("returns null for unknown kinds and unreadable ticks", () => {
    expect(readFrame({ kind: "rumor", tick: "1" })).toBeNull();
    expect(readFrame({ kind: "tick", tick: 1.5, chunk_x: 0, chunk_y: 0 })).toBeNull();
  });

  it("reads the ignition fixtures", () => {
    expect(readFrame(fixture("ignition.json"))).toEqual({
      protocol_version: 1,
      kind: "ignition",
      event_id: "ign-000042",
      tick: 48_230n,
      phenomenon_type: "flare",
      joules_added_uj: 16_500_000_000n,
      solar_reserve_uj: 14_025_000_000n,
      solar_output_daily_uj: 322_575_000n,
      callsign: "Nova_99",
      source_kind: "patron",
    });
    expect(readFrame(fixture("ignition-anonymous-unknown-field.json"))).toMatchObject({
      phenomenon_type: "pulse",
      callsign: "ANONYMOUS",
      source_kind: "cosmic",
    });
  });

  it("reads unusable ignition callsigns as ANONYMOUS and rejects unreadable energy", () => {
    const base = fixture("ignition.json") as Record<string, unknown>;
    for (const callsign of ["a", "has space", "x@y.io", 7]) {
      expect(readFrame({ ...base, callsign })).toMatchObject({ callsign: "ANONYMOUS" });
    }
    expect(readFrame({ ...base, joules_added_uj: "1.5" })).toBeNull();
    expect(readFrame({ ...base, joules_added_uj: "-1" })).toBeNull();
    expect(readFrame({ ...base, phenomenon_type: "comet" })).toBeNull();
    expect(readFrame({ ...base, event_id: "" })).toBeNull();
  });

  it("round-trips an ignition through the wire format", () => {
    const frame = readFrame(fixture("ignition.json"));
    expect(frame).not.toBeNull();
    if (frame !== null) expect(writeFrame(frame)).toEqual(fixture("ignition.json"));
  });

  it("round-trips through the wire format", () => {
    const frame = readFrame(fixture("tick.json"));
    expect(frame).not.toBeNull();
    if (frame !== null)
      expect(readFrame(JSON.parse(JSON.stringify(writeFrame(frame))))).toEqual(frame);
  });
});
