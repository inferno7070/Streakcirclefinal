// =============================================================
// auth.js: Public sign up and sign in (no login needed)
// =============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { fail } from '../lib/errors.js';
import { wrap, sign, pub, authLimit } from './helpers.js';

const r = Router();

// POST /auth/register: create account (password hashed with bcrypt), returns JWT
r.post('/auth/register', authLimit, wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw fail(400, 'Enter your name and a valid email');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw fail(400, 'Password must be between 8 and 128 characters');
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) throw fail(409, 'That email is already registered');
  const u = await User.create({ name: name.trim(), email: normalizedEmail, pass: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
// POST /auth/login: check password, returns JWT
r.post('/auth/login', authLimit, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const u = await User.findOne({ email: normalizedEmail });
  if (!u || typeof password !== 'string' || !(await bcrypt.compare(password, u.pass))) throw fail(401, 'Wrong email or password');
  res.json({ token: sign(u), user: pub(u) });
}));

export default r;
