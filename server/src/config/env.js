// =============================================================
// env.js: loads server/.env (from any working directory) and checks the settings.
// Import this FIRST so the other modules can read process.env safely.
// =============================================================
import dotenv from 'dotenv';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));   // server/.env
if (!fs.existsSync(envFile)) {
  console.error('\nserver/.env not found.\nRun:  npm run setup   (creates it for you)  or copy server/.env.example to server/.env\n');
  process.exit(1);
}
dotenv.config({ path: envFile });

for (const k of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[k]) { console.error(`\nMissing ${k} in server/.env. Run: npm run setup\n`); process.exit(1); }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('\nJWT_SECRET in server/.env must be at least 32 characters. Run: npm run setup -- --new-secret\n');
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
