// =============================================================
// core.js: business logic shared by the HTTP routes and the Tick AI.
// Builds habit overviews, saves progress, creates habits, writes notifications and the
// circle activity feed, and computes challenge leaderboards.
// =============================================================
import { Habit, CheckIn, User, Activity, Notification } from '../models/index.js';
import { view, summary, addDays, daysBetween, easeTarget, stepFor, UNITS, CATEGORIES, PRIORITIES, isTime, isValidDateString } from '../lib/streaks.js';
import { emitCircle, emitUser } from '../realtime/emit.js';

// overviews(): load habits + recent check-ins for several users at once
export async function overviews(userIds, today) {
  const ids = userIds.map(String);
  const [hs, cs] = await Promise.all([
    Habit.find({ user: { $in: ids } }).sort({ createdAt: 1 }).lean(),
    CheckIn.find({ user: { $in: ids }, date: { $gte: addDays(today, -400), $lte: today } }).lean(),
  ]);
  const byHabit = new Map();
  cs.forEach((c) => {
    const k = String(c.habit);
    if (!byHabit.has(k)) byHabit.set(k, new Map());
    byHabit.get(k).set(c.date, c);
  });
  const out = new Map(ids.map((i) => [i, []]));
  hs.forEach((h) => out.get(String(h.user))?.push(view(h, byHabit.get(String(h._id)) || new Map(), today)));
  return out;
}

// payload(): the full /habits response (habits, freezes, XP, level, summary)
export async function payload(userId, today) {
  const [map, user, xpCount] = await Promise.all([
    overviews([userId], today), User.findById(userId).lean(), CheckIn.countDocuments({ user: userId, done: true, date: { $lte: today } }),
  ]);
  const habits = map.get(String(userId));
  return { habits, freezes: user.freezes, xp: xpCount * 10, level: Math.floor((xpCount * 10) / 200) + 1, ...summary(habits) };
}

// notifyCircle(): tell the circle's live clients to refresh; returns the circle id
export async function notifyCircle(userId) {
  const u = await User.findById(userId).select('circle').lean();
  if (u?.circle) emitCircle(u.circle, 'circle:update', { by: String(userId) });
  return u?.circle || null;
}

// notify(): save a notification and push it live to that user
export async function notify(userId, { type = 'info', text, from = '' }) {
  const n = await Notification.create({ user: userId, type, text: String(text).slice(0, 200), from });
  emitUser(String(userId), 'notify', { id: String(n._id), type, text: n.text, from, createdAt: n.createdAt });
  return n;
}

// logActivity(): add a line to the circle feed and push it live
export async function logActivity(circleId, userId, type, text) {
  if (!circleId) return null;
  const a = await Activity.create({ circle: circleId, user: userId, type, text: String(text).slice(0, 200) });
  emitCircle(circleId, 'circle:activity', { id: String(a._id) });
  return a;
}

// own(): find a habit only if it belongs to this user (blocks access to others' habits)
export const own = (userId, id) => Habit.findOne({ _id: id, user: userId });

// setProgress(): save progress for a day (today, or one of the last 7); logs feed items on completion
export async function setProgress(userId, id, value, today, date = today) {
  const h = await own(userId, id);
  if (!h) throw new Error('Habit not found');
  const numeric = Number(value);
  if (value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(numeric) || numeric < 0 || numeric > 100000) throw new Error('Progress must be a valid non-negative number');
  if (date !== today) {
    const created = new Date(h.createdAt).toISOString().slice(0, 10);
    if (!isValidDateString(date) || date > today || date < addDays(today, -7) || date < created) throw new Error('You can only edit the last 7 days of this habit');
  }
  const v = Math.max(0, Math.min(numeric, h.target));
  const before = await CheckIn.findOneAndUpdate({ habit: h._id, date }, { $set: { user: userId, value: v, done: v >= h.target, frozen: false } }, { upsert: true, new: false }).lean();
  const circle = await notifyCircle(userId);
  if (circle && date === today && v >= h.target && !before?.done) {
    const u = await User.findById(userId).select('name').lean();
    await logActivity(circle, userId, 'habit', `${u.name} completed ${h.icon} ${h.name}`);
    const [total, finished] = await Promise.all([Habit.countDocuments({ user: userId }), CheckIn.countDocuments({ user: userId, date: today, done: true })]);
    if (total > 0 && finished >= total) await logActivity(circle, userId, 'ring', `${u.name} closed the ring today 🎉`);
  }
  return h;
}

// habitFields(): validate and clean the optional habit fields (category, priority, frequency...)
export function habitFields(input = {}, partial = false) {
  const out = {};
  const bad = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  if (input.unit !== undefined) { if (!UNITS.includes(input.unit)) bad('Choose a supported habit unit'); out.unit = input.unit; }
  if (input.category !== undefined) { if (!CATEGORIES.includes(input.category)) bad('Choose a supported category'); out.category = input.category; }
  if (input.priority !== undefined) { if (!PRIORITIES.includes(input.priority)) bad('Choose low, medium or high priority'); out.priority = input.priority; }
  if (input.frequency !== undefined) { if (!['daily', 'weekly'].includes(input.frequency)) bad('Frequency must be daily or weekly'); out.frequency = input.frequency; }
  if (input.perWeek !== undefined) { const n = Number(input.perWeek); if (!Number.isInteger(n) || n < 1 || n > 7) bad('Days per week must be 1 to 7'); out.perWeek = n; }
  if (input.remindAt !== undefined) { if (!isTime(input.remindAt)) bad('Reminder time must look like 07:30'); out.remindAt = input.remindAt; }
  if (out.frequency === 'daily') out.perWeek = 7;
  if (out.frequency === 'weekly' && out.perWeek === undefined && !partial) out.perWeek = 3;
  return out;
}

// addHabit(): validate and create a habit
export async function addHabit(userId, { name, icon, unit, target, ...extra }) {
  if (typeof name !== 'string') throw new Error('Give your habit a name');
  const n = name.trim().slice(0, 40);
  const numericTarget = Number(target);
  if (!n) throw new Error('Give your habit a name');
  if (!Number.isFinite(numericTarget) || numericTarget < 1 || numericTarget > 100000) throw new Error('Target must be between 1 and 100000');
  const more = habitFields({ category: extra.category, priority: extra.priority, frequency: extra.frequency, perWeek: extra.perWeek, remindAt: extra.remindAt, unit });
  const safeIcon = typeof icon === 'string' && icon.length <= 8 && icon ? icon : '⭐';
  return Habit.create({ user: userId, name: n, icon: safeIcon, unit: 'times', target: numericTarget, step: stepFor(numericTarget), ...more });
}

// easeHabit(): lower a habit's target (recovery)
export async function easeHabit(userId, id) {
  const h = await own(userId, id);
  if (!h) throw new Error('Habit not found');
  h.target = easeTarget(h.target, h.step);
  await h.save();
  return h;
}

// findByName(): find one habit by name (used by Tick)
export async function findByName(userId, name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  const hs = await Habit.find({ user: userId });
  const exact = hs.filter((h) => h.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const matches = hs.filter((h) => h.name.toLowerCase().includes(q) || q.includes(h.name.toLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}

// Challenges: status, leaderboard and view
export const challengeStatus = (c, today) => (today < c.start ? 'upcoming' : today > c.end ? 'ended' : 'active');
// challengeBoard(): rank members by consistency, streak or points inside the challenge dates
export async function challengeBoard(ch, today) {
  const ids = (ch.members || []).map(String);
  const upto = today < ch.end ? today : ch.end;
  const elapsed = upto >= ch.start ? daysBetween(ch.start, upto) + 1 : 0;
  const [users, checks] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('name emoji').lean(),
    elapsed ? CheckIn.find({ user: { $in: ids }, done: true, date: { $gte: ch.start, $lte: upto } }).select('user date').lean() : [],
  ]);
  const byUser = new Map(ids.map((i) => [i, { n: 0, days: new Set() }]));
  checks.forEach((c) => { const e = byUser.get(String(c.user)); if (e) { e.n++; e.days.add(c.date); } });
  const rows = users.map((u) => {
    const e = byUser.get(String(u._id));
    let streak = 0, d = e.days.has(upto) ? upto : addDays(upto, -1);
    while (d >= ch.start && e.days.has(d)) { streak++; d = addDays(d, -1); }
    return { id: String(u._id), name: u.name, emoji: u.emoji || '', points: e.n * 10, streak, consistency: elapsed ? Math.round((e.days.size / elapsed) * 100) : 0 };
  });
  const key = ch.metric === 'consistency' ? 'consistency' : ch.metric;
  rows.sort((a, b) => b[key] - a[key] || b.points - a.points || a.name.localeCompare(b.name));
  return { rows, elapsed, total: daysBetween(ch.start, ch.end) + 1 };
}
// challengeView(): the challenge as the client needs it
export async function challengeView(ch, uid, today) {
  const board = await challengeBoard(ch, today);
  return {
    id: String(ch._id), name: ch.name, metric: ch.metric, start: ch.start, end: ch.end, status: challengeStatus(ch, today),
    daysLeft: Math.max(0, daysBetween(today, ch.end) + 1), elapsed: board.elapsed, total: board.total,
    joined: (ch.members || []).some((m) => String(m) === String(uid)), mine: String(ch.createdBy) === String(uid), board: board.rows,
  };
}
