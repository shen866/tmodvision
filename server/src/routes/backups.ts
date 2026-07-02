import { Router, Request } from 'express';
import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  loadBackupConfig,
  saveBackupConfig,
} from '../services/backups';

const router = Router({ mergeParams: true });

router.get('/', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const backups = await listBackups(req.params.serverId);
    res.json(backups);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const { worldName } = req.body || {};
    const fileName = await createBackup(req.params.serverId, worldName ? String(worldName) : undefined);
    res.json({ success: true, fileName });
  } catch (err) {
    next(err);
  }
});

router.post('/:fileName/restore', async (req: Request<{ serverId: string; fileName: string }>, res, next) => {
  try {
    await restoreBackup(req.params.serverId, req.params.fileName);
    res.json({ success: true, message: '恢复完成，重启服务器后生效' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:fileName', async (req: Request<{ serverId: string; fileName: string }>, res, next) => {
  try {
    await deleteBackup(req.params.serverId, req.params.fileName);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/config', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const config = await loadBackupConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

router.post('/config', async (req: Request<{ serverId: string }>, res, next) => {
  try {
    const { enabled, intervalHours, keepCount } = req.body;
    await saveBackupConfig({
      enabled: Boolean(enabled),
      intervalHours: Number(intervalHours) || 6,
      keepCount: Number(keepCount) || 10,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
