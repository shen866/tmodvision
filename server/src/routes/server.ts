import { Router, Request } from 'express';
import { getStatus, startServer, stopServer, restartServer } from '../services/docker';
import { readServerConfig } from '../services/files';
import { getOnlinePlayers } from '../services/players';

const router = Router({ mergeParams: true });

router.get('/status', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const { serverId } = req.params;
    const status = await getStatus(serverId);
    const config = await readServerConfig(serverId);
    res.json({
      ...status,
      port: config.port ? Number(config.port) : null,
      maxplayers: config.maxplayers ? Number(config.maxplayers) : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/start', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    await startServer(req.params.serverId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    await stopServer(req.params.serverId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/restart', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    await restartServer(req.params.serverId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/players', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const players = getOnlinePlayers(req.params.serverId);
    res.json({ count: players.length, players });
  } catch (err) {
    next(err);
  }
});

export default router;
