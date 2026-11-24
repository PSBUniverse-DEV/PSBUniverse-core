// module-package.mjs - Adds or removes npm packages for one module and records
// them in that module's module-packages.json.
//
// Usage:
//   npm run add-package -- <module> <package> [more packages] [--dev]
//   npm run remove-package -- <module> <package> [more packages]
// <module> is the folder under src/modules, e.g. project-map or admin/reports.
//
// Examples:
//   npm run add-package -- project-map maplibre-gl
//   npm run add-package -- time-tracker jspdf jspdf-autotable
//   npm run add-package -- project-map some-package@1.4.2
//   npm run remove-package -- time-tracker jspdf-autotable
//
// add:    a package already in package.json (no version given) is only recorded,
//         never re-installed or upgraded; anything else is installed with npm.
// remove: taken off the module's list; uninstalled only when core and no other
//         module still list it.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  MODULE_PACKAGES_FILE,
  PACKAGE_SECTIONS,
  fileEol,
  readJson,
  readModulePackages,
  sortObject,
  writeJson,
} from "./module-packages-lib.mjs";

const ROOT = process.cwd();
const ROOT_PACKAGE = path.join(ROOT, "package.json");
const [action, moduleArg, ...rest] = process.argv.slice(2);
const dev = rest.includes("--dev");
const specs = rest.filter((arg) => !arg.startsWith("--"));

// A package name with an optional plain version: name, @scope/name, name@1.2.3,
// name@latest. Nothing else is passed to npm (keeps the command shell-safe).
const SPEC = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[a-z0-9][a-z0-9.-]*)?$/i;

function fail(message) {
  console.error(`  ${message}`);
  process.exit(1);
}

function nameOf(spec) {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

function runNpm(args) {
  // npm is npm.cmd on Windows, which needs a shell; every argument was checked above.
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? "npm.cmd" : "npm", args, { stdio: "inherit", shell: isWindows });
  if (result.status !== 0) fail(`npm ${args.join(" ")} failed.`);
}

if (!["add", "remove"].includes(action) || !moduleArg || specs.length === 0) {
  fail(
    "Usage:\n" +
      "    npm run add-package -- <module> <package> [more packages] [--dev]\n" +
      "    npm run remove-package -- <module> <package> [more packages]\n" +
      "  Example: npm run add-package -- project-map maplibre-gl",
  );
}

const moduleRel = moduleArg.replace(/\\/g, "/").replace(/^src\/modules\//, "").replace(/^\/+|\/+$/g, "");
const moduleDir = path.join(ROOT, "src", "modules", ...moduleRel.split("/"));
if (!existsSync(path.join(moduleDir, "index.js"))) {
  fail(`No module at src/modules/${moduleRel} (a module folder has an index.js).`);
}
const badSpecs = specs.filter((spec) => !SPEC.test(spec));
if (badSpecs.length > 0) fail(`Not a package name: ${badSpecs.join(", ")}`);

const moduleFile = path.join(moduleDir, MODULE_PACKAGES_FILE);
const moduleData = existsSync(moduleFile) ? readJson(moduleFile) : {};
const eol = fileEol(ROOT_PACKAGE);
const shownFile = `src/modules/${moduleRel}/${MODULE_PACKAGES_FILE}`;

function saveModuleFile() {
  for (const section of PACKAGE_SECTIONS) moduleData[section] = sortObject(moduleData[section]);
  writeJson(moduleFile, moduleData, eol);
}

if (action === "add") {
  const section = dev ? "devDependencies" : "dependencies";
  const before = readJson(ROOT_PACKAGE);
  const installed = (name) => PACKAGE_SECTIONS.some((s) => before[s] && name in before[s]);
  // Already installed and no version asked for: record it, never upgrade it.
  const toInstall = specs.filter((spec) => spec.includes("@", 1) || !installed(nameOf(spec)));
  if (toInstall.length > 0) runNpm(["install", ...toInstall, ...(dev ? ["--save-dev"] : [])]);

  const after = readJson(ROOT_PACKAGE);
  const list = { ...(moduleData[section] || {}) };
  for (const spec of specs) {
    const name = nameOf(spec);
    const foundIn = PACKAGE_SECTIONS.find((s) => after[s] && name in after[s]);
    if (!foundIn) fail(`${name} is not in package.json after installing - nothing was recorded.`);
    list[name] = after[foundIn][name];
  }
  moduleData[section] = list;
  saveModuleFile();
  console.log(`  Recorded in ${shownFile}:`);
  for (const spec of specs) console.log(`    + ${nameOf(spec)}@${list[nameOf(spec)]} (${section})`);
  process.exit(0);
}

// remove
const names = specs.map(nameOf);
for (const section of PACKAGE_SECTIONS) {
  if (!moduleData[section]) continue;
  for (const name of names) delete moduleData[section][name];
}
saveModuleFile();
console.log(`  Taken off ${shownFile}: ${names.join(", ")}`);

let coreLists = null;
try {
  coreLists = JSON.parse(
    execFileSync("git", ["show", "core/main:package.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
} catch {
  coreLists = null;
}
if (!coreLists) {
  console.log("  Core's package list could not be read (no core remote), so nothing was uninstalled.");
  console.log("  If nothing else uses these packages, run: npm uninstall " + names.join(" "));
  process.exit(0);
}

const otherModules = readModulePackages(ROOT).filter((entry) => entry.module !== moduleRel);
const listedBy = (name) => {
  if (PACKAGE_SECTIONS.some((s) => coreLists[s] && name in coreLists[s])) return "core";
  const owner = otherModules.find((entry) => PACKAGE_SECTIONS.some((s) => name in (entry[s] || {})));
  return owner ? `module ${owner.module}` : null;
};
const toUninstall = [];
for (const name of names) {
  const owner = listedBy(name);
  if (owner) console.log(`  Kept installed: ${name} (still listed by ${owner})`);
  else toUninstall.push(name);
}
if (toUninstall.length > 0) runNpm(["uninstall", ...toUninstall]);
process.exit(0);