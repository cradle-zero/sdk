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

  it("round-trips through the wire format", () => {
    const frame = readFrame(fixture("tick.json"));
    expect(frame).not.toBeNull();
    if (frame !== null)
      expect(readFrame(JSON.parse(JSON.stringify(writeFrame(frame))))).toEqual(frame);
  });
});
