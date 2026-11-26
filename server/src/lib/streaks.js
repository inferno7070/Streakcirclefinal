// =============================================================
// lib.js: pure helper functions (no database).
// Dates and timezones, streak / completion maths, and the allowed units, categories,
// priorities and miss reasons. Because it is pure, it is easy to unit-test (lib.test.js).
// =============================================================
// Pure helpers: dates, streaks, consistency. No DB access, so they are unit-testable.
// Date helpers
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function todayForTimezone(timeZone = 'UTC', now = new Date()) {
  if (typeof timeZone !== 'string' || timeZone.length > 64) throw new Error('Invalid timezone');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ok = (c) => !!c && (c.done || c.frozen);

// Allowed values for habit fields (also used to validate API input)
export const UNITS = ['min', 'hours', 'times', 'reps', 'pages', 'km', 'glasses', 'steps', 'liters'];
export const CATEGORIES = ['health', 'fitness', 'learning', 'mindfulness', 'work', 'social', 'finance', 'other'];
export const PRIORITIES = ['low', 'medium', 'high'];
export const REASONS = ['busy', 'forgot', 'too hard', 'sick', 'tired', 'other'];
// Reminder time must look like "07:30" (or empty = no reminder)
export const isTime = (s) => s === '' || (typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
// Weeks start on Monday
export const weekStart = (s) => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7));
// Whole days between two YYYY-MM-DD dates
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

// checks: Map<dateString, {done, frozen, value}>
// view(): turns one habit + its check-ins into everything the UI shows
// (progress, current/best streak, 28-day rate, weekly goal, missed days, heat map).
// Daily habits count consecutive days; weekly habits count consecutive weeks that hit perWeek.
export function view(h, checks, today) {
  const created = h.createdAt ? new Date(h.createdAt).toISOString().slice(0, 10) : today;
  const weekly = h.frequency === 'weekly';
  const perWeek = Math.min(7, Math.max(1, h.perWeek || 1));
  const t = checks.get(today);
  const yest = addDays(today, -1);
  const weekCount = (ws) => { let n = 0; for (let i = 0; i < 7; i++) if (ok(checks.get(addDays(ws, i)))) n++; return n; };
  let streak = 0, best = 0, total = 0;
  const floor = addDays(today, -399);
  const first = created > floor ? created : floor;
  for (const c of checks.values()) if (c.done) total++;
  if (!weekly) {
    let d = ok(t) ? today : yest;
    while (ok(checks.get(d)) && streak < 800) { streak++; d = addDays(d, -1); }
    let run = 0;
    for (let x = first; x <= today; x = addDays(x, 1)) { run = ok(checks.get(x)) ? run + 1 : 0; if (run > best) best = run; }
  } else {
    let ws = weekStart(today);
    if (weekCount(ws) < perWeek) ws = addDays(ws, -7);
    while (ws >= addDays(weekStart(first), -7) && weekCount(ws) >= perWeek && streak < 120) { streak++; ws = addDays(ws, -7); }
    let run = 0;
    for (let w = weekStart(first); w <= today; w = addDays(w, 7)) {
      if (weekCount(w) >= perWeek) { run++; if (run > best) best = run; } else if (addDays(w, 7) <= today) run = 0;
    }
  }
  best = Math.max(best, streak);
  const start = created > addDays(today, -27) ? created : addDays(today, -27);
  const end = ok(t) ? today : yest;
  let days = 0, hit = 0;
  for (let x = start; x <= end; x = addDays(x, 1)) { days++; if (ok(checks.get(x))) hit++; }
  let missed7 = 0;
  for (let i = 1; i <= 7; i++) { const x = addDays(today, -i); if (x >= created && !ok(checks.get(x))) missed7++; }
  const heat = [];
  for (let i = 27; i >= 0; i--) heat.push(ok(checks.get(addDays(today, -i))) ? 1 : 0);
  const weekDone = weekCount(weekStart(today));
  let rate = days ? Math.round((hit / days) * 100) : 0;
  if (weekly) {
    const spanWeeks = Math.max(1, Math.min(4, Math.ceil((daysBetween(start, today) + 1) / 7)));
    rate = Math.min(100, Math.round((hit / (perWeek * spanWeeks)) * 100));
  }
  return {
    id: String(h._id), name: h.name, icon: h.icon, unit: h.unit, target: h.target, step: h.step,
    category: h.category || 'other', frequency: weekly ? 'weekly' : 'daily', perWeek: weekly ? perWeek : 7,
    priority: h.priority || 'medium', remindAt: h.remindAt || '', created, weekMet: weekly && weekDone >= perWeek,
    value: t ? t.value : 0, done: !!(t && t.done), streak, best, total, weekDone, rate,
    missedYesterday: !weekly && created < yest && !ok(checks.get(yest)),
    rough: !weekly && missed7 >= 3, missed7: weekly ? 0 : missed7, heat,
  };
}

// summary(): totals across all of a person's habits (average consistency, best streak, ring closed?)
export function summary(views) {
  const n = views.length;
  return {
    cons: n ? Math.round(views.reduce((a, v) => a + v.rate, 0) / n) : 0,
    streak: views.reduce((a, v) => Math.max(a, v.streak), 0),
    done: n > 0 && views.every((v) => v.done || v.weekMet),
  };
}

// easeTarget(): the "lighter" target used by recovery (60% of the old one, rounded to the step)
export const easeTarget = (target, step) => Math.max(step, Math.round((target * 0.6) / step) * step);
// stepFor(): size of the +/- buttons for a given target
export const stepFor = (t) => (t >= 60 ? 10 : t >= 20 ? 5 : 1);
