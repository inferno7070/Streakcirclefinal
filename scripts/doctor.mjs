// =============================================================
// doctor.mjs: pre-flight check run before `npm run dev`. Explains problems in plain words.
// Checks: Node version, installed packages, server/.env, MongoDB reachable.
// =============================================================
import fs from "node:fs";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];

// 1) Node version (Vite 8 needs 20.19+ or 22.12+)
const [maj, min] = process.versions.node.split(".").map(Number);
if (!((maj === 20 && min >= 19) || (maj === 22 && min >= 12) || maj > 22))
  problems.push(`Node ${process.versions.node} is too old. Install Node 20.19+ or 22.12+ from https://nodejs.org`);

// 2) Packages installed (a zip copied from another computer must be reinstalled)
for (const d of ["node_modules", "server/node_modules", "client/node_modules"])
  if (!fs.existsSync(root + d)) { problems.push("Packages are missing. Run:  npm run install:all"); break; }

// 3) server/.env (created automatically if missing)
if (!fs.existsSync(root + "server/.env")) spawnSync(process.execPath, [root + "scripts/setup.mjs"], { stdio: "inherit" });

// 4) MongoDB reachable
const env = fs.existsSync(root + "server/.env") ? fs.readFileSync(root + "server/.env", "utf8") : "";
const uri = (env.match(/^MONGO_URI=(.*)$/m) || [, ""])[1].trim().replace(/^["\x27]|["\x27]$/g, "");
let mongoOk = true;
if (/^mongodb:\/\//.test(uri)) {
  const host = uri.replace(/^mongodb:\/\/(?:[^@/]*@)?/, "").split(/[/?]/)[0].split(",")[0];
  const [h, p] = host.split(":");
  mongoOk = await new Promise((ok) => {
    const s = net.connect({ host: h, port: Number(p) || 27017, timeout: 2500 });
    s.on("connect", () => { s.destroy(); ok(true); });
    s.on("error", () => ok(false)); s.on("timeout", () => { s.destroy(); ok(false); });
  });
  if (!mongoOk) problems.push(`MongoDB is not reachable at ${host}. Start it with ONE of:
     - Docker:  docker compose up -d mongo
     - a local MongoDB 7 install (port 27017)
     - a free MongoDB Atlas URL pasted into MONGO_URI in server/.env`);
} else if (!uri) problems.push("MONGO_URI is empty in server/.env");

if (problems.length) {
  console.error("\nStreakCircle cannot start yet:\n");
  problems.forEach((p, i) => console.error(` ${i + 1}. ${p}\n`));
  process.exit(1);
}
console.log("All checks passed.");
