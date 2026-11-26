// =============================================================
// stats.js: Insights screen: totals, charts, missed-habit insights
// =============================================================
import { Router } from 'express';
import { CheckIn, Reason } from '../models/index.js';
import { addDays, easeTarget, REASONS } from '../lib/streaks.js';
import { DOW, SHORT, dow } from '../lib/weekdays.js';
import { payload } from '../services/habits.js';
import { wrap } from './helpers.js';

const r = Router();

// dailySeries(): % of habits done for each of the last 28 days
function dailySeries(habits, today) {
  return Array.from({ length: 28 }, (_, i) => {
    const date = addDays(today, i - 27);
    const live = habits.filter((h) => h.created <= date);
    return { date, label: SHORT[dow(date)], pct: live.length ? Math.round((live.reduce((a, h) => a + h.heat[i], 0) / live.length) * 100) : 0 };
  });
}
// GET /stats: totals, streaks, weekly/monthly charts, missed-habit insights, recovery suggestions
r.get('/stats', wrap(async (req, res) => {
  const p = await payload(req.uid, req.today);
  const heat = Array.from({ length: 28 }, (_, i) => (p.habits.length ? p.habits.reduce((a, h) => a + h.heat[i], 0) / p.habits.length : 0));
  const reasons = Object.fromEntries(REASONS.map((x) => [x, 0]));
  (await Reason.find({ user: req.uid }).lean()).forEach((x) => { if (x.reason in reasons) reasons[x.reason]++; });
  const total = await CheckIn.countDocuments({ user: req.uid, done: true, date: { $lte: req.today } });
  const series = dailySeries(p.habits, req.today);
  const weeks = [0, 1, 2, 3].map((k) => { const sl = series.slice(k * 7, k * 7 + 7); return { label: `W${k + 1}`, pct: Math.round(sl.reduce((a, d) => a + d.pct, 0) / 7) }; });
  const missByDow = Array(7).fill(0);
  const daily = p.habits.filter((h) => h.frequency === 'daily');
  daily.forEach((h) => h.heat.forEach((v, i) => { const d = addDays(req.today, i - 27); if (!v && d >= h.created && d < req.today) missByDow[dow(d)]++; }));
  const maxMiss = Math.max(...missByDow);
  const weakest = daily.length ? daily.slice().sort((a, b) => a.rate - b.rate)[0] : null;
  const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  const insights = {
    worstDay: maxMiss > 0 ? DOW[missByDow.indexOf(maxMiss)] : null, missedTotal: missByDow.reduce((a, b) => a + b, 0),
    weakest: weakest && weakest.rate < 100 ? { name: weakest.name, icon: weakest.icon, rate: weakest.rate } : null,
    topReason: topReason && topReason[1] > 0 ? topReason[0] : null,
  };
  const recovery = p.habits.filter((h) => h.rough || (h.frequency === 'daily' && h.streak === 0 && h.rate < 40 && h.created < addDays(req.today, -3)))
    .map((h) => ({ id: h.id, name: h.name, icon: h.icon, unit: h.unit, target: h.target, easier: easeTarget(h.target, h.step), missed7: h.missed7, rate: h.rate, canEase: easeTarget(h.target, h.step) < h.target }));
  res.json({
    avg: p.cons, best: p.streak, longest: p.habits.reduce((a, h) => Math.max(a, h.best), 0), total, heat, reasons, level: p.level, xp: p.xp,
    habits: p.habits.length, doneToday: p.habits.filter((h) => h.done || h.weekMet).length, week: series.slice(21), weeks, insights, recovery,
    byHabit: p.habits.map((h) => ({ id: h.id, name: h.name, icon: h.icon, rate: h.rate, streak: h.streak, best: h.best, total: h.total, category: h.category })),
  });
}));

export default r;
