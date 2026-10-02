import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRole, requestedBaseScope } from './auth.js';
import { Activity, Asset, Base, OpeningBalance, StockLock, User } from './models.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-only-secret-change-me');
if (!jwtSecret) throw new Error('JWT_SECRET must be configured in production');
process.env.JWT_SECRET = jwtSecret;

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()) }));
app.use(express.json({ limit: '50kb' }));
app.use((request, response, next) => {
  const startedAt = Date.now();
  response.on('finish', () => console.info(JSON.stringify({
    type: 'http', method: request.method, path: request.path, status: response.statusCode,
    actor: request.user?.id || null, elapsedMs: Date.now() - startedAt,
  })));
  next();
});

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const movementKinds = ['purchase', 'transfer', 'assignment', 'expenditure'];
const dateSchema = z.coerce.date();
const movementSchema = z.object({
  assetId: z.string().min(1), baseId: z.string().min(1).optional(),
  sourceBaseId: z.string().min(1).optional(), destinationBaseId: z.string().min(1).optional(),
  quantity: z.coerce.number().int().positive(), eventDate: dateSchema,
  detail: z.string().trim().max(500).optional().default(''),
});

function invalidId(value) { return !mongoose.isValidObjectId(value); }
function baseFilter(user, queryBaseId) {
  if (user.role === 'Base Commander') return { $or: [{ baseId: user.baseId }, { sourceBaseId: user.baseId }, { destinationBaseId: user.baseId }] };
  if (queryBaseId) return { $or: [{ baseId: queryBaseId }, { sourceBaseId: queryBaseId }, { destinationBaseId: queryBaseId }] };
  return {};
}
function serializeActivity(activity) {
  const plain = activity.toObject ? activity.toObject() : activity;
  return { ...plain, actor: plain.actorId?.name || 'Unknown', asset: plain.assetId?.name || '', base: plain.baseId?.name || '', sourceBase: plain.sourceBaseId?.name || '', destinationBase: plain.destinationBaseId?.name || '' };
}
async function writeActivity(request, values) {
  const newData = {
    kind: values.kind, assetId: values.assetId || null, baseId: values.baseId || null,
    sourceBaseId: values.sourceBaseId || null, destinationBaseId: values.destinationBaseId || null,
    quantity: values.quantity || 0, eventDate: values.eventDate || new Date(), detail: values.detail || '',
  };
  return Activity.create({
    ...newData, action: values.action || 'CREATE', module: values.module,
    actorId: request.user._id, reference: `${values.kind.toUpperCase()}-${crypto.randomUUID()}`,
    oldData: values.oldData || null, newData, ipAddress: request.ip,
  });
}
async function parseMovement(request, response) {
  const parsed = movementSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid movement data', details: parsed.error.issues });
    return null;
  }
  if (parsed.data.assetId && invalidId(parsed.data.assetId)) {
    response.status(400).json({ error: 'Invalid assetId' });
    return null;
  }
  for (const key of ['baseId', 'sourceBaseId', 'destinationBaseId']) {
    if (parsed.data[key] && invalidId(parsed.data[key])) {
      response.status(400).json({ error: `Invalid ${key}` });
      return null;
    }
  }
  const asset = await Asset.findById(parsed.data.assetId);
  if (!asset) {
    response.status(404).json({ error: 'Asset not found' });
    return null;
  }
  return { ...parsed.data, asset };
}
async function resolveBaseIds(request, response, input, transfer = false) {
  const baseId = input.baseId || (request.user.role === 'Base Commander' ? String(request.user.baseId) : '');
  const sourceBaseId = transfer ? (input.sourceBaseId || baseId) : null;
  const destinationBaseId = transfer ? input.destinationBaseId : null;
  if ((!transfer && !baseId) || (transfer && (!sourceBaseId || !destinationBaseId))) {
    response.status(400).json({ error: 'A base must be selected' });
    return null;
  }
  if (transfer && sourceBaseId === destinationBaseId) {
    response.status(400).json({ error: 'Source and destination bases must be different' });
    return null;
  }
  const ids = [...new Set([baseId, sourceBaseId, destinationBaseId].filter(Boolean))];
  const found = await Base.find({ _id: { $in: ids } }).select('_id');
  if (found.length !== ids.length) {
    response.status(404).json({ error: 'Base not found' });
    return null;
  }
  return { baseId, sourceBaseId, destinationBaseId };
}
async function availableAt(assetId, baseId, eventDate) {
  const baseObjectId = new mongoose.Types.ObjectId(baseId);
  const assetObjectId = new mongoose.Types.ObjectId(assetId);
  const opening = await OpeningBalance.findOne({ baseId: baseObjectId, assetId: assetObjectId }).select('quantity').lean();
  const events = await Activity.aggregate([
    { $match: { assetId: assetObjectId, kind: { $in: movementKinds }, eventDate: { $lte: eventDate }, $or: [{ baseId: baseObjectId }, { sourceBaseId: baseObjectId }, { destinationBaseId: baseObjectId }] } },
    { $group: { _id: { kind: '$kind', baseId: '$baseId', sourceBaseId: '$sourceBaseId', destinationBaseId: '$destinationBaseId' }, total: { $sum: '$quantity' } } },
  ]);
  let available = opening?.quantity || 0;
  for (const event of events) {
    const { kind, baseId: eventBase, sourceBaseId, destinationBaseId } = event._id;
    if (kind === 'purchase' && String(eventBase) === baseId) available += event.total;
    if (kind === 'transfer') {
      if (String(destinationBaseId) === baseId) available += event.total;
      if (String(sourceBaseId) === baseId) available -= event.total;
    }
    if ((kind === 'assignment' || kind === 'expenditure') && String(eventBase) === baseId) available -= event.total;
  }
  return available;
}
async function withStockLocks(baseIds, assetId, operation) {
  const owner = crypto.randomUUID();
  const lockIds = [...new Set(baseIds)].sort().map((baseId) => `${baseId}:${assetId}`);
  const acquired = [];
  try {
    for (const lockId of lockIds) {
      let locked = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          const lock = await StockLock.findOneAndUpdate(
            { _id: lockId, $or: [{ lockedUntil: { $lte: new Date() } }, { owner }] },
            { $set: { owner, lockedUntil: new Date(Date.now() + 30000) } },
            { new: true, upsert: true },
          );
          if (lock?.owner === owner) {
            acquired.push(lockId);
            locked = true;
            break;
          }
        } catch (error) {
          if (error.code !== 11000) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!locked) {
        const error = new Error('This stock is being updated. Try again shortly.');
        error.status = 409;
        throw error;
      }
    }
    return await operation();
  } finally {
    if (acquired.length) await StockLock.deleteMany({ _id: { $in: acquired }, owner });
  }
}

app.get('/api/health', (request, response) => response.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.post('/api/auth/login', loginLimit, async (request, response) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(request.body);
  if (!body.success) return response.status(400).json({ error: 'Enter a valid email and password' });
  const user = await User.findOne({ email: body.data.email.toLowerCase() }).select('+passwordHash name email role baseId active');
  if (!user?.active || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
    return response.status(401).json({ error: 'Email or password is incorrect' });
  }
  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '8h', issuer: 'fieldstock-api', audience: 'fieldstock-client' });
  await Activity.create({ kind: 'system', action: 'LOGIN', module: 'Authentication', actorId: user._id, eventDate: new Date(), reference: `LOGIN-${crypto.randomUUID()}`, detail: 'Successful sign-in', ipAddress: request.ip });
  response.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, baseId: user.baseId } });
});
app.get('/api/auth/me', authenticate, async (request, response) => response.json({ user: request.user }));

app.use('/api', authenticate);
app.get('/api/bases', async (request, response) => {
  const filter = request.user.role === 'Base Commander' ? { _id: request.user.baseId } : {};
  response.json(await Base.find(filter).sort('name').lean());
});
app.get('/api/assets', async (request, response) => response.json(await Asset.find().sort('type name').lean()));

app.get('/api/dashboard', requestedBaseScope, async (request, response) => {
  const endDate = request.query.endDate ? new Date(request.query.endDate) : new Date();
  const startDate = request.query.startDate ? new Date(request.query.startDate) : new Date(endDate.getTime() - 30 * 86400000);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate) return response.status(400).json({ error: 'Invalid date range' });
  if (request.query.baseId && invalidId(request.query.baseId)) return response.status(400).json({ error: 'Invalid baseId' });
  if (request.query.assetType && !['Vehicles', 'Weapons', 'Ammunition', 'Communications'].includes(request.query.assetType)) return response.status(400).json({ error: 'Invalid assetType' });
  let selectedBaseIds = request.user.role === 'Base Commander' ? [request.user.baseId] : request.query.baseId ? [new mongoose.Types.ObjectId(request.query.baseId)] : (await Base.find().distinct('_id'));
  let assetFilter = {};
  if (request.query.assetType) assetFilter.type = request.query.assetType;
  const assetIds = await Asset.find(assetFilter).distinct('_id');
  const openingDocs = await OpeningBalance.find({ baseId: { $in: selectedBaseIds }, assetId: { $in: assetIds } }).lean();
  let opening = openingDocs.reduce((sum, item) => sum + item.quantity, 0);
  const matches = await Activity.aggregate([
    { $match: { kind: { $in: movementKinds }, eventDate: { $lte: endDate }, assetId: { $in: assetIds }, $or: [{ baseId: { $in: selectedBaseIds } }, { sourceBaseId: { $in: selectedBaseIds } }, { destinationBaseId: { $in: selectedBaseIds } }] } },
    { $group: { _id: { kind: '$kind', baseId: '$baseId', sourceBaseId: '$sourceBaseId', destinationBaseId: '$destinationBaseId', phase: { $cond: [{ $lt: ['$eventDate', startDate] }, 'prior', 'period'] } }, total: { $sum: '$quantity' } } },
  ]);
  let netMovement = 0;
  let assigned = 0;
  let expended = 0;
  for (const row of matches) {
    const { kind, baseId, sourceBaseId, destinationBaseId, phase } = row._id;
    const selected = new Set(selectedBaseIds.map(String));
    let delta = 0;
    if (kind === 'purchase' && selected.has(String(baseId))) delta = row.total;
    if (kind === 'transfer') delta = (selected.has(String(destinationBaseId)) ? row.total : 0) - (selected.has(String(sourceBaseId)) ? row.total : 0);
    if (kind === 'assignment' && selected.has(String(baseId))) delta = -row.total;
    if (kind === 'expenditure' && selected.has(String(baseId))) delta = -row.total;
    if (phase === 'prior') opening += delta;
    else {
      if (['purchase', 'transfer'].includes(kind)) netMovement += delta;
      if (kind === 'assignment' && selected.has(String(baseId))) assigned += row.total;
      if (kind === 'expenditure' && selected.has(String(baseId))) expended += row.total;
    }
  }
  const closing = opening + netMovement - assigned - expended;
  response.json({ openingBalance: opening, closingBalance: closing, netMovement, assigned, expended, baseIds: selectedBaseIds, startDate, endDate });
});

app.get('/api/inventory', requestedBaseScope, async (request, response) => {
  if (request.query.baseId && invalidId(request.query.baseId)) return response.status(400).json({ error: 'Invalid baseId' });
  const baseIds = request.user.role === 'Base Commander' ? [request.user.baseId] : request.query.baseId ? [new mongoose.Types.ObjectId(request.query.baseId)] : await Base.find().distinct('_id');
  const assetFilter = request.query.assetType ? { type: request.query.assetType } : {};
  const assets = await Asset.find(assetFilter).sort('type name').lean();
  const opening = await OpeningBalance.find({ baseId: { $in: baseIds }, assetId: { $in: assets.map((asset) => asset._id) } }).lean();
  const events = await Activity.aggregate([
    { $match: { kind: { $in: movementKinds }, eventDate: { $lte: new Date() }, assetId: { $in: assets.map((asset) => asset._id) }, $or: [{ baseId: { $in: baseIds } }, { sourceBaseId: { $in: baseIds } }, { destinationBaseId: { $in: baseIds } }] } },
    { $group: { _id: { kind: '$kind', assetId: '$assetId', baseId: '$baseId', sourceBaseId: '$sourceBaseId', destinationBaseId: '$destinationBaseId' }, total: { $sum: '$quantity' } } },
  ]);
  const quantities = new Map();
  const add = (baseId, assetId, amount) => {
    const key = `${baseId}:${assetId}`;
    quantities.set(key, (quantities.get(key) || 0) + amount);
  };
  opening.forEach((row) => add(row.baseId, row.assetId, row.quantity));
  events.forEach((event) => {
    const { kind, assetId, baseId, sourceBaseId, destinationBaseId } = event._id;
    if (kind === 'purchase') add(baseId, assetId, event.total);
    if (kind === 'transfer') { add(sourceBaseId, assetId, -event.total); add(destinationBaseId, assetId, event.total); }
    if (kind === 'assignment' || kind === 'expenditure') add(baseId, assetId, -event.total);
  });
  const basesForResponse = await Base.find({ _id: { $in: baseIds } }).sort('name').lean();
  response.json(basesForResponse.flatMap((base) => assets.map((asset) => ({ base, asset, available: quantities.get(`${base._id}:${asset._id}`) || 0 }))));
});

app.get('/api/movements', requestedBaseScope, async (request, response) => {
  if (request.query.baseId && invalidId(request.query.baseId)) return response.status(400).json({ error: 'Invalid baseId' });
  const filter = { ...baseFilter(request.user, request.query.baseId) };
  if (request.query.kind && movementKinds.includes(request.query.kind)) filter.kind = request.query.kind;
  if (request.query.assetId) {
    if (invalidId(request.query.assetId)) return response.status(400).json({ error: 'Invalid assetId' });
    filter.assetId = request.query.assetId;
  }
  if (request.query.assetType) {
    if (!['Vehicles', 'Weapons', 'Ammunition', 'Communications'].includes(request.query.assetType)) return response.status(400).json({ error: 'Invalid assetType' });
    filter.assetId = { $in: await Asset.find({ type: request.query.assetType }).distinct('_id') };
  }
  if (request.query.startDate || request.query.endDate) {
    filter.eventDate = {};
    if (request.query.startDate) {
      filter.eventDate.$gte = new Date(request.query.startDate);
      if (!Number.isFinite(filter.eventDate.$gte.getTime())) return response.status(400).json({ error: 'Invalid startDate' });
    }
    if (request.query.endDate) {
      filter.eventDate.$lte = new Date(request.query.endDate);
      if (!Number.isFinite(filter.eventDate.$lte.getTime())) return response.status(400).json({ error: 'Invalid endDate' });
    }
  }
  if (request.user.role === 'Logistics Officer') filter.kind = { $in: ['purchase', 'transfer'] };
  const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);
  const events = await Activity.find(filter).sort({ eventDate: -1, createdAt: -1 }).limit(limit).populate('actorId', 'name').populate('assetId', 'name code type unit').populate('baseId', 'name').populate('sourceBaseId', 'name').populate('destinationBaseId', 'name').lean();
  response.json(events.map(serializeActivity));
});

app.get('/api/audit', requireRole('Admin', 'Base Commander'), async (request, response) => {
  const filter = baseFilter(request.user, request.query.baseId);
  if (request.query.baseId && invalidId(request.query.baseId)) return response.status(400).json({ error: 'Invalid baseId' });
  if (request.query.startDate || request.query.endDate) {
    filter.eventDate = {};
    if (request.query.startDate) filter.eventDate.$gte = new Date(request.query.startDate);
    if (request.query.endDate) filter.eventDate.$lte = new Date(request.query.endDate);
    if (Object.values(filter.eventDate).some((date) => !Number.isFinite(date.getTime()))) return response.status(400).json({ error: 'Invalid date range' });
  }
  if (request.query.assetType) {
    if (!['Vehicles', 'Weapons', 'Ammunition', 'Communications'].includes(request.query.assetType)) return response.status(400).json({ error: 'Invalid assetType' });
    filter.assetId = { $in: await Asset.find({ type: request.query.assetType }).distinct('_id') };
  }
  const events = await Activity.find(filter).sort({ createdAt: -1 }).limit(200).populate('actorId', 'name email role').populate('assetId', 'name code').populate('baseId', 'name').populate('sourceBaseId', 'name').populate('destinationBaseId', 'name').lean();
  response.json(events.map(serializeActivity));
});

app.post('/api/purchases', requestedBaseScope, requireRole('Admin', 'Base Commander', 'Logistics Officer'), async (request, response) => {
  const input = await parseMovement(request, response);
  if (!input) return;
  const bases = await resolveBaseIds(request, response, input);
  if (!bases) return;
  const event = await writeActivity(request, { ...bases, kind: 'purchase', module: 'Purchase', assetId: input.asset._id, quantity: input.quantity, eventDate: input.eventDate, detail: input.detail });
  response.status(201).json({ movement: serializeActivity(await event.populate(['actorId', 'assetId', 'baseId'])), reference: event.reference });
});

app.post('/api/transfers', requestedBaseScope, requireRole('Admin', 'Base Commander', 'Logistics Officer'), async (request, response) => {
  const input = await parseMovement(request, response);
  if (!input) return;
  const bases = await resolveBaseIds(request, response, input, true);
  if (!bases) return;
  const event = await withStockLocks([bases.sourceBaseId, bases.destinationBaseId], input.asset._id, async () => {
    const available = await availableAt(input.asset._id, bases.sourceBaseId, input.eventDate);
    if (input.quantity > available) {
      const error = new Error(`Insufficient stock at source base. Available: ${available}`);
      error.status = 409;
      throw error;
    }
    return writeActivity(request, { ...bases, kind: 'transfer', module: 'Transfer', assetId: input.asset._id, quantity: input.quantity, eventDate: input.eventDate, detail: input.detail });
  });
  response.status(201).json({ movement: serializeActivity(await event.populate(['actorId', 'assetId', 'sourceBaseId', 'destinationBaseId'])), reference: event.reference });
});

app.post('/api/assignments', requestedBaseScope, requireRole('Admin', 'Base Commander'), async (request, response) => {
  const input = await parseMovement(request, response);
  if (!input) return;
  const bases = await resolveBaseIds(request, response, input);
  if (!bases) return;
  const event = await withStockLocks([bases.baseId], input.asset._id, async () => {
    const available = await availableAt(input.asset._id, bases.baseId, input.eventDate);
    if (input.quantity > available) {
      const error = new Error(`Insufficient stock at base. Available: ${available}`);
      error.status = 409;
      throw error;
    }
    return writeActivity(request, { ...bases, kind: 'assignment', module: 'Assignment', assetId: input.asset._id, quantity: input.quantity, eventDate: input.eventDate, detail: input.detail });
  });
  response.status(201).json({ movement: serializeActivity(await event.populate(['actorId', 'assetId', 'baseId'])), reference: event.reference });
});

app.post('/api/expenditures', requestedBaseScope, requireRole('Admin', 'Base Commander'), async (request, response) => {
  const input = await parseMovement(request, response);
  if (!input) return;
  const bases = await resolveBaseIds(request, response, input);
  if (!bases) return;
  const event = await withStockLocks([bases.baseId], input.asset._id, async () => {
    const available = await availableAt(input.asset._id, bases.baseId, input.eventDate);
    if (input.quantity > available) {
      const error = new Error(`Insufficient stock at base. Available: ${available}`);
      error.status = 409;
      throw error;
    }
    return writeActivity(request, { ...bases, kind: 'expenditure', module: 'Expenditure', assetId: input.asset._id, quantity: input.quantity, eventDate: input.eventDate, detail: input.detail });
  });
  response.status(201).json({ movement: serializeActivity(await event.populate(['actorId', 'assetId', 'baseId'])), reference: event.reference });
});

app.use((error, request, response, next) => {
  console.error(JSON.stringify({ type: 'error', path: request.path, message: error.message }));
  if (response.headersSent) return next(error);
  response.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' });
});

export default app;