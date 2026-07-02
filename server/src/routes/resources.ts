import { Router } from 'express';
import { getTotalUsage, findOrphanedSteamMods, cleanupSteamMods } from '../services/resources';

const router = Router();

router.get('/usage', async (_req, res, next) => {
  try {
    const usage = await getTotalUsage();
    res.json(usage);
  } catch (err) {
    next(err);
  }
});

router.get('/orphans', async (_req, res, next) => {
  try {
    const orphans = await findOrphanedSteamMods();
    res.json(orphans);
  } catch (err) {
    next(err);
  }
});

router.post('/cleanup', async (req, res, next) => {
  try {
    const { workshopIds } = req.body;
    if (!Array.isArray(workshopIds) || workshopIds.length === 0) {
      return res.status(400).json({ error: 'workshopIds array is required' });
    }
    const result = await cleanupSteamMods(workshopIds.map(String));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
