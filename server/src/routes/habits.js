// =============================================================
// habits.js: Habits: create, edit, delete, daily progress, history, recovery (ease/reason/freeze)
// =============================================================
import { Router } from 'express';
import { User, CheckIn, Reason } from '../models/index.js';
import { addDays, stepFor, REASONS } from '../lib/streaks.js';
import { fail } from '../lib/errors.js';
import { overviews, payload, setProgress, addHabit, easeHabit, own, notifyCircle, habitFields } from '../services/habits.js';
import { wrap } from './helpers.js';

const r = Router();

// GET /habits: all habits with today's progress and streaks
r.get('/habits', wrap(async (req, res) => res.json(await payload(req.uid, req.today))));
// POST /habits: create a habit
r.post('/habits', wrap(async (req, res) => {
  try { await addHabit(req.uid, req.body || {}); } catch (e) { throw e.status ? e : fail(400, e.message); }
  res.status(201).json(await payload(req.uid, req.today));
}));
// PATCH /habits/:id: edit a habit
r.patch('/habits/:id', wrap(async (req, res) => {
  const h = await own(req.uid, req.params.id);
  if (!h) throw fail(404, 'Habit not found');
  const { name, icon, target } = req.body || {};
  if (name !== undefined) { if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw fail(400, 'Habit name must be 1–40 characters'); h.name = name.trim(); }
  if (icon !== undefined) { if (typeof icon !== 'string' || !icon || icon.length > 8) throw fail(400, 'Invalid habit icon'); h.icon = icon; }
  if (target !== undefined) { const n = Number(target); if (!Number.isFinite(n) || n < 1 || n > 100000) throw fail(400, 'Target must be between 1 and 100000'); h.target = n; h.step = stepFor(n); }
  const f = habitFields(req.body || {}, true);
  if (f.frequency === 'weekly' && f.perWeek === undefined && !(h.perWeek > 0 && h.perWeek < 7)) f.perWeek = 3;
  Object.assign(h, f);
  await h.save();
  await notifyCircle(req.uid);
  res.json(await payload(req.uid, req.today));
}));
// DELETE /habits/:id: delete a habit and its history
r.delete('/habits/:id', wrap(async (req, res) => {
  const h = await own(req.uid, req.params.id);
  if (!h) throw fail(404, 'Habit not found');
  await Promise.all([h.deleteOne(), CheckIn.deleteMany({ habit: h._id }), Reason.deleteMany({ habit: h._id })]);
  await notifyCircle(req.uid);
  res.json(await payload(req.uid, req.today));
}));
// PUT /habits/:id/progress: set progress for today (or a date in the last 7 days)
r.put('/habits/:id/progress', wrap(async (req, res) => {
  const date = req.body?.date === undefined ? req.today : req.body.date;
  try { await setProgress(req.uid, req.params.id, req.body?.value, req.today, date); } catch (e) { throw fail(e.message === 'Habit not found' ? 404 : 400, e.message); }
  res.json(await payload(req.uid, req.today));
}));
// GET /habits/:id/history: last 180 days for the calendar
r.get('/habits/:id/history', wrap(async (req, res) => {
  const h = await own(req.uid, req.params.id);
  if (!h) throw fail(404, 'Habit not found');
  const [rows, all] = await Promise.all([CheckIn.find({ habit: h._id, date: { $gte: addDays(req.today, -180), $lte: req.today } }).select('date value done frozen').lean(), overviews([req.uid], req.today)]);
  const days = {};
  rows.forEach((c) => { days[c.date] = { v: c.value, d: c.done ? 1 : 0, f: c.frozen ? 1 : 0 }; });
  res.json({ habit: all.get(String(req.uid)).find((x) => x.id === String(h._id)), days, today: req.today });
}));
// POST /habits/:id/ease: lower the target (recovery)
r.post('/habits/:id/ease', wrap(async (req, res) => {
  try { await easeHabit(req.uid, req.params.id); } catch (e) { throw fail(e.message === 'Habit not found' ? 404 : 400, e.message); }
  res.json(await payload(req.uid, req.today));
}));
// POST /habits/:id/reason: record why yesterday was missed
r.post('/habits/:id/reason', wrap(async (req, res) => {
  const h = await own(req.uid, req.params.id);
  if (!h) throw fail(404, 'Habit not found');
  if (!REASONS.includes(req.body?.reason)) throw fail(400, 'Choose one of the listed reasons');
  await Reason.create({ user: req.uid, habit: h._id, reason: req.body.reason, date: addDays(req.today, -1) });
  res.json({ ok: true });
}));
// POST /habits/:id/freeze: use a streak freeze on yesterday
r.post('/habits/:id/freeze', wrap(async (req, res) => {
  const h = await own(req.uid, req.params.id);
  if (!h) throw fail(404, 'Habit not found');
  const date = addDays(req.today, -1);
  const used = await User.findOneAndUpdate({ _id: req.uid, freezes: { $gt: 0 } }, { $inc: { freezes: -1 } });
  if (!used) throw fail(400, 'No streak freezes left');
  try {
    await CheckIn.findOneAndUpdate({ habit: h._id, date, done: { $ne: true }, frozen: { $ne: true } }, { $set: { user: req.uid, frozen: true }, $setOnInsert: { value: 0, done: false } }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    await User.updateOne({ _id: req.uid }, { $inc: { freezes: 1 } });
    if (error.code === 11000) throw fail(409, 'A freeze has already been used for that day, or the habit was already completed');
    throw error;
  }
  await notifyCircle(req.uid);
  res.json(await payload(req.uid, req.today));
}));

export default r;
