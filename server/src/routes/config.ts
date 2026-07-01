import { Router } from 'express';
import { readServerConfig, writeServerConfig } from '../services/files';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const config = await readServerConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const values = req.body;
    if (!values || typeof values !== 'object') {
      return res.status(400).json({ error: 'Invalid config body' });
    }
    const stringValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      stringValues[key] = String(value);
    }
    await writeServerConfig(stringValues);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
