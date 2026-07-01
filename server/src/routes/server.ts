import { Router } from 'express';
import { getStatus, startServer, stopServer, restartServer } from '../services/docker';

const router = Router();

router.get('/status', async (_req, res, next) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/start', async (_req, res, next) => {
  try {
    await startServer();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', async (_req, res, next) => {
  try {
    await stopServer();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/restart', async (_req, res, next) => {
  try {
    await restartServer();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
