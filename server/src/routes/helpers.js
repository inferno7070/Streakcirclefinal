// =============================================================
// helpers.js: wrap() for async routes, JWT sign/pub, rate limiters shared by the route files
// =============================================================
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

// wrap(): catches errors in async routes and returns a clean JSON error
export const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const code = e.status || (e.name === 'ValidationError' ? 400 : e.name === 'CastError' ? 404 : e.code === 11000 ? 409 : 500);
  if (code === 500) console.error(e);
  res.status(code).json({ error: code === 500 ? 'Something went wrong on our side' : e.message });
});
export const sign = (u) => jwt.sign({ id: String(u._id) }, process.env.JWT_SECRET, { expiresIn: '30d' });
export const pub = (u) => ({ id: String(u._id), name: u.name, email: u.email, bio: u.bio || '', emoji: u.emoji || '', joined: u.createdAt });
// byUid(): per-user rate limiter (needs req.uid, so only used after login)
export const byUid = (windowMs, limit) => rateLimit({ windowMs, limit, keyGenerator: (req) => req.uid, validate: false });
export const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
