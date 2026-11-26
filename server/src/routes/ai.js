// =============================================================
// ai.js: Tick AI: habit suggestions, coaching and chat
// =============================================================
import { Router } from 'express';
import { tick, suggestHabits, coachInsights } from '../ai/coach.js';
import { wrap, byUid } from './helpers.js';

const r = Router();

// AI endpoints are rate limited (12/min per user)
const aiLimit = byUid(60 * 1000, 12);
const aiFail = (e, res) => { console.error('AI error:', e.message); const s = e.status === 429 ? 429 : 502; res.status(s).json({ error: s === 429 ? 'The AI coach is rate-limited. Try again shortly.' : 'The AI coach is unavailable right now.' }); };
// POST /ai/suggest: 3 habit ideas
r.post('/ai/suggest', aiLimit, wrap(async (req, res) => { try { res.json(await suggestHabits(req.user, req.today)); } catch (e) { aiFail(e, res); } }));
// POST /ai/coach: tips + motivation
r.post('/ai/coach', aiLimit, wrap(async (req, res) => { try { res.json(await coachInsights(req.user, req.today)); } catch (e) { aiFail(e, res); } }));
// POST /tick: Tick chat (can also perform actions)
r.post('/tick', byUid(60 * 1000, 20), wrap(async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  try { res.json(await tick(req.user, messages, req.today)); } catch (e) {
    console.error('Tick error:', e.message);
    const status = e.status === 429 ? 429 : e.status === 401 || e.status === 403 ? 503 : 502;
    res.status(status).json({ error: status === 429 ? 'Tick is temporarily rate-limited. Please try again shortly.' : 'Tick is temporarily unavailable. Your habits were not changed by this failed request.' });
  }
}));

export default r;
