import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { DATA_DIR } from '../config';
import { listServers, getServerPaths } from '../servers';
import { readServerConfig } from './files';

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
        const parsed = parseBackupName(f.name);
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

function parseBackupName(fileName: string): { serverId: string; worldName: string; createdAt: string } {
  // Expected format: <serverId>-<worldName>-<timestamp>.zip
  // timestamp: ISO string with : and . replaced by -
  const base = fileName.slice(0, -4);
  const lastDash = base.lastIndexOf('-');
  if (lastDash === -1) return { serverId: '', worldName: base, createdAt: '' };

  const timestampPart = base.slice(lastDash + 1);
  const rest = base.slice(0, lastDash);
  const secondLastDash = rest.lastIndexOf('-');
  if (secondLastDash === -1) return { serverId: '', worldName: rest, createdAt: timestampPart };

  // timestamp has multiple dashes due to ISO format replacement, so we need to find the actual split
  // ISO: 2026-07-02T16-24-06-500Z (after replacement)
  // We match from the end: timestamp ends with Z
  const timestampMatch = base.match(/-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z)$/);
  if (!timestampMatch) return { serverId: '', worldName: base, createdAt: '' };

  const timestamp = timestampMatch[1];
  const prefix = base.slice(0, -timestamp.length - 1);
  const firstDash = prefix.indexOf('-');
  if (firstDash === -1) return { serverId: '', worldName: prefix, createdAt: timestamp };

  return {
    serverId: prefix.slice(0, firstDash),
    worldName: prefix.slice(firstDash + 1),
    createdAt: timestamp,
  };
}

export async function createBackup(serverId: string, worldName?: string): Promise<string> {
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);

  let targetWorld = worldName;
  if (!targetWorld) {
    const config = await readServerConfig(serverId);
    targetWorld = config.worldname || config.world?.split('/').pop()?.replace('.wld', '') || 'world';
  }

  const wld = path.join(paths.worldsDir, `${targetWorld}.wld`);
  const twld = path.join(paths.worldsDir, `${targetWorld}.twld`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${server.id}-${targetWorld}-${timestamp}.zip`;
  const backupPath = path.join(paths.backupsDir, backupName);

  execSync(`zip -j "${backupPath}" "${wld}" "${twld}"`, { stdio: 'ignore' });
  return backupName;
}

export async function restoreBackup(serverId: string, fileName: string): Promise<void> {
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);

  const backupPath = path.join(paths.backupsDir, fileName);
  const parsed = parseBackupName(fileName);
  const worldName = parsed.worldName;

  // Auto-backup current world before restore
  try {
    await createBackup(serverId, worldName);
  } catch {
    // ignore if current world files missing
  }

  const wld = path.join(paths.worldsDir, `${worldName}.wld`);
  const twld = path.join(paths.worldsDir, `${worldName}.twld`);

  execSync(`unzip -o "${backupPath}" -d "${paths.worldsDir}"`, { stdio: 'ignore' });

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
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);
  await fs.unlink(path.join(paths.backupsDir, fileName));
}

export async function cleanupOldBackups(serverId: string, keepCount: number): Promise<void> {
  const backups = await listBackups(serverId);
  if (backups.length <= keepCount) return;

  const toDelete = backups.slice(keepCount);
  for (const backup of toDelete) {
    await deleteBackup(backup.serverId, backup.fileName);
  }
}

let schedulerStarted = false;

export async function startAutoBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const config = await loadBackupConfig();
  if (!config.enabled) return;

  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  setInterval(async () => {
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
