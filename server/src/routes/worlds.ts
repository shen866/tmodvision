import { Router, Request } from 'express';
import {
  listWorlds,
  deleteWorld,
  backupWorld,
  setActiveWorld,
} from '../services/files';
import { createWorld } from '../services/docker';

const router = Router({ mergeParams: true });

router.get('/', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const worlds = await listWorlds(req.params.serverId);
    res.json(worlds);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const { name, size = 2, difficulty = 0, seed } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    // World creation can take minutes — run it in the background and
    // return immediately so the HTTP request doesn't time out.
    createWorld(
      req.params.serverId,
      name,
      Number(size),
      Number(difficulty),
      seed ? String(seed) : undefined
    ).catch((err) => {
      console.error(`Background world creation failed for ${req.params.serverId}:`, err);
    });
    res.json({ success: true, message: '世界创建已在后台开始，请稍后刷新查看' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:name', async (req: Request<{ serverId: string; name: string }>, res, next) => {
  try {
    await deleteWorld(req.params.serverId, req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:name/backup', async (req: Request<{ serverId: string; name: string }>, res, next) => {
  try {
    const fileName = await backupWorld(req.params.serverId, req.params.name);
    res.json({ success: true, fileName });
  } catch (err) {
    next(err);
  }
});

router.post('/:name/activate', async (req: Request<{ serverId: string; name: string }>, res, next) => {
  try {
    await setActiveWorld(req.params.serverId, req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
