// =============================================================
// setup.mjs: creates server/.env from server/.env.example with a random JWT_SECRET.
// Works on Windows, macOS and Linux.   node scripts/setup.mjs [--new-secret]
// =============================================================
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../server/", import.meta.url));
const envFile = dir + ".env", example = dir + ".env.example";
const secret = () => crypto.randomBytes(32).toString("hex");

if (!fs.existsSync(envFile)) {
  fs.writeFileSync(envFile, fs.readFileSync(example, "utf8").replace(/^JWT_SECRET=.*$/m, "JWT_SECRET=" + secret()));
  console.log("Created server/.env with a new random JWT_SECRET.");
} else if (process.argv.includes("--new-secret")) {
  fs.writeFileSync(envFile, fs.readFileSync(envFile, "utf8").replace(/^JWT_SECRET=.*$/m, "JWT_SECRET=" + secret()));
  console.log("Replaced JWT_SECRET in server/.env (everyone will need to sign in again).");
} else {
  console.log("server/.env already exists, leaving it as it is.");
}
