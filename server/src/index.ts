import express from 'express';
import cors from 'cors';
import path from 'path';
import { authMiddleware } from './auth';
import { PORT } from './config';
import { ensureDirs } from './services/files';
import { attachConsole } from './ws-console';

import serverRoutes from './routes/server';
import modsRoutes from './routes/mods';
import worldsRoutes from './routes/worlds';
import configRoutes from './routes/config';

async function main() {
  await ensureDirs();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Auth verification
  app.post('/api/auth/verify', authMiddleware, (_req, res) => res.json({ valid: true }));

  // Protected API routes
  app.use('/api/server', authMiddleware, serverRoutes);
  app.use('/api/mods', authMiddleware, modsRoutes);
  app.use('/api/worlds', authMiddleware, worldsRoutes);
  app.use('/api/config', authMiddleware, configRoutes);

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
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
