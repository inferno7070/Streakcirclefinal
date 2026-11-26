// =============================================================
// profile.js: The signed-in user: GET/PATCH /me, change password, delete account
// =============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Habit, CheckIn, Reason, Activity, Message, Notification } from '../models/index.js';
import { fail } from '../lib/errors.js';
import { leaveCircle } from '../services/circles.js';
import { emitCircle } from '../realtime/emit.js';
import { wrap, pub, authLimit } from './helpers.js';

const r = Router();

// GET /me: current user
r.get('/me', wrap(async (req, res) => res.json({ user: pub(req.user) })));
// PATCH /me: edit name, bio, avatar
r.patch('/me', wrap(async (req, res) => {
  const { name, bio, emoji } = req.body || {};
  if (name !== undefined) { if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw fail(400, 'Name must be 1–40 characters'); req.user.name = name.trim(); }
  if (bio !== undefined) { if (typeof bio !== 'string' || bio.length > 120) throw fail(400, 'Bio can be up to 120 characters'); req.user.bio = bio.trim(); }
  if (emoji !== undefined) { if (typeof emoji !== 'string' || emoji.length > 8) throw fail(400, 'Invalid avatar emoji'); req.user.emoji = emoji; }
  await req.user.save();
  if (req.user.circle) emitCircle(req.user.circle, 'circle:update', {});
  res.json({ user: pub(req.user) });
}));
// POST /me/password: change password
r.post('/me/password', authLimit, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof current !== 'string' || !(await bcrypt.compare(current, req.user.pass))) throw fail(401, 'Current password is wrong');
  if (typeof next !== 'string' || next.length < 8 || next.length > 128) throw fail(400, 'New password must be between 8 and 128 characters');
  req.user.pass = await bcrypt.hash(next, 12);
  await req.user.save();
  res.json({ ok: true });
}));

// DELETE /me: delete account and all its data (needs password)
r.delete('/me', authLimit, wrap(async (req, res) => {
  const pw = req.body?.password;
  if (typeof pw !== 'string' || !(await bcrypt.compare(pw, req.user.pass))) throw fail(401, 'Password is wrong');
  await leaveCircle(req.user);
  await Promise.all([Habit.deleteMany({ user: req.uid }), CheckIn.deleteMany({ user: req.uid }), Reason.deleteMany({ user: req.uid }), Notification.deleteMany({ user: req.uid }), Message.deleteMany({ user: req.uid }), Activity.deleteMany({ user: req.uid }), User.deleteOne({ _id: req.uid })]);
  res.json({ ok: true });
}));

export default r;
