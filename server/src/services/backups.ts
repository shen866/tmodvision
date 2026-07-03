import fs from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';
import { DATA_DIR } from '../config';
import { listServers, getServerPaths } from '../servers';
import { readServerConfig } from './files';
import { assertSafeName, assertWithinBase } from '../lib/safe';

export interface BackupInfo {
  fileName: string;
  serverId: string;
  worldName: string;
  createdAt: string;
  size: number;
}

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number;
  keepCount: number;
}

const BACKUP_CONFIG_PATH = path.join(DATA_DIR, 'backup-config.json');
const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  intervalHours: 6,
  keepCount: 10,
};

export async function loadBackupConfig(): Promise<BackupConfig> {
  try {
    const raw = await fs.readFile(BACKUP_CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveBackupConfig(config: BackupConfig): Promise<void> {
  await fs.writeFile(BACKUP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function listBackups(serverId?: string): Promise<BackupInfo[]> {
  const servers = serverId ? [(await listServers()).find((s) => s.id === serverId)!].filter(Boolean) : await listServers();
  const results: BackupInfo[] = [];

  for (const server of servers) {
    if (!server) continue;
    const paths = getServerPaths(server);
    try {
      const files = await fs.readdir(paths.backupsDir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || !f.name.endsWith('.zip')) continue;
        const stat = await fs.stat(path.join(paths.backupsDir, f.name));
        const parsed = parseBackupName(f.name, server.id);
        results.push({
          fileName: f.name,
          serverId: parsed.serverId || server.id,
          worldName: parsed.worldName,
          createdAt: parsed.createdAt,
          size: stat.size,
        });
      }
    } catch {
      // ignore missing backups dir
    }
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseBackupName(
  fileName: string,
  knownServerId?: string
): { serverId: string; worldName: string; createdAt: string } {
  // Expected format: <serverId>-<worldName>-<timestamp>.zip
  // timestamp: ISO string with : and . replaced by -, e.g. 2026-07-02T16-24-06-500Z
  const base = fileName.slice(0, -4);

  // Match the timestamp suffix (anchored at end, unambiguous).
  const timestampMatch = base.match(/-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)$/);
  if (!timestampMatch) return { serverId: '', worldName: base, createdAt: '' };

  const rawTs = timestampMatch[1];
  // Reconstruct a valid ISO timestamp: 2026-07-02T16-24-06-500Z → 2026-07-02T16:24:06.500Z
  const isoTs = rawTs.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/,
    '$1-$2-$3T$4:$5:$6.$7Z'
  );
  const createdAt = Number.isNaN(Date.parse(isoTs)) ? '' : isoTs;

  // Remaining prefix is <serverId>-<worldName>.
  const prefix = base.slice(0, -(rawTs.length + 1));

  // If we know the server ID (listing per-server), strip it directly so that
  // dashes in either the serverId or worldName don't break the split.
  if (knownServerId && prefix.startsWith(knownServerId + '-')) {
    return {
      serverId: knownServerId,
      worldName: prefix.slice(knownServerId.length + 1),
      createdAt,
    };
  }

  // Fallback for cross-server listing: split at first dash. serverId is
  // sanitized to [a-zA-Z0-9_-], so this is only ambiguous when serverId
  // itself contains a dash — in that case the caller should pass
  // knownServerId for correctness.
  const firstDash = prefix.indexOf('-');
  if (firstDash === -1) {
    return { serverId: '', worldName: prefix, createdAt };
  }
  return {
    serverId: prefix.slice(0, firstDash),
    worldName: prefix.slice(firstDash + 1),
    createdAt,
  };
}

export async function createBackup(serverId: string, worldName?: string): Promise<string> {
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);

  let targetWorld = worldName;
  if (targetWorld) {
    assertSafeName(targetWorld, 'world name');
  } else {
    const config = await readServerConfig(serverId);
    targetWorld = config.worldname || config.world?.split('/').pop()?.replace('.wld', '') || 'world';
  }

  const wld = path.join(paths.worldsDir, `${targetWorld}.wld`);
  const twld = path.join(paths.worldsDir, `${targetWorld}.twld`);
  assertWithinBase(wld, paths.worldsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${server.id}-${targetWorld}-${timestamp}.zip`;
  const backupPath = path.join(paths.backupsDir, backupName);
  assertWithinBase(backupPath, paths.backupsDir);

  const { mkdirSync } = await import('fs');
  mkdirSync(paths.backupsDir, { recursive: true });
  // execFileSync with argv — no shell, so worldName cannot inject commands.
  execFileSync('zip', ['-j', backupPath, wld, twld], { stdio: 'ignore' });
  return backupName;
}

export async function restoreBackup(serverId: string, fileName: string): Promise<void> {
  assertSafeName(fileName, 'backup file name');
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);

  const backupPath = path.join(paths.backupsDir, fileName);
  assertWithinBase(backupPath, paths.backupsDir);
  const parsed = parseBackupName(fileName, server.id);
  const worldName = parsed.worldName;

  // Auto-backup current world before restore
  try {
    await createBackup(serverId, worldName);
  } catch {
    // ignore if current world files missing
  }

  const wld = path.join(paths.worldsDir, `${worldName}.wld`);
  assertWithinBase(wld, paths.worldsDir);

  // execFileSync with argv — no shell, so fileName cannot inject commands.
  execFileSync('unzip', ['-o', backupPath, '-d', paths.worldsDir], { stdio: 'ignore' });

  // Ensure restored files have correct names (zip contains worldName.wld and worldName.twld)
  // Update serverconfig.txt to point to restored world
  const { writeServerConfig } = await import('./files');
  const config = await readServerConfig(serverId);
  config.world = wld;
  config.worldpath = paths.worldsDir + '/';
  config.worldname = worldName;
  await writeServerConfig(serverId, config);
}

export async function deleteBackup(serverId: string, fileName: string): Promise<void> {
  assertSafeName(fileName, 'backup file name');
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);
  const backupPath = path.join(paths.backupsDir, fileName);
  assertWithinBase(backupPath, paths.backupsDir);
  await fs.unlink(backupPath);
}

export async function cleanupOldBackups(serverId: string, keepCount: number): Promise<void> {
  const backups = await listBackups(serverId);
  if (backups.length <= keepCount) return;

  const toDelete = backups.slice(keepCount);
  for (const backup of toDelete) {
    await deleteBackup(backup.serverId, backup.fileName);
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerStarted = false;

export async function startAutoBackupScheduler() {
  // Always (re)read config so runtime changes take effect.
  const config = await loadBackupConfig();

  // Clear any existing timer before (re)scheduling.
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (!config.enabled) return;

  schedulerStarted = true;
  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  schedulerTimer = setInterval(async () => {
    const servers = await listServers();
    for (const server of servers) {
      try {
        await createBackup(server.id);
        await cleanupOldBackups(server.id, config.keepCount);
      } catch (err) {
        console.error(`Auto backup failed for ${server.id}:`, err);
      }
    }
  }, intervalMs);
}

/** Re-apply the scheduler after config changes. */
export async function restartAutoBackupScheduler() {
  return startAutoBackupScheduler();
}
