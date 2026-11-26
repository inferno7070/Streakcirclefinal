// =============================================================
// index.js: server entry point (npm run dev / npm start).
// Order: load + check .env -> connect MongoDB -> start HTTP + Socket.IO.
// =============================================================
import { config } from './config/env.js';          // must stay first: loads server/.env
import http from 'node:http';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { attachSocketServer } from './realtime/socket.js';

const app = createApp(config.clientOrigin);
const server = http.createServer(app);
attachSocketServer(server, config.clientOrigin);

await connectDb(config.mongoUri);
server.listen(config.port, () => console.log(`StreakCircle API on http://localhost:${config.port}`));
