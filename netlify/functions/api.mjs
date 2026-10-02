import mongoose from 'mongoose';
import serverless from 'serverless-http';
import app from '../../server/src/index.js';

const serverlessApp = serverless(app);
let connectionPromise;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 0) connectionPromise = undefined;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  await connectionPromise;
}

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  await connectDatabase();

  const functionPrefix = '/.netlify/functions/api';
  const requestPath = event.path || '/';
  const routePath = requestPath.startsWith(functionPrefix)
    ? requestPath.slice(functionPrefix.length) || '/'
    : requestPath;
  const path = routePath === '/api' || routePath.startsWith('/api/')
    ? routePath
    : `/api${routePath === '/' ? '' : routePath}`;

  return serverlessApp({ ...event, path }, context);
}