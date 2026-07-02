import fs from 'fs/promises';
import path from 'path';
import { listServers, getServerPaths } from '../servers';
import { readEnabledMods, listInstalledMods } from './files';
import { WORKSHOP_DIR } from '../config';

export interface DiskUsage {
  serverId: string;
  serverName: string;
  total: number;
  worlds: number;
  mods: number;
  backups: number;
  steamMods: number;
}

export interface TotalUsage {
  total: number;
  steamMods: number;
  servers: DiskUsage[];
}

export interface OrphanedMod {
  workshopId: string;
  internalNames: string[];
  size: number;
  sharedBy: string[];
}

async function getDirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
  } catch {
    // ignore missing dirs
  }
  return total;
}

export async function getDiskUsage(serverId: string): Promise<DiskUsage> {
  const server = (await listServers()).find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);
  const paths = getServerPaths(server);

  const [total, worlds, mods, backups, steamMods] = await Promise.all([
    getDirSize(server.dataDir),
    getDirSize(paths.worldsDir),
    getDirSize(paths.modsDir),
    getDirSize(paths.backupsDir),
    getDirSize(paths.steamModsDir),
  ]);

  return {
    serverId: server.id,
    serverName: server.name,
    total,
    worlds,
    mods,
    backups,
    steamMods,
  };
}

export async function getTotalUsage(): Promise<TotalUsage> {
  const servers = await listServers();
  const serverUsages = await Promise.all(servers.map((s) => getDiskUsage(s.id)));

  // steamMods is shared, count once from any server path (they all point to same dir)
  const sharedSteamMods = servers.length > 0 ? serverUsages[0].steamMods : 0;

  // Total = sum of server data dirs (excluding shared steamMods double count) + shared steamMods once
  const total =
    serverUsages.reduce((sum, u) => sum + u.total - u.steamMods, 0) + sharedSteamMods;

  return {
    total,
    steamMods: sharedSteamMods,
    servers: serverUsages,
  };
}

export async function findOrphanedSteamMods(): Promise<OrphanedMod[]> {
  const servers = await listServers();

  // Build a map of enabled internal names per server
  const enabledByServer: Record<string, Set<string>> = {};
  for (const server of servers) {
    const enabled = await readEnabledMods(server.id);
    enabledByServer[server.id] = new Set(enabled);
  }

  const entries: OrphanedMod[] = [];
  try {
    const workshopIds = await fs.readdir(WORKSHOP_DIR, { withFileTypes: true });
    for (const dir of workshopIds) {
      if (!dir.isDirectory()) continue;
      const workshopId = dir.name;
      const workshopPath = path.join(WORKSHOP_DIR, workshopId);

      // Find all .tmod files in this workshop directory
      const tmodFiles = await findTmodFiles(workshopPath);
      const internalNames = tmodFiles.map((f) => path.basename(f, '.tmod'));

      // Check if any internal name is enabled in any server
      const sharedBy: string[] = [];
      for (const server of servers) {
        const enabled = enabledByServer[server.id];
        if (internalNames.some((name) => enabled.has(name))) {
          sharedBy.push(server.id);
        }
      }

      if (sharedBy.length === 0) {
        const size = await getDirSize(workshopPath);
        entries.push({ workshopId, internalNames, size, sharedBy: [] });
      }
    }
  } catch {
    // ignore if workshop dir missing
  }

  return entries.sort((a, b) => b.size - a.size);
}

async function findTmodFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findTmodFiles(fullPath)));
      } else if (entry.name.endsWith('.tmod')) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

export async function cleanupSteamMods(workshopIds: string[]): Promise<{ freed: number }> {
  const orphans = await findOrphanedSteamMods();
  const orphanIds = new Set(orphans.map((o) => o.workshopId));

  let freed = 0;
  for (const id of workshopIds) {
    if (!orphanIds.has(id)) {
      throw new Error(`Workshop item ${id} is still in use and cannot be deleted`);
    }
    const dir = path.join(WORKSHOP_DIR, id);
    const size = await getDirSize(dir);
    await fs.rm(dir, { recursive: true, force: true });
    freed += size;
  }

  return { freed };
}
