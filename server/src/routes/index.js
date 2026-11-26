// =============================================================
// index.js: builds the /api router. ORDER MATTERS: public auth routes first, then the login check, then everything else
// =============================================================
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { todayForTimezone } from '../lib/streaks.js';
import { fail } from '../lib/errors.js';
import auth from './auth.js';
import profile from './profile.js';
import notifications from './notifications.js';
import habits from './habits.js';
import stats from './stats.js';
import circles from './circles.js';
import challenges from './challenges.js';
import ai from './ai.js';

const r = Router();

// Every request gets req.today in the user's timezone (X-Timezone header)
r.use((req, res, next) => {
  try { req.today = todayForTimezone(req.get('x-timezone') || 'UTC'); next(); }
  catch { res.status(400).json({ error: 'Invalid timezone' }); }
});

// 1) Public routes: sign up / sign in
r.use(auth);

// Login check: everything below needs a valid JWT. Sets req.uid and req.user.
r.use(async (req, res, next) => {
  try {
    const t = (req.get('authorization') || '').replace(/^Bearer /, '');
    try { req.uid = jwt.verify(t, process.env.JWT_SECRET).id; } catch { throw fail(401, 'Please sign in again'); }
    req.user = await User.findById(req.uid);
    if (!req.user) throw fail(401, 'Please sign in again');
    next();
  } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong on our side' }); }
});
r.use(rateLimit({ windowMs: 60 * 1000, limit: 240, keyGenerator: (req) => req.uid, validate: false }));

// 2) Everything below needs a signed-in user
r.use(profile);
r.use(notifications);
r.use(habits);
r.use(stats);
r.use(circles);
r.use(challenges);
r.use(ai);

export default r;
