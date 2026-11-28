import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluatePullRequest,
  matchGlob,
  stripMarkdownNoise,
  validatePolicy,
} from "./plan-guard.mjs";

const PLAN_GUARD_SCRIPT = fileURLToPath(new URL("./plan-guard.mjs", import.meta.url));

const BASE_POLICY = {
  schema_version: 1,
  repo: "sdk",
  tier0_max_files: 3,
  lockfiles: ["pnpm-lock.yaml", "package.json"],
  protected_globs: [
    "packages/cradlezero/**",
    "scripts/check-api.ts",
    "scripts/plan-guard.mjs",
    ".cz-protected-paths.json",
    ".gitleaks.toml",
    ".github/CODEOWNERS",
    ".github/workflows/**",
    "mise.toml",
    "package.json",
  ],
  owner_merge_always_globs: ["**"],
};

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "CradleZero",
      GIT_AUTHOR_EMAIL: "dev@cradlezero.com",
      GIT_COMMITTER_NAME: "CradleZero",
      GIT_COMMITTER_EMAIL: "dev@cradlezero.com",
    },
  });
}

function writeRel(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function createSdkRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), "cz-sdk-guard-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  runGit(repo, ["init", "-b", "main"]);
  writeRel(repo, ".cz-protected-paths.json", `${JSON.stringify(BASE_POLICY, null, 2)}\n`);
  writeRel(repo, "packages/cradlezero/src/index.ts", "export const VERSION = 1;\n");
  writeRel(repo, "site/index.html", "<!doctype html><html></html>\n");
  writeRel(repo, "README.md", "# SDK\n");
  writeRel(repo, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "init"]);
  runGit(repo, ["checkout", "-b", "pr-branch"]);
  return repo;
}

function makeEvent({ title = "Update docs", body = "", draft = false, labels = [], headSha }) {
  return {
    pull_request: {
      title,
      body,
      draft,
      labels: labels.map((name) => ({ name })),
      base: { ref: "main" },
      head: { sha: headSha },
    },
  };
}

test("valid Tier 0, Tier 1, and Tier 2 PRs pass", (t) => {
  const repo = createSdkRepo(t);
  writeRel(repo, "README.md", "# SDK updated\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Update README"]);

  const t0 = evaluatePullRequest({
    event: makeEvent({ body: "EOS-Tier: 0\nEOS-Linear: CZ-62\n" }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(t0.ok, true, t0.errors.join("\n"));

  const t1 = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 1\nEOS-Linear: CZ-62\nEOS-Plan: docs-refresh\nEOS-Phase: mini-rfc\n",
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(t1.ok, true, t1.errors.join("\n"));

  const t2 = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 2\nEOS-Linear: CZ-62\nEOS-Plan: engineering-operating-system\nEOS-Phase: 04c\n",
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(t2.ok, true, t2.errors.join("\n"));
});

test("Tier 0 touching packages/cradlezero/** without p0-hotfix fails, passes with p0-hotfix", (t) => {
  const repo = createSdkRepo(t);
  writeRel(repo, "packages/cradlezero/src/index.ts", "export const VERSION = 2;\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Touch package"]);

  const blocked = evaluatePullRequest({
    event: makeEvent({ body: "EOS-Tier: 0\nEOS-Linear: CZ-62\n" }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.some((e) => e.includes("protected paths")));

  const missingLabel = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 0\nEOS-Linear: CZ-62\nEOS-Override: p0-hotfix\n",
      labels: [],
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(missingLabel.ok, false);
  assert.ok(missingLabel.errors.some((e) => e.includes("label p0-hotfix")));

  const allowed = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 0\nEOS-Linear: CZ-62\nEOS-Override: p0-hotfix\n",
      labels: ["p0-hotfix"],
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(allowed.ok, true, allowed.errors.join("\n"));
});

test("git mv packages/cradlezero/src/index.ts site/moved.ts fails via --no-renames", (t) => {
  const repo = createSdkRepo(t);
  runGit(repo, ["mv", "packages/cradlezero/src/index.ts", "site/moved.ts"]);
  runGit(repo, ["commit", "-m", "Rename protected file into site"]);

  const res = evaluatePullRequest({
    event: makeEvent({ body: "EOS-Tier: 1\nEOS-Linear: CZ-62\nEOS-Plan: docs-refresh\n" }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(res.ok, false);
  assert.ok(res.changedFiles.includes("packages/cradlezero/src/index.ts"));
  assert.ok(res.errors.some((e) => e.includes("packages/cradlezero/src/index.ts")));
});

test("PR self-tampering .cz-protected-paths.json fails against base commit policy", (t) => {
  const repo = createSdkRepo(t);
  const weakened = { ...BASE_POLICY, protected_globs: [] };
  writeRel(repo, ".cz-protected-paths.json", `${JSON.stringify(weakened, null, 2)}\n`);
  writeRel(repo, "packages/cradlezero/src/index.ts", "export const VERSION = 3;\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Weaken policy and edit package"]);

  const tier0Res = evaluatePullRequest({
    event: makeEvent({ body: "EOS-Tier: 0\nEOS-Linear: CZ-62\n" }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(tier0Res.ok, false);
  assert.ok(tier0Res.errors.some((e) => e.includes(".cz-protected-paths.json")));
  assert.ok(tier0Res.errors.some((e) => e.includes("packages/cradlezero/src/index.ts")));

  const braced = { ...BASE_POLICY, protected_globs: ["{packages,scripts}/**"] };
  writeRel(repo, ".cz-protected-paths.json", `${JSON.stringify(braced, null, 2)}\n`);
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Add brace glob"]);

  const tier2Res = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 2\nEOS-Linear: CZ-62\nEOS-Plan: engineering-operating-system\nEOS-Phase: 04c\n",
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(tier2Res.ok, false);
  assert.ok(tier2Res.errors.some((e) => e.includes("forbidden braces")));
});

test("Draft, hold/do-not-merge/wip labels, and WIP/DO NOT MERGE titles fail", (t) => {
  const repo = createSdkRepo(t);
  writeRel(repo, "README.md", "# SDK edit\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Edit README"]);
  const validBody = "EOS-Tier: 0\nEOS-Linear: CZ-62\n";

  const draftRes = evaluatePullRequest({
    event: makeEvent({ body: validBody, draft: true }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(draftRes.ok, false);
  assert.ok(draftRes.errors.some((e) => e.includes("Draft")));

  for (const label of ["hold", "DO-NOT-MERGE", "wip"]) {
    const labelRes = evaluatePullRequest({
      event: makeEvent({ body: validBody, labels: [label] }),
      cwd: repo,
      baseRef: "main",
      githubRef: "",
    });
    assert.equal(labelRes.ok, false);
    assert.ok(labelRes.errors.some((e) => e.includes("blocking label")));
  }

  for (const title of ["[WIP] docs", "HOLD: wait", "Update docs (DO NOT MERGE)"]) {
    const titleRes = evaluatePullRequest({
      event: makeEvent({ title, body: validBody }),
      cwd: repo,
      baseRef: "main",
      githubRef: "",
    });
    assert.equal(titleRes.ok, false);
    assert.ok(titleRes.errors.some((e) => e.includes("HOLD/WIP/DO NOT MERGE")));
  }
});

test("PR title containing $(id) or shell commands executes zero shell commands", (t) => {
  const repo = createSdkRepo(t);
  const sentinel = join(repo, "shell-executed");
  writeRel(repo, "README.md", "# Safe title\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Safe title test"]);

  const eventFile = join(repo, "event.json");
  const headSha = runGit(repo, ["rev-parse", "HEAD"]).trim();
  writeFileSync(
    eventFile,
    JSON.stringify(
      makeEvent({
        title: `Docs $(id) $(touch "${sentinel}") \`touch "${sentinel}"\``,
        body: "EOS-Tier: 0\nEOS-Linear: CZ-62\n",
        headSha,
      }),
    ),
  );

  execFileSync(
    process.execPath,
    [PLAN_GUARD_SCRIPT, "--event-path", eventFile, "--base", "main", "--cwd", repo],
    { encoding: "utf8" },
  );
  assert.equal(existsSync(sentinel), false);
});

test("Tier 0 file cap, lockfile cap, invalid Tier 2 phase, and merge-ref diff", (t) => {
  const repo = createSdkRepo(t);
  writeRel(repo, "site/a.txt", "a\n");
  writeRel(repo, "site/b.txt", "b\n");
  writeRel(repo, "site/c.txt", "c\n");
  writeRel(repo, "site/d.txt", "d\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Four files"]);

  const capRes = evaluatePullRequest({
    event: makeEvent({ body: "EOS-Tier: 0\nEOS-Linear: CZ-62\n" }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(capRes.ok, false);
  assert.ok(capRes.errors.some((e) => e.includes("at most 3")));

  const badPhase = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 2\nEOS-Linear: CZ-62\nEOS-Plan: engineering-operating-system\nEOS-Phase: ops-sync\n",
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "",
  });
  assert.equal(badPhase.ok, false);
  assert.ok(badPhase.errors.some((e) => e.includes("EOS-Phase")));

  // Synthetic merge commit check.
  const prHeadSha = runGit(repo, ["rev-parse", "HEAD"]).trim();
  runGit(repo, ["checkout", "main"]);
  writeRel(repo, "packages/cradlezero/src/index.ts", "export const VERSION = 99;\n");
  runGit(repo, ["add", "."]);
  runGit(repo, ["commit", "-m", "Main advances on protected path"]);
  runGit(repo, ["checkout", "-b", "pr-merge"]);
  runGit(repo, ["merge", "--no-ff", "pr-branch", "-m", "Merge PR"]);

  const mergeRes = evaluatePullRequest({
    event: makeEvent({
      body: "EOS-Tier: 1\nEOS-Linear: CZ-62\nEOS-Plan: docs-refresh\n",
      headSha: prHeadSha,
    }),
    cwd: repo,
    baseRef: "main",
    githubRef: "refs/pull/9/merge",
  });
  assert.equal(mergeRes.ok, true, mergeRes.errors.join("\n"));
  assert.deepEqual(mergeRes.changedFiles.sort(), [
    "site/a.txt",
    "site/b.txt",
    "site/c.txt",
    "site/d.txt",
  ]);
});

test("utility checks: glob braces rejected and markdown comments/fences stripped", () => {
  assert.throws(() => matchGlob("{a,b}/**", "a/c"), /braces/);
  assert.ok(validatePolicy({ ...BASE_POLICY, protected_globs: ["{a,b}"] }).length > 0);
  const stripped = stripMarkdownNoise(
    "<!-- EOS-Tier: 0 -->\n```yaml\nEOS-Tier: 1\n```\nEOS-Tier: 2\n",
  );
  assert.equal(stripped.trim(), "EOS-Tier: 2");
});
