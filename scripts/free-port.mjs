/**
 * Free a TCP port on Windows (and best-effort elsewhere) before vite starts.
 * Usage: node scripts/free-port.mjs 1420
 */
import { execSync } from "node:child_process";

const port = Number(process.argv[2] || 1420);
if (!Number.isFinite(port)) {
  console.error("Invalid port");
  process.exit(1);
}

function pidsOnPortWindows(p) {
  try {
    const out = execSync(`netstat -ano | findstr ":${p}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

const pids = pidsOnPortWindows(port);
if (pids.length === 0) {
  console.log(`[free-port] nothing listening on ${port}`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    console.log(`[free-port] killing pid ${pid} on port ${port}`);
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
  } catch {
    console.warn(`[free-port] failed to kill ${pid}`);
  }
}

process.exit(0);
