import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateConstructManifest } from "../src/index.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/manifest/v1/${name}`, import.meta.url), "utf8"));

describe("validateConstructManifest", () => {
  it("accepts the valid v1 fixture", () => {
    const result = validateConstructManifest(fixture("valid.json"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.slug).toBe("thermal-harvester");
  });

  it("reports every problem in the invalid fixture", () => {
    const result = validateConstructManifest(fixture("invalid.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThanOrEqual(6);
  });

  it("rejects unknown fields and future abi versions", () => {
    const valid = fixture("valid.json") as Record<string, unknown>;
    expect(validateConstructManifest({ ...valid, extra: true }).ok).toBe(false);
    expect(validateConstructManifest({ ...valid, abi_version: 2 }).ok).toBe(false);
    expect(validateConstructManifest(null).ok).toBe(false);
  });
});
