import express from 'express';
import path from 'path';
import { authMiddleware, login, logout } from './auth';
import { PORT } from './config';
import { ensureDirs } from './services/files';
import { cleanupOrphanedWorldCreators, operation } from './services/docker';
import { attachConsole } from './ws-console';
import { listServers } from './servers';
import { startAutoBackupScheduler } from './services/backups';
import { startPlayerPoller } from './services/players';

import serverRoutes from './routes/server';
import modsRoutes from './routes/mods';
import worldsRoutes from './routes/worlds';
import configRoutes from './routes/config';
import createRoutes from './routes/create';
import resourcesRoutes from './routes/resources';
import backupsRoutes from './routes/backups';

async function main() {
  await ensureDirs();
  await cleanupOrphanedWorldCreators();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/login', login);
  app.get('/api/auth/session', authMiddleware, (_req,res) => res.json({ valid:true }));
  app.post('/api/auth/logout', authMiddleware, logout);

  // Auth verification
  app.post('/api/auth/verify', authMiddleware, (_req, res) => res.json({ valid: true }));

  // Server list and creation
  app.use('/api/servers', authMiddleware, createRoutes);
  app.get('/api/servers', authMiddleware, async (_req, res, next) => {
    try {
      const servers = await listServers();
      res.json(servers);
    } catch (err) {
      next(err);
    }
  });

  // Per-server API routes
  const serverRouter = express.Router({ mergeParams: true });
  const writes = new Set<string>();
  serverRouter.use((req, res, next) => {
    const id = (req.params as {serverId: string}).serverId;
    if (req.method === 'GET') return next();
    if (writes.has(id) || operation(id).activity) return res.status(409).json({error: '此服正在执行其他操作，请稍后重试'});
    writes.add(id);
    res.once('finish', () => writes.delete(id));
    res.once('close', () => writes.delete(id));
    next();
  });
  serverRouter.use('/mods', modsRoutes);
  serverRouter.use('/worlds', worldsRoutes);
  serverRouter.use('/config', configRoutes);
  serverRouter.use('/backups', backupsRoutes);
  serverRouter.use('/', serverRoutes);

  app.use('/api/server/:serverId', authMiddleware, serverRouter);

  // Global resources
  app.use('/api/resources', authMiddleware, resourcesRoutes);

  // Unknown /api/* routes should return JSON 404, not the SPA HTML.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Serve React build
  const webDist = path.join(__dirname, 'public');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  const server = app.listen(PORT, () => {
    console.log(`tModVision server listening on port ${PORT}`);
  });

  attachConsole(server);
  startAutoBackupScheduler();
  startPlayerPoller();
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
