import jwt from 'jsonwebtoken';
import { User } from './models.js';

export async function authenticate(request, response, next) {
  const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return response.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('name email role baseId active');
    if (!user?.active) return response.status(401).json({ error: 'Account is unavailable' });
    request.user = user;
    next();
  } catch {
    response.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'This role is not permitted to perform this operation' });
    }
    next();
  };
}

export function requestedBaseScope(request, response, next) {
  if (request.user.role !== 'Base Commander') return next();
  const assignedBase = String(request.user.baseId);
  const body = request.body || {};
  const requestedBase = request.query.baseId || body.baseId;
  const transferSource = body.sourceBaseId;
  const requestedBases = [requestedBase, transferSource].filter(Boolean);
  if (requestedBases.some((baseId) => baseId !== assignedBase)) {
    return response.status(403).json({ error: 'Base Commanders are restricted to their assigned base' });
  }
  next();
}