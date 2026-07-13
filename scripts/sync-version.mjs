/**
 * Sync product version across package.json, tauri.conf.json, Cargo.toml.
 * Usage: node scripts/sync-version.mjs 0.2.1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ver = process.argv[2];
if (!ver || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(ver)) {
  console.error("Usage: node scripts/sync-version.mjs <semver>");
  console.error("Example: node scripts/sync-version.mjs 0.2.1");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// package.json
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = ver;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// tauri.conf.json
const tauriPath = join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
tauri.version = ver;
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

// Cargo.toml
const cargoPath = join(root, "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${ver}"`);
writeFileSync(cargoPath, cargo);

console.log(`[version] synced to ${ver}`);
console.log("  - package.json");
console.log("  - src-tauri/tauri.conf.json");
console.log("  - src-tauri/Cargo.toml");
console.log("Next: update CHANGELOG.md, then git tag v" + ver);
