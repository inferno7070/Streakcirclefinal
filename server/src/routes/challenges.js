// =============================================================
// challenges.js: Sprint challenges: create, join, leave, delete, leaderboard
// =============================================================
import { Router } from 'express';
import { Circle, Challenge } from '../models/index.js';
import { addDays, isValidDateString } from '../lib/streaks.js';
import { fail } from '../lib/errors.js';
import { logActivity, challengeView } from '../services/habits.js';
import { needCircle } from '../services/circles.js';
import { emitCircle } from '../realtime/emit.js';
import { wrap, byUid } from './helpers.js';

const r = Router();

// GET /challenges: challenges of my circle with leaderboards
r.get('/challenges', wrap(async (req, res) => {
  const list = await Challenge.find({ circle: needCircle(req) }).sort({ createdAt: -1 }).limit(20);
  res.json({ challenges: await Promise.all(list.map((c) => challengeView(c, req.uid, req.today))) });
}));
// POST /challenges: create a challenge (3 to 90 days)
r.post('/challenges', byUid(60 * 1000, 10), wrap(async (req, res) => {
  const cid = needCircle(req);
  const { name, metric, days, start } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw fail(400, 'Name the challenge (up to 40 characters)');
  if (!['consistency', 'streak', 'points'].includes(metric)) throw fail(400, 'Rank by consistency, streak or points');
  const n = Number(days);
  if (!Number.isInteger(n) || n < 3 || n > 90) throw fail(400, 'Challenge length must be 3 to 90 days');
  const from = start === undefined || start === '' ? req.today : start;
  if (!isValidDateString(from) || from < req.today || from > addDays(req.today, 30)) throw fail(400, 'Start date must be within the next 30 days');
  if (await Challenge.countDocuments({ circle: cid, end: { $gte: req.today } }) >= 10) throw fail(400, 'This circle already has 10 running challenges');
  const c = await Challenge.create({ circle: cid, name: name.trim(), metric, start: from, end: addDays(from, n - 1), createdBy: req.uid, members: [req.uid] });
  await logActivity(cid, req.uid, 'challenge', `${req.user.name} started the challenge “${c.name}” 🏁`);
  emitCircle(cid, 'challenge:update', {});
  res.status(201).json({ challenge: await challengeView(c, req.uid, req.today) });
}));
// findChallenge(): load a challenge only if it belongs to my circle
const findChallenge = async (req) => { const c = await Challenge.findOne({ _id: req.params.id, circle: needCircle(req) }); if (!c) throw fail(404, 'Challenge not found'); return c; };
// POST /challenges/:id/join
r.post('/challenges/:id/join', wrap(async (req, res) => {
  const c = await findChallenge(req);
  if (req.today > c.end) throw fail(400, 'That challenge has already ended');
  await Challenge.updateOne({ _id: c._id }, { $addToSet: { members: req.uid } });
  await logActivity(c.circle, req.uid, 'challenge', `${req.user.name} joined “${c.name}” 💪`);
  emitCircle(c.circle, 'challenge:update', {});
  res.json({ challenge: await challengeView(await Challenge.findById(c._id), req.uid, req.today) });
}));
// POST /challenges/:id/leave
r.post('/challenges/:id/leave', wrap(async (req, res) => {
  const c = await findChallenge(req);
  await Challenge.updateOne({ _id: c._id }, { $pull: { members: req.uid } });
  emitCircle(c.circle, 'challenge:update', {});
  res.json({ challenge: await challengeView(await Challenge.findById(c._id), req.uid, req.today) });
}));
// DELETE /challenges/:id: creator or circle owner only
r.delete('/challenges/:id', wrap(async (req, res) => {
  const c = await findChallenge(req);
  const circle = await Circle.findById(c.circle).select('owner').lean();
  if (String(c.createdBy) !== req.uid && String(circle?.owner) !== req.uid) throw fail(403, 'Only the creator or circle owner can delete this challenge');
  await c.deleteOne();
  emitCircle(c.circle, 'challenge:update', {});
  res.json({ ok: true });
}));

export default r;
