import { Router } from 'express';
import {
  listInstalledMods,
  enableMod,
  disableMod,
  deleteMod,
} from '../services/files';
import { installWorkshopMod } from '../services/mods';
import { searchWorkshop } from '../services/workshop';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const mods = await listInstalledMods();
    res.json(mods);
  } catch (err) {
    next(err);
  }
});

router.post('/:name/enable', async (req, res, next) => {
  try {
    await enableMod(req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:name/disable', async (req, res, next) => {
  try {
    await disableMod(req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:name', async (req, res, next) => {
  try {
    await deleteMod(req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/workshop/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    const page = Number(req.query.page || 1);
    if (!q) return res.status(400).json({ error: 'Query is required' });
    const results = await searchWorkshop(q, page);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.post('/workshop/install', async (req, res, next) => {
  try {
    const { workshopId } = req.body;
    if (!workshopId) return res.status(400).json({ error: 'workshopId is required' });
    const result = await installWorkshopMod(String(workshopId));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
