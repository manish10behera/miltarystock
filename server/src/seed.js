import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Activity, Asset, Base, OpeningBalance, User } from './models.js';

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fieldstock');
await Promise.all([Activity.deleteMany({}), OpeningBalance.deleteMany({}), User.deleteMany({}), Asset.deleteMany({}), Base.deleteMany({})]);

const bases = await Base.insertMany([
  { name: 'North Ridge', location: 'Northern District' },
  { name: 'Eastwatch', location: 'Eastern District' },
  { name: 'Forward Depot', location: 'Central Logistics Corridor' },
  { name: 'Southpoint', location: 'Southern District' },
]);
const assets = await Asset.insertMany([
  { name: 'Utility vehicle · M1151', code: 'VH-204', type: 'Vehicles', unit: 'units' },
  { name: 'Service rifle · M4A1', code: 'WP-118', type: 'Weapons', unit: 'units' },
  { name: '5.56 mm · M855A1', code: 'AM-056', type: 'Ammunition', unit: 'rounds' },
  { name: 'Tactical radio · AN/PRC-152', code: 'CM-091', type: 'Communications', unit: 'units' },
  { name: 'Cargo truck · FMTV', code: 'VH-317', type: 'Vehicles', unit: 'units' },
]);
const baseStock = [[38, 186, 2480, 74, 16], [24, 142, 1960, 51, 11], [31, 94, 3560, 66, 18], [19, 128, 1740, 43, 9]];
await OpeningBalance.insertMany(bases.flatMap((base, baseIndex) => assets.map((asset, assetIndex) => ({ baseId: base._id, assetId: asset._id, quantity: baseStock[baseIndex][assetIndex] }))));

const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || 'DemoPass!26', 12);
await User.insertMany([
  { name: 'Alex Morgan', email: process.env.DEMO_ADMIN_EMAIL || 'admin@fieldstock.demo', passwordHash, role: 'Admin' },
  { name: 'Maya Alvarez', email: process.env.DEMO_COMMANDER_EMAIL || 'commander@fieldstock.demo', passwordHash, role: 'Base Commander', baseId: bases[0]._id },
  { name: 'Jordan Carter', email: process.env.DEMO_LOGISTICS_EMAIL || 'logistics@fieldstock.demo', passwordHash, role: 'Logistics Officer' },
]);

const admin = await User.findOne({ role: 'Admin' });
const north = bases[0];
const seedEvents = [
  ['purchase', assets[2], north, null, null, 1200, '2026-09-26', 'Central Supply Depot'],
  ['transfer', assets[1], null, bases[1], north, 18, '2026-09-25', 'Rebalance request TR-203'],
  ['assignment', assets[3], north, null, null, 4, '2026-09-25', '2nd Recon · field exercise'],
  ['transfer', assets[0], null, north, bases[2], 2, '2026-09-24', 'Vehicle recovery support'],
  ['expenditure', assets[2], north, null, null, 240, '2026-09-23', 'Range qualification'],
  ['purchase', assets[3], bases[1], null, null, 12, '2026-09-22', 'Signal Systems LLC'],
].map(([kind, asset, base, sourceBase, destinationBase, quantity, date, detail]) => ({
  kind, action: 'CREATE', module: kind[0].toUpperCase() + kind.slice(1), assetId: asset._id,
  baseId: base?._id || null, sourceBaseId: sourceBase?._id || null,
  destinationBaseId: destinationBase?._id || null, quantity, eventDate: new Date(`${date}T12:00:00Z`),
  actorId: admin._id, reference: `SEED-${kind.toUpperCase()}-${date}-${asset.code}`,
  detail, newData: { kind, quantity, detail },
}));
await Activity.insertMany(seedEvents);
console.info('Seed complete. Demo password:', process.env.DEMO_PASSWORD || 'DemoPass!26');
console.info('Users: admin@fieldstock.demo, commander@fieldstock.demo, logistics@fieldstock.demo');
await mongoose.disconnect();