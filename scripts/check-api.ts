// Compares the built public declarations with the committed snapshot in packages/cradlezero/api.
// Run `pnpm api:update` after an intended API change and add a changeset.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pkg = new URL("../packages/cradlezero/", import.meta.url).pathname;
const dist = join(pkg, "dist");
const snapshotPath = join(pkg, "api", "cradlezero.d.ts.snapshot");

const files = readdirSync(dist)
  .filter((name) => name.endsWith(".d.ts"))
  .sort();
const current = files
  .map((name) => `// ${name}\n${readFileSync(join(dist, name), "utf8").trim()}\n`)
  .join("\n");

if (process.argv.includes("--update")) {
  mkdirSync(join(pkg, "api"), { recursive: true });
  writeFileSync(snapshotPath, current);
  console.log(`api: snapshot updated (${files.length} declaration files)`);
} else {
  const saved = readFileSync(snapshotPath, "utf8");
  if (saved !== current) {
    console.error("api: public declarations changed. Run `pnpm api:update` and add a changeset.");
    process.exit(1);
  }
  console.log(`api: matches snapshot (${files.length} declaration files)`);
}
