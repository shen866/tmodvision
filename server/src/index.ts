import express from 'express';
import cors from 'cors';
import path from 'path';
import { authMiddleware } from './auth';
import { PORT } from './config';
import { ensureDirs } from './services/files';
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

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

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
  serverRouter.use('/mods', modsRoutes);
  serverRouter.use('/worlds', worldsRoutes);
  serverRouter.use('/config', configRoutes);
  serverRouter.use('/backups', backupsRoutes);
  serverRouter.use('/', serverRoutes);

  app.use('/api/server/:serverId', authMiddleware, serverRouter);

  // Global resources
  app.use('/api/resources', authMiddleware, resourcesRoutes);

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
