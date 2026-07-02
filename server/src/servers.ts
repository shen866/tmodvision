import fs from 'fs/promises';
import path from 'path';
import {
  TMOD_CONTAINER_NAME,
  DATA_DIR,
  STEAM_MODS_DIR,
  WORKSHOP_DIR,
} from './config';

export interface ServerConfig {
  id: string;
  name: string;
  containerName: string;
  composeDir: string;
  dataDir: string;
  port: number;
}

export const SERVERS_JSON_PATH = path.join(DATA_DIR, 'servers.json');

let cachedServers: ServerConfig[] | null = null;

export async function loadServers(): Promise<ServerConfig[]> {
  if (cachedServers) return cachedServers;

  try {
    const raw = await fs.readFile(SERVERS_JSON_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ServerConfig[];
    cachedServers = parsed.map(normalizeServer);
    return cachedServers;
  } catch {
    // Fallback to legacy single-server mode
    cachedServers = [
      normalizeServer({
        id: 'default',
        name: '默认服务器',
        containerName: TMOD_CONTAINER_NAME,
        composeDir: '/app',
        dataDir: DATA_DIR,
        port: 7777,
      }),
    ];
    return cachedServers;
  }
}

export function invalidateServersCache() {
  cachedServers = null;
}

export async function getServerById(id: string): Promise<ServerConfig> {
  const servers = await loadServers();
  const server = servers.find((s) => s.id === id);
  if (!server) throw new Error(`Server '${id}' not found`);
  return server;
}

export async function listServers(): Promise<ServerConfig[]> {
  return loadServers();
}

function normalizeServer(s: Partial<ServerConfig> & { id: string }): ServerConfig {
  return {
    id: s.id,
    name: s.name || s.id,
    containerName: s.containerName || TMOD_CONTAINER_NAME,
    composeDir: s.composeDir || '/app',
    dataDir: s.dataDir ? path.resolve(DATA_DIR, s.dataDir) : DATA_DIR,
    port: Number(s.port) || 7777,
  };
}

export function getServerPaths(server: ServerConfig) {
  const tmodDir = path.join(server.dataDir, 'tModLoader');
  return {
    dataDir: server.dataDir,
    tmodDir,
    modsDir: path.join(tmodDir, 'Mods'),
    worldsDir: path.join(tmodDir, 'Worlds'),
    backupsDir: path.join(tmodDir, 'backups'),
    serverConfigPath: path.join(tmodDir, 'serverconfig.txt'),
    enabledModsPath: path.join(tmodDir, 'Mods', 'enabled.json'),
    workshopMapPath: path.join(tmodDir, 'workshop-mods.json'),
    // steamMods is shared across servers to avoid duplicate downloads
    steamModsDir: STEAM_MODS_DIR,
    workshopDir: WORKSHOP_DIR,
  };
}

export function getServerPathsById(serverId: string): Promise<ReturnType<typeof getServerPaths>> {
  return getServerById(serverId).then(getServerPaths);
}
