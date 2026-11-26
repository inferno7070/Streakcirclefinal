// =============================================================
// models.js: MongoDB (Mongoose) schemas.
// User, Habit, CheckIn (one row per habit per day), Reason (why a day was missed),
// Circle, Activity (circle feed), Message (circle chat), Notification, Challenge.
// =============================================================
import mongoose from 'mongoose';
import { CATEGORIES, PRIORITIES, REASONS } from '../lib/streaks.js';
const { Schema, model } = mongoose;
const ref = (m, extra = {}) => ({ type: Schema.Types.ObjectId, ref: m, ...extra });

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  pass: { type: String, required: true },
  bio: { type: String, default: '', maxlength: 120 },
  emoji: { type: String, default: '', maxlength: 8 },
  freezes: { type: Number, default: 1 },
  circle: ref('Circle', { default: null, index: true }),
}, { timestamps: true }));

export const Habit = model('Habit', new Schema({
  user: ref('User', { required: true, index: true }),
  name: { type: String, required: true, trim: true, maxlength: 40 },
  icon: { type: String, default: '⭐', maxlength: 8 },
  unit: { type: String, default: 'times', maxlength: 16 },
  target: { type: Number, required: true, min: 1, max: 100000 },
  step: { type: Number, default: 1, min: 1 },
  category: { type: String, enum: CATEGORIES, default: 'other' },
  frequency: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
  perWeek: { type: Number, default: 7, min: 1, max: 7 },
  priority: { type: String, enum: PRIORITIES, default: 'medium' },
  remindAt: { type: String, default: '' },
}, { timestamps: true }));

const checkSchema = new Schema({
  habit: ref('Habit', { required: true }),
  user: ref('User', { required: true, index: true }),
  date: { type: String, required: true },
  value: { type: Number, default: 0 },
  done: { type: Boolean, default: false },
  frozen: { type: Boolean, default: false },
});
checkSchema.index({ habit: 1, date: 1 }, { unique: true });
checkSchema.index({ user: 1, date: 1 });
export const CheckIn = model('CheckIn', checkSchema);

export const Reason = model('Reason', new Schema({
  user: ref('User', { required: true, index: true }),
  habit: ref('Habit'),
  reason: { type: String, enum: REASONS, required: true },
  date: String,
}, { timestamps: true }));

export const Circle = model('Circle', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 30 },
  code: { type: String, required: true, unique: true },
  owner: ref('User'),
  memberCount: { type: Number, min: 0 },
}, { timestamps: true }));

export const Activity = model('Activity', new Schema({
  circle: ref('Circle', { required: true }), user: ref('User', { required: true }),
  type: { type: String, required: true }, text: { type: String, required: true, maxlength: 200 },
  reactions: [{ _id: false, user: ref('User'), emoji: String }],
}, { timestamps: true }).index({ circle: 1, createdAt: -1 }));
export const Message = model('Message', new Schema({
  circle: ref('Circle', { required: true }), user: ref('User', { required: true }),
  text: { type: String, required: true, trim: true, maxlength: 300 },
}, { timestamps: true }).index({ circle: 1, createdAt: -1 }));
export const Notification = model('Notification', new Schema({
  user: ref('User', { required: true }), type: { type: String, default: 'info' },
  text: { type: String, required: true, maxlength: 200 }, from: { type: String, default: '' }, read: { type: Boolean, default: false },
}, { timestamps: true }).index({ user: 1, createdAt: -1 }));
export const Challenge = model('Challenge', new Schema({
  circle: ref('Circle', { required: true, index: true }), name: { type: String, required: true, trim: true, maxlength: 40 },
  metric: { type: String, enum: ['consistency', 'streak', 'points'], default: 'consistency' },
  start: { type: String, required: true }, end: { type: String, required: true },
  createdBy: ref('User'), members: [ref('User')],
}, { timestamps: true }));
