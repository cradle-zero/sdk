// Enforces EOS pull request metadata and protected-path bounds for the public SDK repository.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_REPO = "sdk";
const MERGE_REF = /^refs\/pull\/\d+\/merge$/;

const BLOCKED_LABELS = new Set(["hold", "do-not-merge", "wip"]);
const BLOCKED_TITLE_RE =
  /^(?:\[(?:HOLD|WIP|DO NOT MERGE)\]|(?:HOLD|WIP|DO NOT MERGE)\b)|\bDO NOT MERGE\b/i;

const KNOWN_TRAILERS = new Set([
  "EOS-Tier",
  "EOS-Linear",
  "EOS-Plan",
  "EOS-Phase",
  "EOS-Override",
  "EOS-Ratchet-ADR",
]);

const LINEAR_TOKEN_RE = /^CZ-[1-9][0-9]*$/;
const PLAN_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIER1_PHASE_RE = /^(?:mini-rfc|[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const TIER2_PHASE_RE = /^[0-9]{2}[a-z]?$/;
const ADR_RE = /^ADR-[0-9]{4}$/;

const HARDCODED_PROTECTED_FLOOR = [
  ".github/workflows/**",
  ".github/CODEOWNERS",
  ".gitleaks.toml",
  ".cz-protected-paths.json",
  "mise.toml",
  "package.json",
];

const ALLOWED_POLICY_KEYS = new Set([
  "schema_version",
  "repo",
  "tier0_max_files",
  "lockfiles",
  "protected_globs",
  "owner_merge_always_globs",
]);

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function revParse(ref, cwd) {
  if (!ref) return null;
  try {
    return git(["rev-parse", "--verify", ref], cwd).trim();
  } catch {
    return null;
  }
}

function matchSegment(patternSeg, pathSeg) {
  let regex = "^";
  for (const ch of patternSeg) {
    if (ch === "*") {
      regex += "[^/]*";
    } else if (ch === "?") {
      regex += "[^/]";
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  regex += "$";
  return new RegExp(regex).test(pathSeg);
}

/** Deterministic flat POSIX glob matcher that rejects brace syntax. */
export function matchGlob(glob, filePath) {
  if (typeof glob !== "string" || glob.includes("{") || glob.includes("}")) {
    throw new Error(`Invalid glob pattern (braces are forbidden): ${String(glob)}`);
  }
  const patSegs = glob.split("/");
  const pathSegs = filePath.split("/");
  const memo = new Map();

  function dp(i, j) {
    const key = `${i}:${j}`;
    if (memo.has(key)) return memo.get(key);
    let result = false;
    if (i === patSegs.length && j === pathSegs.length) {
      result = true;
    } else if (i < patSegs.length && patSegs[i] === "**") {
      if (i === patSegs.length - 1 && i > 0) {
        result = j < pathSegs.length;
      } else {
        result = dp(i + 1, j) || (j < pathSegs.length && dp(i, j + 1));
      }
    } else if (i < patSegs.length && j < pathSegs.length) {
      result = matchSegment(patSegs[i], pathSegs[j]) && dp(i + 1, j + 1);
    }
    memo.set(key, result);
    return result;
  }

  return dp(0, 0);
}

/** Validates a .cz-protected-paths.json object and rejects brace globs. */
export function validatePolicy(policy, expectedRepo = EXPECTED_REPO) {
  const errors = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return ["policy must be a JSON object"];
  }
  for (const key of Object.keys(policy)) {
    if (!ALLOWED_POLICY_KEYS.has(key)) {
      errors.push(`unknown policy key: ${key}`);
    }
  }
  if (policy.schema_version !== 1) {
    errors.push(`schema_version must be 1 (got ${String(policy.schema_version)})`);
  }
  if (policy.repo !== expectedRepo) {
    errors.push(`policy repo must be "${expectedRepo}" (got ${String(policy.repo)})`);
  }
  if (
    typeof policy.tier0_max_files !== "number" ||
    !Number.isInteger(policy.tier0_max_files) ||
    policy.tier0_max_files < 1
  ) {
    errors.push("tier0_max_files must be a positive integer");
  }
  for (const field of ["lockfiles", "protected_globs", "owner_merge_always_globs"]) {
    const list = policy[field];
    if (!Array.isArray(list)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    for (const entry of list) {
      if (typeof entry !== "string" || entry.length === 0) {
        errors.push(`${field} entries must be non-empty strings`);
        continue;
      }
      if (entry.includes("{") || entry.includes("}")) {
        errors.push(`${field} entry contains forbidden braces: ${entry}`);
      }
      if (entry.includes("\\") || entry.startsWith("/") || entry.split("/").includes("..")) {
        errors.push(`${field} entry must be a relative POSIX path or glob: ${entry}`);
      }
    }
  }
  return errors;
}

/** Strips HTML comments and fenced code blocks before parsing trailers. */
export function stripMarkdownNoise(body) {
  const withoutComments = String(body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.split(/\r?\n/);
  const kept = [];
  let fenceChar = null;
  let fenceLen = 0;

  for (const line of lines) {
    if (fenceChar === null) {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (open) {
        fenceChar = open[1][0];
        fenceLen = open[1].length;
        continue;
      }
      kept.push(line);
    } else {
      const closeRe = new RegExp(`^ {0,3}${fenceChar}{${fenceLen},}\\s*$`);
      if (closeRe.test(line)) {
        fenceChar = null;
        fenceLen = 0;
      }
    }
  }

  return kept.join("\n");
}

/** Extracts EOS-* trailers from stripped PR body text. */
export function parseTrailers(strippedBody) {
  const trailers = {};
  const errors = [];
  for (const line of strippedBody.split(/\r?\n/)) {
    const match = /^\s*(EOS-[A-Za-z0-9-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (!KNOWN_TRAILERS.has(key)) {
      errors.push(`unknown trailer key: ${key}`);
      continue;
    }
    if (Object.hasOwn(trailers, key)) {
      errors.push(`duplicate trailer key: ${key}`);
      continue;
    }
    trailers[key] = value;
  }
  return { trailers, errors };
}

function resolveDiffContext({ baseRef, githubRef, headSha, cwd }) {
  const isMergeRef =
    MERGE_REF.test(githubRef ?? "") &&
    typeof headSha === "string" &&
    headSha.length > 0 &&
    revParse("HEAD^1", cwd) !== null &&
    revParse("HEAD^2", cwd) === headSha;

  if (isMergeRef) {
    return {
      isMergeRef: true,
      baseCommit: "HEAD^1",
      diffRangeArgs: ["HEAD^1", "HEAD"],
    };
  }

  const resolvedBase =
    revParse(baseRef, cwd) !== null
      ? baseRef
      : baseRef && revParse(`origin/${baseRef}`, cwd) !== null
        ? `origin/${baseRef}`
        : null;

  if (!resolvedBase) {
    throw new Error(`unable to resolve base ref "${String(baseRef)}"`);
  }

  return {
    isMergeRef: false,
    baseCommit: resolvedBase,
    diffRangeArgs: [`${resolvedBase}...HEAD`],
  };
}

function loadPolicyFromBase(baseCommit, cwd) {
  let existsOnBase = false;
  try {
    git(["cat-file", "-e", `${baseCommit}:.cz-protected-paths.json`], cwd);
    existsOnBase = true;
  } catch {
    existsOnBase = false;
  }

  let raw;
  let source;
  if (existsOnBase) {
    raw = git(["show", `${baseCommit}:.cz-protected-paths.json`], cwd);
    source = `${baseCommit}:.cz-protected-paths.json`;
  } else {
    raw = readFileSync(join(cwd, ".cz-protected-paths.json"), "utf8");
    source = "working-tree bootstrap .cz-protected-paths.json";
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`failed to parse ${source}: ${err.message}`);
  }

  const policyErrors = validatePolicy(parsed, EXPECTED_REPO);
  if (policyErrors.length > 0) {
    throw new Error(`invalid ${source}: ${policyErrors.join("; ")}`);
  }

  return { policy: parsed, source, existsOnBase };
}

function matchesAny(file, globs) {
  return globs.some((glob) => matchGlob(glob, file));
}

function validateMaintainerTrailers({ trailers, trailerErrors, labels, changedFiles, policy }) {
  const errors = [...trailerErrors];
  const effectiveProtected = [
    ...new Set([...policy.protected_globs, ...HARDCODED_PROTECTED_FLOOR]),
  ];

  const tierRaw = trailers["EOS-Tier"];
  if (tierRaw !== "0" && tierRaw !== "1" && tierRaw !== "2") {
    errors.push(`EOS-Tier must be 0, 1, or 2 (got ${JSON.stringify(tierRaw ?? "")})`);
  }

  const linearRaw = trailers["EOS-Linear"];
  if (!linearRaw) {
    errors.push("missing required EOS-Linear trailer");
  } else {
    const tokens = linearRaw.split(",").map((t) => t.trim());
    if (tokens.some((t) => !LINEAR_TOKEN_RE.test(t))) {
      errors.push(
        `EOS-Linear must be comma-separated CZ-<N> IDs (got ${JSON.stringify(linearRaw)})`,
      );
    }
  }

  if (Object.hasOwn(trailers, "EOS-Ratchet-ADR") && !ADR_RE.test(trailers["EOS-Ratchet-ADR"])) {
    errors.push(
      `EOS-Ratchet-ADR must match ADR-NNNN (got ${JSON.stringify(trailers["EOS-Ratchet-ADR"])})`,
    );
  }

  const override = trailers["EOS-Override"];
  if (override !== undefined && override !== "p0-hotfix") {
    errors.push(`EOS-Override must be "p0-hotfix" when set (got ${JSON.stringify(override)})`);
  }

  const protectedHits = changedFiles.filter((f) => matchesAny(f, effectiveProtected));
  const lockfileHits = changedFiles.filter((f) => matchesAny(f, policy.lockfiles));

  if (tierRaw === "0") {
    const plan = trailers["EOS-Plan"];
    const phase = trailers["EOS-Phase"];
    if (plan !== undefined && plan !== "" && plan !== "none") {
      errors.push('EOS-Tier: 0 must omit EOS-Plan or set it to "none"');
    }
    if (phase !== undefined && phase !== "" && phase !== "none") {
      errors.push('EOS-Tier: 0 must omit EOS-Phase or set it to "none"');
    }
    const hasP0Label = labels.has("p0-hotfix");
    if (override === "p0-hotfix" && !hasP0Label) {
      errors.push("EOS-Override: p0-hotfix requires the GitHub PR label p0-hotfix");
    }
    const isP0Hotfix = override === "p0-hotfix" && hasP0Label;
    if (!isP0Hotfix) {
      if (changedFiles.length > policy.tier0_max_files) {
        errors.push(
          `EOS-Tier: 0 allows at most ${policy.tier0_max_files} changed files (got ${changedFiles.length})`,
        );
      }
      if (lockfileHits.length > 0) {
        errors.push(
          `EOS-Tier: 0 cannot modify lockfiles without p0-hotfix: ${lockfileHits.join(", ")}`,
        );
      }
      if (protectedHits.length > 0) {
        errors.push(
          `EOS-Tier: 0 cannot modify protected paths without p0-hotfix: ${protectedHits.join(", ")}`,
        );
      }
    }
  } else if (tierRaw === "1") {
    if (override !== undefined) {
      errors.push("EOS-Override is forbidden on EOS-Tier: 1");
    }
    const plan = trailers["EOS-Plan"] ?? "";
    if (!PLAN_SLUG_RE.test(plan) || plan === "none") {
      errors.push(`EOS-Tier: 1 requires a valid EOS-Plan slug (got ${JSON.stringify(plan)})`);
    }
    const phase = trailers["EOS-Phase"];
    if (phase !== undefined && phase !== "" && !TIER1_PHASE_RE.test(phase)) {
      errors.push(
        `EOS-Tier: 1 EOS-Phase must be mini-rfc or a slug (got ${JSON.stringify(phase)})`,
      );
    }
    if (protectedHits.length > 0) {
      errors.push(`EOS-Tier: 1 cannot modify protected paths: ${protectedHits.join(", ")}`);
    }
  } else if (tierRaw === "2") {
    if (override !== undefined) {
      errors.push("EOS-Override is forbidden on EOS-Tier: 2");
    }
    const plan = trailers["EOS-Plan"] ?? "";
    if (!PLAN_SLUG_RE.test(plan) || plan === "none") {
      errors.push(`EOS-Tier: 2 requires a valid EOS-Plan slug (got ${JSON.stringify(plan)})`);
    }
    const phase = trailers["EOS-Phase"] ?? "";
    if (!TIER2_PHASE_RE.test(phase)) {
      errors.push(
        `EOS-Tier: 2 in sdk requires EOS-Phase matching ^[0-9]{2}[a-z]?$ (got ${JSON.stringify(phase)})`,
      );
    }
  }

  return errors;
}

/** Evaluates a pull request against EOS-C3 and EOS-C4 rules. */
export function evaluatePullRequest({
  event,
  cwd = process.cwd(),
  githubRef = process.env.GITHUB_REF ?? "",
  baseRef = event?.pull_request?.base?.ref ?? process.env.GITHUB_BASE_REF,
}) {
  const pr = event?.pull_request;
  if (!pr || typeof pr !== "object") {
    return { ok: false, errors: ["pull_request payload is missing from event JSON"] };
  }

  const errors = [];

  // Defense-in-depth Draft / Hold / WIP / DO NOT MERGE check.
  if (pr.draft === true) {
    errors.push("PR is marked as Draft");
  }
  const labels = new Set(
    (Array.isArray(pr.labels) ? pr.labels : [])
      .map((lbl) => (typeof lbl === "string" ? lbl : lbl?.name))
      .filter((name) => typeof name === "string")
      .map((name) => name.trim().toLowerCase()),
  );
  const hitBlockedLabels = [...labels].filter((lbl) => BLOCKED_LABELS.has(lbl)).sort();
  if (hitBlockedLabels.length > 0) {
    errors.push(`PR carries blocking label(s): ${hitBlockedLabels.join(", ")}`);
  }
  if (BLOCKED_TITLE_RE.test(String(pr.title ?? ""))) {
    errors.push("PR title carries HOLD/WIP/DO NOT MERGE marker");
  }

  let diffCtx;
  try {
    diffCtx = resolveDiffContext({
      baseRef,
      githubRef,
      headSha: pr.head?.sha,
      cwd,
    });
  } catch (err) {
    return { ok: false, errors: [...errors, err.message] };
  }

  let policy;
  try {
    ({ policy } = loadPolicyFromBase(diffCtx.baseCommit, cwd));
  } catch (err) {
    return { ok: false, errors: [...errors, err.message] };
  }

  const changedFiles = git(
    [
      "-c",
      "core.quotepath=false",
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      ...diffCtx.diffRangeArgs,
    ],
    cwd,
  )
    .split("\0")
    .filter(Boolean);

  // If the PR edits .cz-protected-paths.json itself, validate the PR's head policy too.
  if (changedFiles.includes(".cz-protected-paths.json")) {
    try {
      const headPolicyRaw = readFileSync(join(cwd, ".cz-protected-paths.json"), "utf8");
      const headPolicy = JSON.parse(headPolicyRaw);
      const headPolicyErrors = validatePolicy(headPolicy, EXPECTED_REPO);
      if (headPolicyErrors.length > 0) {
        errors.push(`invalid modified .cz-protected-paths.json: ${headPolicyErrors.join("; ")}`);
      }
    } catch (err) {
      errors.push(`failed to validate modified .cz-protected-paths.json: ${err.message}`);
    }
  }

  const strippedBody = stripMarkdownNoise(pr.body ?? "");
  const { trailers, errors: trailerErrors } = parseTrailers(strippedBody);

  errors.push(
    ...validateMaintainerTrailers({
      trailers,
      trailerErrors,
      labels,
      changedFiles,
      policy,
    }),
  );

  return {
    ok: errors.length === 0,
    changedFiles,
    errors,
  };
}

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--event-path" && i + 1 < argv.length) {
      opts.eventPath = argv[++i];
    } else if (arg === "--base" && i + 1 < argv.length) {
      opts.baseRef = argv[++i];
    } else if (arg === "--cwd" && i + 1 < argv.length) {
      opts.cwd = argv[++i];
    }
  }
  return opts;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const cli = parseCliArgs(process.argv.slice(2));
  const eventPath = cli.eventPath ?? process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";

  if (!eventPath) {
    if (eventName === "pull_request" || process.env.GITHUB_BASE_REF) {
      console.error("plan guard: GITHUB_EVENT_PATH is required for pull_request events");
      process.exit(1);
    }
    console.log("plan guard: not a pull request, skipped");
    process.exit(0);
  }

  let event;
  try {
    event = JSON.parse(readFileSync(eventPath, "utf8"));
  } catch (err) {
    console.error(`plan guard: failed to read event JSON: ${err.message}`);
    process.exit(1);
  }

  const result = evaluatePullRequest({
    event,
    cwd: cli.cwd ?? process.cwd(),
    baseRef: cli.baseRef ?? event?.pull_request?.base?.ref ?? process.env.GITHUB_BASE_REF,
    githubRef: process.env.GITHUB_REF ?? "",
  });

  if (!result.ok) {
    for (const err of result.errors) {
      console.error(`plan guard: ${err}`);
    }
    process.exit(1);
  }

  console.log(`plan guard: ok (${result.changedFiles.length} changed file(s))`);
}
