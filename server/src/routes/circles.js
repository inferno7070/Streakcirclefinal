// =============================================================
// circles.js: Circles: create/join/leave, members, analytics, feed, chat, nudges
// =============================================================
import { Router } from 'express';
import crypto from 'node:crypto';
import { User, Circle, Activity, Message, Challenge } from '../models/index.js';
import { addDays, summary } from '../lib/streaks.js';
import { fail } from '../lib/errors.js';
import { SHORT, dow } from '../lib/weekdays.js';
import { overviews, notify, logActivity } from '../services/habits.js';
import { leaveCircle, circleView, needCircle } from '../services/circles.js';
import { emitCircle, emitUser, joinCircleRoom, leaveCircleRoom } from '../realtime/emit.js';
import { wrap, byUid } from './helpers.js';

const r = Router();

// GET /circle: my circle and members
r.get('/circle', wrap(async (req, res) => res.json(await circleView(req.user, req.today))));
// POST /circle: create a circle (6-letter invite code)
r.post('/circle', wrap(async (req, res) => {
  if (req.user.circle) throw fail(400, 'Leave your current circle first');
  const name = String(req.body?.name || '').trim().slice(0, 30);
  if (!name) throw fail(400, 'Name your circle');
  let c;
  for (let i = 0; i < 5 && !c; i++) { try { c = await Circle.create({ name, owner: req.uid, memberCount: 1, code: crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase() }); } catch (e) { if (e.code !== 11000) throw e; } }
  if (!c) throw fail(500, 'Could not create a circle');
  const joined = await User.findOneAndUpdate({ _id: req.uid, circle: null }, { $set: { circle: c._id } }, { new: true });
  if (!joined) { await Circle.deleteOne({ _id: c._id }); throw fail(409, 'Your account is already in a circle'); }
  req.user = joined; joinCircleRoom(req.uid, c._id);
  await logActivity(c._id, req.uid, 'join', `${joined.name} created ${c.name} ✨`);
  res.status(201).json(await circleView(req.user, req.today));
}));
// POST /circle/join: join with a code (max 12 people)
r.post('/circle/join', wrap(async (req, res) => {
  if (req.user.circle) throw fail(400, 'Leave your current circle first');
  const c = await Circle.findOne({ code: String(req.body?.code || '').trim().toUpperCase() });
  if (!c) throw fail(404, 'No circle with that code');
  if (!Number.isInteger(c.memberCount)) { const actual = await User.countDocuments({ circle: c._id }); await Circle.updateOne({ _id: c._id, memberCount: { $exists: false } }, { $set: { memberCount: actual } }); }
  const reserved = await Circle.findOneAndUpdate({ _id: c._id, memberCount: { $lt: 12 } }, { $inc: { memberCount: 1 } }, { new: true });
  if (!reserved) throw fail(400, 'That circle is full (12 people)');
  const joined = await User.findOneAndUpdate({ _id: req.uid, circle: null }, { $set: { circle: c._id } }, { new: true });
  if (!joined) { await Circle.updateOne({ _id: c._id }, { $inc: { memberCount: -1 } }); throw fail(409, 'Your account is already in a circle'); }
  req.user = joined; joinCircleRoom(req.uid, c._id);
  await logActivity(c._id, req.uid, 'join', `${joined.name} joined the circle 👋`);
  if (c.owner) await notify(c.owner, { type: 'join', text: `${joined.name} joined ${c.name}`, from: joined.name });
  emitCircle(c._id, 'circle:update', {});
  res.json(await circleView(req.user, req.today));
}));
// POST /circle/leave
r.post('/circle/leave', wrap(async (req, res) => { await leaveCircle(req.user); res.json({ circle: null }); }));
// DELETE /circle/members/:id: owner removes a member
r.delete('/circle/members/:id', wrap(async (req, res) => {
  const cid = needCircle(req);
  const c = await Circle.findById(cid).lean();
  if (!c || String(c.owner) !== req.uid) throw fail(403, 'Only the circle owner can remove members');
  if (req.params.id === req.uid) throw fail(400, 'Use Leave to leave your own circle');
  const target = await User.findOneAndUpdate({ _id: req.params.id, circle: cid }, { $set: { circle: null } }, { new: true });
  if (!target) throw fail(404, 'That person is not in your circle');
  await Circle.updateOne({ _id: cid, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });
  await Challenge.updateMany({ circle: cid }, { $pull: { members: target._id } });
  leaveCircleRoom(String(target._id), cid);
  emitUser(String(target._id), 'circle:removed', {});
  await notify(target._id, { type: 'removed', text: `You were removed from ${c.name}`, from: req.user.name });
  await logActivity(cid, req.uid, 'leave', `${target.name} was removed from the circle`);
  emitCircle(cid, 'circle:update', {});
  res.json(await circleView(req.user, req.today));
}));
// GET /circle/member/:id: one member's habit progress
r.get('/circle/member/:id', wrap(async (req, res) => {
  const m = await User.findOne({ _id: req.params.id, circle: needCircle(req) }).select('name emoji bio').lean();
  if (!m) throw fail(404, 'That person is not in your circle');
  const habits = (await overviews([m._id], req.today)).get(String(m._id)) || [];
  res.json({ member: { id: String(m._id), name: m.name, emoji: m.emoji || '', bio: m.bio || '' }, ...summary(habits),
    habits: habits.map((h) => ({ name: h.name, icon: h.icon, unit: h.unit, target: h.target, value: h.value, done: h.done, streak: h.streak, rate: h.rate, category: h.category, frequency: h.frequency, weekDone: h.weekDone, perWeek: h.perWeek, heat: h.heat.slice(-14) })) });
}));
// GET /circle/stats: circle analytics
r.get('/circle/stats', wrap(async (req, res) => {
  const cid = needCircle(req);
  const people = await User.find({ circle: cid }).select('name').lean();
  const map = await overviews(people.map((p) => p._id), req.today);
  const all = people.map((p) => ({ p, habits: map.get(String(p._id)) || [] }));
  const series = Array.from({ length: 7 }, (_, k) => {
    const i = 21 + k, date = addDays(req.today, i - 27);
    let live = 0, hit = 0;
    all.forEach(({ habits }) => habits.forEach((h) => { if (h.created <= date) { live++; hit += h.heat[i]; } }));
    return { date, label: SHORT[dow(date)], pct: live ? Math.round((hit / live) * 100) : 0 };
  });
  const rows = all.map(({ p, habits }) => ({ name: p.name, ...summary(habits), week: habits.reduce((a, h) => a + h.heat.slice(21).reduce((x, y) => x + y, 0), 0) }));
  res.json({ members: rows.length, avg: rows.length ? Math.round(rows.reduce((a, x) => a + x.cons, 0) / rows.length) : 0, checkinsWeek: rows.reduce((a, x) => a + x.week, 0), closedToday: rows.filter((x) => x.done).length,
    top: rows.slice().sort((a, b) => b.cons - a.cons || b.streak - a.streak)[0] || null, longest: rows.slice().sort((a, b) => b.streak - a.streak)[0] || null, week: series });
}));
// Allowed feed reactions
const REACTS = ['👏', '🔥', '💪', '❤️'];
// GET /circle/feed: activity feed with reaction counts
r.get('/circle/feed', wrap(async (req, res) => {
  const items = await Activity.find({ circle: needCircle(req) }).sort({ createdAt: -1 }).limit(40).populate('user', 'name emoji').lean();
  res.json({ items: items.map((a) => {
    const counts = {}; (a.reactions || []).forEach((x) => { counts[x.emoji] = (counts[x.emoji] || 0) + 1; });
    return { id: String(a._id), type: a.type, text: a.text, at: a.createdAt, user: a.user ? { id: String(a.user._id), name: a.user.name, emoji: a.user.emoji || '' } : null, counts, mine: (a.reactions || []).filter((x) => String(x.user) === req.uid).map((x) => x.emoji) };
  }) });
}));
// POST /circle/feed/:id/react: toggle a reaction
r.post('/circle/feed/:id/react', byUid(60 * 1000, 40), wrap(async (req, res) => {
  const cid = needCircle(req);
  const emoji = req.body?.emoji;
  if (!REACTS.includes(emoji)) throw fail(400, 'Unknown reaction');
  const a = await Activity.findOne({ _id: req.params.id, circle: cid });
  if (!a) throw fail(404, 'That update no longer exists');
  const had = a.reactions.some((x) => String(x.user) === req.uid && x.emoji === emoji);
  if (had) a.reactions = a.reactions.filter((x) => !(String(x.user) === req.uid && x.emoji === emoji)); else a.reactions.push({ user: req.uid, emoji });
  await a.save();
  if (!had && String(a.user) !== req.uid) await notify(a.user, { type: 'reaction', text: `${req.user.name} reacted ${emoji} to your progress`, from: req.user.name });
  emitCircle(cid, 'circle:activity', { id: String(a._id) });
  res.json({ ok: true });
}));
// Circle chat
const msgView = (m, u) => ({ id: String(m._id), text: m.text, at: m.createdAt, user: { id: String(u._id), name: u.name, emoji: u.emoji || '' } });
r.get('/circle/chat', wrap(async (req, res) => {
  const items = await Message.find({ circle: needCircle(req) }).sort({ createdAt: -1 }).limit(50).populate('user', 'name emoji').lean();
  res.json({ items: items.reverse().filter((m) => m.user).map((m) => msgView(m, m.user)) });
}));
// POST /circle/chat: send a message (also pushed live over Socket.IO)
r.post('/circle/chat', byUid(60 * 1000, 30), wrap(async (req, res) => {
  const cid = needCircle(req);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 300) throw fail(400, 'Message must be 1–300 characters');
  const m = await Message.create({ circle: cid, user: req.uid, text });
  const out = msgView(m, req.user);
  emitCircle(cid, 'chat:msg', out);
  res.status(201).json(out);
}));
// POST /circle/nudge: send a nudge/reaction notification to a member
r.post('/circle/nudge', byUid(60 * 1000, 10), wrap(async (req, res) => {
  const { to, emoji } = req.body || {};
  if (!req.user.circle) throw fail(400, 'Join a circle first');
  if (!['👋', '👏', '🔥'].includes(emoji)) throw fail(400, 'Unknown reaction');
  const target = await User.findOne({ _id: to, circle: req.user.circle }).select('_id').lean().catch(() => null);
  if (!target || String(target._id) === req.uid) throw fail(404, 'That person is not in your circle');
  await notify(target._id, { type: 'nudge', text: emoji === '👋' ? `${req.user.name} nudged you to check in` : `${req.user.name} sent you ${emoji}`, from: req.user.name });
  res.json({ ok: true });
}));

export default r;
