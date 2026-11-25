// Checks the cradlezero.dev site: dictionary.json shape and that local links resolve.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const site = new URL("../site/", import.meta.url).pathname;
const problems: string[] = [];

const dictionary: unknown = JSON.parse(readFileSync(join(site, "dictionary.json"), "utf8"));
const terms = (dictionary as { terms?: unknown }).terms;
if (!Array.isArray(terms) || terms.length === 0) {
  problems.push("dictionary.json: terms must be a non-empty array");
} else {
  for (const term of terms as Record<string, unknown>[]) {
    if (typeof term.slug !== "string" || !/^[a-z]+$/.test(term.slug)) {
      problems.push(`dictionary.json: bad slug ${JSON.stringify(term.slug)}`);
    }
    if (term.surface_scope !== "universal" && term.surface_scope !== "substrate") {
      problems.push(`dictionary.json: ${String(term.slug)} is not a public term`);
    }
  }
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

for (const file of walk(site).filter((path) => /\.(html|txt)$/.test(path))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/(?:href|src)="([^"#:]+)"|\]\(([^)#:]+)\)/g)) {
    const target = match[1] ?? match[2];
    if (target === undefined || target.startsWith("/")) continue;
    if (!existsSync(join(dirname(file), target))) {
      problems.push(`${file.slice(site.length)}: broken link ${target}`);
    }
  }
}

for (const problem of problems) console.error(problem);
console.log(`site: ${problems.length} problem(s)`);
if (problems.length > 0) process.exit(1);
