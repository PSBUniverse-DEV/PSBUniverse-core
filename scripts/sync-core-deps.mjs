// sync-core-deps.mjs - Adds npm dependencies that core's package.json, or any
// module's module-packages.json (src/modules/**), lists and this repo's
// package.json is missing. Also prints installed packages that neither core nor
// any module lists, so each can be given an owner (npm run add-package).
// Also adds npm scripts core has and this repo's package.json lacks (for
// example add-package); a script this repo already has is never changed.
// Usage: node scripts/sync-core-deps.mjs   (run from the project root)
//
// Reads core's list from the fetched core remote (core/main:package.json).
// Add-only: never changes a version this repo already declares and never
// removes a package, so app-specific dependencies are left alone.
//
// Exit codes: 0 = nothing to add, 10 = package.json updated (run npm install),
//             1 = error.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { readModulePackages } from "./module-packages-lib.mjs";

const PACKAGE_PATH = "package.json";
const SECTIONS = ["dependencies", "devDependencies"];

let corePackage;
try {
  corePackage = JSON.parse(
    execFileSync("git", ["show", "core/main:package.json"], { encoding: "utf8" }),
  );
} catch (error) {
  console.error("  Could not read core/main:package.json - is the core remote fetched?");
  console.error(`  ${error.message}`);
  process.exit(1);
}

const raw = readFileSync(PACKAGE_PATH, "utf8").replace(/^\uFEFF/, "");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const localPackage = JSON.parse(raw);

const declared = new Set(SECTIONS.flatMap((section) => Object.keys(localPackage[section] || {})));
const added = [];

let modulePackages;
try {
  modulePackages = readModulePackages(process.cwd());
} catch (error) {
  console.error(`  ${error.message}`);
  process.exit(1);
}

// What is required: core's packages, then each module's own packages.
const sources = [
  { label: "core", lists: corePackage },
  ...modulePackages.map((entry) => ({ label: `module ${entry.module}`, lists: entry })),
];

for (const source of sources) {
  for (const section of SECTIONS) {
    for (const [name, range] of Object.entries(source.lists[section] || {})) {
      if (declared.has(name)) continue;
      declared.add(name);
      localPackage[section] = { ...(localPackage[section] || {}), [name]: range };
      added.push(`${name}@${range} (${section}, needed by ${source.label})`);
    }
  }
}

for (const section of SECTIONS) {
  if (localPackage[section]) {
    localPackage[section] = Object.fromEntries(
      Object.entries(localPackage[section]).sort(([a], [b]) => a.localeCompare(b, "en")),
    );
  }
}

// npm scripts core has and this repo lacks (e.g. add-package / remove-package).
// Add-only: a script this repo already has keeps its own command.
for (const [name, command] of Object.entries(corePackage.scripts || {})) {
  if (localPackage.scripts && Object.prototype.hasOwnProperty.call(localPackage.scripts, name)) continue;
  localPackage.scripts = { ...(localPackage.scripts || {}), [name]: command };
  added.push(`npm script "${name}"`);
}

// Installed packages that neither core nor any module lists: shown so each one
// can be given an owner. Nothing is removed.
const listed = new Set(sources.flatMap((source) => SECTIONS.flatMap((section) => Object.keys(source.lists[section] || {}))));
const unlisted = [...declared].filter((name) => !listed.has(name)).sort();
if (unlisted.length > 0) {
  console.log("  Installed but not listed by core or any module (record with: npm run add-package -- <module> <package>):");
  for (const name of unlisted) console.log(`    ? ${name}`);
}

if (added.length === 0) {
  console.log("  Core and module dependencies OK.");
  process.exit(0);
}

writeFileSync(PACKAGE_PATH, JSON.stringify(localPackage, null, 2).replace(/\n/g, eol) + eol);
console.log("  Added from core or a module (packages and npm scripts):");
for (const entry of added) console.log(`    + ${entry}`);
process.exit(10);
