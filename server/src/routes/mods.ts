import { Router, Request } from 'express';
import {
  listInstalledMods,
  enableMod,
  disableMod,
  deleteMod,
} from '../services/files';
import { installWorkshopMod } from '../services/mods';
import { searchWorkshop } from '../services/workshop';

const router = Router({ mergeParams: true });

router.get('/', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const mods = await listInstalledMods(req.params.serverId);
    res.json(mods);
  } catch (err) {
    next(err);
  }
});

// Workshop routes must be registered before /:name so that a mod literally
// named "workshop" cannot shadow them.
router.get('/workshop/search', async (req: Request<{ serverId: string }>, res, next) => {
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

router.post('/workshop/install', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const { workshopId } = req.body;
    if (!workshopId) return res.status(400).json({ error: 'workshopId is required' });
    const result = await installWorkshopMod(req.params.serverId, String(workshopId));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:name/enable', async (req: Request<{ serverId: string; name: string }>, res, next) => {
  try {
    await enableMod(req.params.serverId, req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:name/disable', async (req: Request<{ serverId: string; name: string }>, res, next) => {
  try {
    await disableMod(req.params.serverId, req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:name', async (req: Request<{ serverId: string; name: string }>, res, next) => {
  try {
    await deleteMod(req.params.serverId, req.params.name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
