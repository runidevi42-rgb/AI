import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { errorHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { webhookRouter } from './routes/webhook.js';
import { startScheduler } from './services/scheduler.js';
import { assertDatabaseConnection } from './lib/supabase.js';

const app = express();
const allowedOrigins = new Set([
  config.APP_URL,
  ...config.CLIENT_URL.split(',').map((origin) => origin.trim()),
].filter(Boolean));
const corsOptions: CorsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
};

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.use(pinoHttp({ logger }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), authRouter);
app.use('/api/admin', rateLimit({ windowMs: 60_000, limit: 300 }), adminRouter);
app.use('/webhook/whatsapp', webhookRouter);
if (config.NODE_ENV !== 'production') {
  app.get('/', (_req, res) => res.json({
    status: 'ok',
    service: 'CampusMate AI backend',
    health: '/api/health',
  }));
}
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'campusmate-api', timestamp: new Date().toISOString() }));
app.get('/api/health/database', async (_req, res) => {
  try {
    await assertDatabaseConnection();
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable or incomplete' });
  }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use('/webhook', (_req, res) => res.status(404).json({ error: 'Webhook route not found' }));

if (config.NODE_ENV === 'production') {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientPath = path.resolve(dirname, '../../dist');
  app.use(express.static(clientPath));
  app.get('*splat', (_req, res) => res.sendFile(path.join(clientPath, 'index.html')));
}
app.use(errorHandler);

app.listen(config.PORT, '0.0.0.0', () => {
  logger.info({ port: config.PORT }, 'CampusMate server started');
  startScheduler();
});
