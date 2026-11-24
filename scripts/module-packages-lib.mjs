// module-packages-lib.mjs - Shared helpers for module-packages.json files.
//
// Core is the shell; each module is its own app and lists the npm packages it
// needs beyond core's in src/modules/<module>/module-packages.json:
//   { "dependencies": { "maplibre-gl": "^5.24.0" }, "devDependencies": {} }
// The project's package.json still holds everything that is installed; these
// files record which module needs which package.
// (Not named package.json: that would change how Node loads the module's files.)

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const MODULE_PACKAGES_FILE = "module-packages.json";
export const PACKAGE_SECTIONS = ["dependencies", "devDependencies"];

/** Reads a JSON file (BOM allowed); throws a clear error when it is not valid JSON. */
export function readJson(file) {
  const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path.relative(process.cwd(), file)} is not valid JSON: ${error.message}`);
  }
}

/** The line ending a file uses ("\r\n" or "\n"); "\n" when the file is missing. */
export function fileEol(file) {
  if (!existsSync(file)) return "\n";
  return readFileSync(file, "utf8").includes("\r\n") ? "\r\n" : "\n";
}

/** Writes JSON with 2-space indent and the given line ending. */
export function writeJson(file, data, eol = "\n") {
  writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n/g, eol) + eol);
}

/** A copy of an object with its keys in alphabetical order. */
export function sortObject(object) {
  return Object.fromEntries(Object.entries(object || {}).sort(([a], [b]) => a.localeCompare(b, "en")));
}

/**
 * Every module-packages.json under src/modules, as
 * { module: "project-map" | "admin/reports", file, dependencies, devDependencies }.
 */
export function readModulePackages(root) {
  const modulesDir = path.join(root, "src", "modules");
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const folder = path.join(dir, entry.name);
      const file = path.join(folder, MODULE_PACKAGES_FILE);
      if (existsSync(file)) {
        const data = readJson(file);
        found.push({
          module: path.relative(modulesDir, folder).replace(/\\/g, "/"),
          file,
          dependencies: data.dependencies || {},
          devDependencies: data.devDependencies || {},
        });
      }
      walk(folder);
    }
  };
  walk(modulesDir);
  return found.sort((a, b) => a.module.localeCompare(b.module, "en"));
}