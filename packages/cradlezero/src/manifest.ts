import { ABI_V1_GAS_LIMIT_MAX, ABI_V1_MEMORY_PAGE_LIMIT, ABI_V1_VERSION } from "./abi-v1.ts";
import { BPS_WHOLE, CHUNK_SIZE_CELL } from "./constants.ts";
import { isIntegerIn, isPlain } from "./guard.ts";

export const GEOMETRY_SHAPES = ["rect", "circle", "line"] as const;
export type GeometryShape = (typeof GEOMETRY_SHAPES)[number];

/** Largest hue index in the Telescope palette. */
export const GEOMETRY_HUE_INDEX_MAX = 11;

export interface ConstructGeometry {
  readonly shape: GeometryShape;
  readonly width_cell: number;
  readonly height_cell: number;
  readonly hue_index: number;
}

export interface ConstructManifestV1 {
  readonly abi_version: 1;
  readonly slug: string;
  readonly author_id: string;
  readonly gas_limit: number;
  readonly royalty_bps: number;
  readonly memory_page_limit: number;
  readonly geometry: ConstructGeometry;
}

export type ManifestResult =
  | { readonly ok: true; readonly manifest: ConstructManifestV1 }
  | { readonly ok: false; readonly issues: readonly string[] };

const SLUG = /^[a-z][a-z0-9-]{2,47}$/;
const AUTHOR_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MANIFEST_KEYS = new Set([
  "abi_version",
  "slug",
  "author_id",
  "gas_limit",
  "royalty_bps",
  "memory_page_limit",
  "geometry",
]);
const GEOMETRY_KEYS = new Set(["shape", "width_cell", "height_cell", "hue_index"]);

function readGeometry(value: unknown, issues: string[]): ConstructGeometry | null {
  if (!isPlain(value)) {
    issues.push("geometry must be an object");
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!GEOMETRY_KEYS.has(key)) issues.push(`geometry.${key} is not a v1 field`);
  }
  const { shape, width_cell, height_cell, hue_index } = value;
  const before = issues.length;
  if (typeof shape !== "string" || !(GEOMETRY_SHAPES as readonly string[]).includes(shape)) {
    issues.push(`geometry.shape must be one of ${GEOMETRY_SHAPES.join(", ")}`);
  }
  if (!isIntegerIn(width_cell, 1, CHUNK_SIZE_CELL)) {
    issues.push(`geometry.width_cell must be an integer from 1 to ${CHUNK_SIZE_CELL}`);
  }
  if (!isIntegerIn(height_cell, 1, CHUNK_SIZE_CELL)) {
    issues.push(`geometry.height_cell must be an integer from 1 to ${CHUNK_SIZE_CELL}`);
  }
  if (!isIntegerIn(hue_index, 0, GEOMETRY_HUE_INDEX_MAX)) {
    issues.push(`geometry.hue_index must be an integer from 0 to ${GEOMETRY_HUE_INDEX_MAX}`);
  }
  if (issues.length > before) return null;
  return {
    shape: shape as GeometryShape,
    width_cell: width_cell as number,
    height_cell: height_cell as number,
    hue_index: hue_index as number,
  };
}

/**
 * Validates a Construct manifest. Manifests are authored input, so unknown fields are rejected.
 * Supports abi_version 1; later versions are reported as unsupported by this release.
 */
export function validateConstructManifest(input: unknown): ManifestResult {
  const issues: string[] = [];
  if (!isPlain(input)) return { ok: false, issues: ["manifest must be a JSON object"] };

  if (input.abi_version !== ABI_V1_VERSION) {
    const found = JSON.stringify(input.abi_version ?? null);
    return { ok: false, issues: [`abi_version ${found} is not supported (expected 1)`] };
  }
  for (const key of Object.keys(input)) {
    if (!MANIFEST_KEYS.has(key)) issues.push(`${key} is not a v1 field`);
  }
  const { slug, author_id, gas_limit, royalty_bps, memory_page_limit } = input;
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    issues.push("slug must match ^[a-z][a-z0-9-]{2,47}$");
  }
  if (typeof author_id !== "string" || !AUTHOR_ID.test(author_id)) {
    issues.push("author_id must match ^[a-z0-9][a-z0-9_-]{0,63}$");
  }
  if (!isIntegerIn(gas_limit, 1, ABI_V1_GAS_LIMIT_MAX)) {
    issues.push(`gas_limit must be an integer from 1 to ${ABI_V1_GAS_LIMIT_MAX}`);
  }
  if (!isIntegerIn(royalty_bps, 0, BPS_WHOLE)) {
    issues.push(`royalty_bps must be an integer from 0 to ${BPS_WHOLE}`);
  }
  if (!isIntegerIn(memory_page_limit, 1, ABI_V1_MEMORY_PAGE_LIMIT)) {
    issues.push(`memory_page_limit must be an integer from 1 to ${ABI_V1_MEMORY_PAGE_LIMIT}`);
  }
  const geometry = readGeometry(input.geometry, issues);
  if (issues.length > 0 || geometry === null) return { ok: false, issues };

  return {
    ok: true,
    manifest: {
      abi_version: 1,
      slug: slug as string,
      author_id: author_id as string,
      gas_limit: gas_limit as number,
      royalty_bps: royalty_bps as number,
      memory_page_limit: memory_page_limit as number,
      geometry,
    },
  };
}
