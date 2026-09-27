import mongoose from 'mongoose';

const { Schema } = mongoose;

const baseSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  location: { type: String, required: true, trim: true },
}, { timestamps: true });

const assetSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  type: { type: String, required: true, enum: ['Vehicles', 'Weapons', 'Ammunition', 'Communications'] },
  unit: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
}, { timestamps: true });

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ['Admin', 'Base Commander', 'Logistics Officer'] },
  baseId: { type: Schema.Types.ObjectId, ref: 'Base', default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const openingBalanceSchema = new Schema({
  baseId: { type: Schema.Types.ObjectId, ref: 'Base', required: true },
  assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
  quantity: { type: Number, required: true, min: 0 },
}, { timestamps: true });
openingBalanceSchema.index({ baseId: 1, assetId: 1 }, { unique: true });

const activitySchema = new Schema({
  kind: { type: String, required: true, enum: ['purchase', 'transfer', 'assignment', 'expenditure', 'system'] },
  action: { type: String, required: true, enum: ['CREATE', 'LOGIN'] },
  module: { type: String, required: true },
  assetId: { type: Schema.Types.ObjectId, ref: 'Asset', default: null },
  baseId: { type: Schema.Types.ObjectId, ref: 'Base', default: null },
  sourceBaseId: { type: Schema.Types.ObjectId, ref: 'Base', default: null },
  destinationBaseId: { type: Schema.Types.ObjectId, ref: 'Base', default: null },
  quantity: { type: Number, min: 0, default: 0 },
  eventDate: { type: Date, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  detail: { type: String, default: '', maxlength: 500 },
  reference: { type: String, required: true, unique: true },
  oldData: { type: Schema.Types.Mixed, default: null },
  newData: { type: Schema.Types.Mixed, default: null },
  ipAddress: { type: String, default: '' },
}, { timestamps: true });
activitySchema.index({ eventDate: -1, kind: 1 });
activitySchema.index({ baseId: 1, eventDate: -1 });
activitySchema.index({ sourceBaseId: 1, destinationBaseId: 1, eventDate: -1 });

const stockLockSchema = new Schema({
  _id: { type: String },
  owner: { type: String, required: true },
  lockedUntil: { type: Date, required: true },
}, { versionKey: false });

export const Base = mongoose.models.Base || mongoose.model('Base', baseSchema);
export const Asset = mongoose.models.Asset || mongoose.model('Asset', assetSchema);
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const OpeningBalance = mongoose.models.OpeningBalance || mongoose.model('OpeningBalance', openingBalanceSchema);
export const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
export const StockLock = mongoose.models.StockLock || mongoose.model('StockLock', stockLockSchema);