# StreakCircle

A habit tracker with daily progress, streaks, statistics, circles (groups), challenges, real-time updates and **Tick**, an optional AI habit coach.

## Quick start (Windows, macOS, Linux)

You need **Node.js 20.19+ or 22.12+** and a **MongoDB** database.

```bash
# 1. Start MongoDB (pick one)
docker compose up -d mongo          # easiest, needs Docker
#    or install MongoDB 7 locally, or use a free MongoDB Atlas URL (see "MongoDB" below)

# 2. Install everything and create server/.env (random JWT secret included)
npm run setup

# 3. Run frontend + backend together
npm run dev
```

Open **http://localhost:5173**. Backend health check: http://localhost:5000/api/health

`npm run dev` first runs a pre-flight check (`npm run doctor`) and tells you in plain words if Node, packages, `.env` or MongoDB are the problem.

> **Never copy `node_modules` between computers or zip it.** It contains platform-specific binaries. Always run `npm run setup` after unzipping.

## Project structure

```text
streakcircle/
├── package.json            root scripts (setup, dev, build, test, doctor)
├── docker-compose.yml      MongoDB 7
├── scripts/
│   ├── setup.mjs           creates server/.env with a random JWT_SECRET
│   └── doctor.mjs          pre-flight checks before `npm run dev`
├── server/                 Express API + Socket.IO
│   ├── .env.example        copy of the settings (real .env is never committed)
│   └── src/
│       ├── index.js        entry point: env -> MongoDB -> start server
│       ├── app.js          Express app: security headers, CORS, /api, serves client/dist
│       ├── config/         env.js (load + validate .env), db.js (MongoDB connection)
│       ├── routes/         one file per feature, assembled in index.js
│       │   ├── auth.js  profile.js  notifications.js  habits.js
│       │   └── stats.js  circles.js  challenges.js  ai.js  (+ helpers.js)
│       ├── services/       business logic shared by routes (habits.js, circles.js)
│       ├── models/         MongoDB schemas
│       ├── lib/            pure, unit-tested date/streak maths, errors.js, weekdays.js
│       ├── ai/             Tick chat (coach.js), tool definitions, Groq client (+ tests)
│       └── realtime/       Socket.IO server (socket.js) and emit helpers (emit.js)
└── client/                 Vite front end (no framework)
    ├── index.html
    └── src/
        ├── main.js         loads styles + app
        ├── app.js          screens, state, click handling
        ├── api.js          fetch wrapper that adds the login token
        ├── constants.js    option lists (categories, units, icons)
        ├── tick.js         Tick 3D character, chat panel, landing hero
        └── styles/         7 CSS files, imported in order (order = cascade, keep it)
```

## Commands (run from the project root)

| Task | Command |
|---|---|
| Install everything + create `server/.env` | `npm run setup` |
| Check your setup | `npm run doctor` |
| Run frontend + backend (development) | `npm run dev` |
| Build the frontend | `npm run build` |
| Run in production (serves the built frontend too) | `npm start` |
| Run server tests | `npm test` |
| Make a new JWT secret | `node scripts/setup.mjs --new-secret` |
| Start / stop MongoDB (Docker) | `docker compose up -d mongo` / `docker compose down` |

`docker compose down -v` also **deletes** the database.

## MongoDB

Pick one and make sure `MONGO_URI` in `server/.env` matches:

1. **Docker** (default URI works): `docker compose up -d mongo`
2. **Local install**: install MongoDB 7 Community and start the service on port 27017.
3. **MongoDB Atlas (free, no install)**: create a free cluster, add your IP to the allow-list, create a database user, and paste the connection string into `MONGO_URI`, e.g. `mongodb+srv://user:password@cluster.mongodb.net/streakcircle`.

## Settings (`server/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Backend port (default 5000) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs login tokens, at least 32 characters (`npm run setup` makes one) |
| `CLIENT_ORIGIN` | Allowed front-end address (default `http://localhost:5173`) |
| `GROQ_API_KEY` | Optional. Enables the full Tick AI. Get a key at https://console.groq.com/ |
| `GROQ_MODEL` | AI model (default `openai/gpt-oss-20b`) |

Without `GROQ_API_KEY` everything works; Tick uses built-in answers. Never share or commit `server/.env`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "MongoDB is not reachable" | Start it (see MongoDB above), then run `npm run dev` again |
| "Packages are missing" or Vite/rolldown binding errors | Delete every `node_modules` folder and run `npm run setup` |
| "Node ... is too old" | Install Node 20.19+ or 22.12+ |
| Port 5000 / 5173 / 27017 already in use | Stop the other program, or change `PORT` and keep `CLIENT_ORIGIN` in sync |
| "JWT_SECRET must be at least 32 characters" | `node scripts/setup.mjs --new-secret` |

## Features

Habits (daily/weekly, measurable targets, reminders), streaks and freezes, per-habit calendar, circles with invite codes, activity feed, chat, nudges, sprint leaderboard and challenges, recovery tools for missed days, insights charts, Tick AI chat with actions, dark/light theme.

## Tech stack

Vite, Express, MongoDB + Mongoose, Socket.IO, JWT + bcrypt, Three.js (Tick), optional Groq AI.
