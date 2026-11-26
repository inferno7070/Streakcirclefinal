// =============================================================
// circles.js: circle logic used by several routes (leave a circle, build the circle view)
// =============================================================
import mongoose from 'mongoose';
import { User, CheckIn, Circle, Activity, Message, Challenge } from '../models/index.js';
import { summary } from '../lib/streaks.js';
import { fail } from '../lib/errors.js';
import { overviews, notify, logActivity } from './habits.js';
import { emitCircle, leaveCircleRoom } from '../realtime/emit.js';

// leaveCircle(): remove user from circle; hands ownership to the oldest member or deletes an empty circle
export async function leaveCircle(user) {
  const cid = user.circle;
  if (!cid) return;
  const left = await User.findOneAndUpdate({ _id: user._id, circle: cid }, { $set: { circle: null } }, { new: true });
  if (!left) return;
  await Circle.updateOne({ _id: cid, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });
  await Challenge.updateMany({ circle: cid }, { $pull: { members: user._id } });
  leaveCircleRoom(String(user._id), cid);
  const circle = await Circle.findById(cid);
  if (!circle) return;
  const remaining = await User.find({ circle: cid }).sort({ createdAt: 1 }).select('_id').lean();
  if (!remaining.length) {
    await Promise.all([Circle.deleteOne({ _id: cid }), Activity.deleteMany({ circle: cid }), Message.deleteMany({ circle: cid }), Challenge.deleteMany({ circle: cid })]);
    return;
  }
  if (String(circle.owner) === String(user._id)) {
    circle.owner = remaining[0]._id; await circle.save();
    await notify(remaining[0]._id, { type: 'owner', text: `You are now the owner of ${circle.name}` });
  }
  await logActivity(cid, user._id, 'leave', `${user.name} left the circle`);
  emitCircle(cid, 'circle:update', {});
}
// circleView(): circle info + every member's summary
export async function circleView(user, today) {
  if (!user.circle) return { circle: null };
  const c = await Circle.findById(user.circle).lean();
  if (!c) { await User.updateOne({ _id: user._id }, { circle: null }); return { circle: null }; }
  const people = await User.find({ circle: c._id }).select('name emoji bio').lean();
  const ids = people.map((p) => p._id);
  const [map, pts] = await Promise.all([overviews(ids, today), CheckIn.aggregate([{ $match: { user: { $in: ids.map((i) => new mongoose.Types.ObjectId(String(i))) }, done: true } }, { $group: { _id: '$user', n: { $sum: 1 } } }])]);
  const points = new Map(pts.map((x) => [String(x._id), x.n * 10]));
  const members = people.map((p) => ({
    id: String(p._id), name: p.name, emoji: p.emoji || '', bio: p.bio || '', me: String(p._id) === String(user._id), owner: String(p._id) === String(c.owner),
    points: points.get(String(p._id)) || 0, habits: (map.get(String(p._id)) || []).length, ...summary(map.get(String(p._id)) || []),
  }));
  return { circle: { id: String(c._id), name: c.name, code: c.code, isOwner: String(c.owner) === String(user._id), max: 12 }, members };
}
// needCircle(): stop the request if the user is not in a circle
export const needCircle = (req) => { if (!req.user.circle) throw fail(400, 'Join a circle first'); return req.user.circle; };
