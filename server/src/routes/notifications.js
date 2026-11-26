// =============================================================
// notifications.js: Notification bell: list and mark read
// =============================================================
import { Router } from 'express';
import { Notification } from '../models/index.js';
import { wrap } from './helpers.js';

const r = Router();

// GET /notifications: latest 30 + unread count
r.get('/notifications', wrap(async (req, res) => {
  const [items, unread] = await Promise.all([Notification.find({ user: req.uid }).sort({ createdAt: -1 }).limit(30).lean(), Notification.countDocuments({ user: req.uid, read: false })]);
  res.json({ unread, items: items.map((n) => ({ id: String(n._id), type: n.type, text: n.text, from: n.from, read: n.read, at: n.createdAt })) });
}));
// POST /notifications/read: mark all read
r.post('/notifications/read', wrap(async (req, res) => { await Notification.updateMany({ user: req.uid, read: false }, { $set: { read: true } }); res.json({ ok: true }); }));

export default r;
