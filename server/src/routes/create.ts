import { Router } from 'express';
import { createServer } from '../services/create';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { id, name, port, dataDir, composeDir, copyModsFrom, world } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!port || Number.isNaN(Number(port))) {
      return res.status(400).json({ error: 'port is required' });
    }

    const server = await createServer({
      id,
      name,
      port: Number(port),
      dataDir,
      composeDir,
      copyModsFrom,
      world: world
        ? {
            name: world.name,
            size: Number(world.size) || 2,
            difficulty: Number(world.difficulty) || 0,
            seed: world.seed,
          }
        : undefined,
    });

    res.json({ success: true, server });
  } catch (err) {
    next(err);
  }
});

export default router;
