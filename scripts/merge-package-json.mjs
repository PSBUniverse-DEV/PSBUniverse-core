// merge-package-json.mjs - Combines both sides of a package.json merge conflict
// as data, so Git never has to merge it as text.
// Usage: node scripts/merge-package-json.mjs   (run from the project root, during a merge)
//
// Reads "ours" (:2:package.json) and "theirs" (:3:package.json) from the merge.
// Every package from either side is kept; when both sides list a package with
// different versions, the higher minimum version wins (ours when unclear).
// Everything else (name, version, ...) is ours; scripts only theirs has are added.
// Writes package.json and stages it. package-lock.json is not touched here:
// sync-repo.ps1 rebuilds it with npm install.
//
// Exit codes: 0 = done, 1 = error (resolve package.json by hand).

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

function readStage(stage) {
  try {
    return execFileSync("git", ["show", `:${stage}:package.json`], { encoding: "utf8" }).replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

// "^1.2.3", "~1.2", ">=1.0.0", "1.2.3" -> [1, 2, 3]; null for anything else (tags, URLs, ...).
function minimumVersion(range) {
  const match = /^[\^~>=v\s]*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(range).trim());
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null;
}

function higher(ours, theirs) {
  const a = minimumVersion(ours);
  const b = minimumVersion(theirs);
  if (!a || !b) return ours;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? ours : theirs;
  }
  return ours;
}

const oursRaw = readStage(2);
const theirsRaw = readStage(3);
if (!oursRaw || !theirsRaw) {
  console.error("  package.json: one side of the merge is missing - resolve it by hand.");
  process.exit(1);
}

let ours;
let theirs;
try {
  ours = JSON.parse(oursRaw);
  theirs = JSON.parse(theirsRaw);
} catch (error) {
  console.error(`  package.json is not valid JSON on one side - resolve it by hand. ${error.message}`);
  process.exit(1);
}

const eol = oursRaw.includes("\r\n") ? "\r\n" : "\n";
const merged = { ...ours };
const notes = [];

for (const section of SECTIONS) {
  if (!ours[section] && !theirs[section]) continue;
  const combined = { ...(ours[section] || {}) };
  for (const [name, range] of Object.entries(theirs[section] || {})) {
    if (!(name in combined)) {
      combined[name] = range;
      notes.push(`+ ${name}@${range} (${section})`);
    } else if (combined[name] !== range) {
      const pick = higher(combined[name], range);
      if (pick !== combined[name]) notes.push(`~ ${name}: ${combined[name]} -> ${pick}`);
      combined[name] = pick;
    }
  }
  merged[section] = Object.fromEntries(
    Object.entries(combined).sort(([a], [b]) => a.localeCompare(b, "en")),
  );
}

if (ours.scripts || theirs.scripts) {
  const scripts = { ...(ours.scripts || {}) };
  for (const [name, command] of Object.entries(theirs.scripts || {})) {
    if (!(name in scripts)) scripts[name] = command;
  }
  merged.scripts = scripts;
}

writeFileSync("package.json", JSON.stringify(merged, null, 2).replace(/\n/g, eol) + eol);
execFileSync("git", ["add", "--", "package.json"]);
console.log(`  package.json combined from both sides${notes.length ? ":" : "."}`);
for (const note of notes) console.log(`    ${note}`);
process.exit(0);