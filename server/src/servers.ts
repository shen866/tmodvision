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
  version?: string;
}

export const SERVERS_JSON_PATH = path.join(DATA_DIR, 'servers.json');

const CACHE_TTL_MS = 5000; // re-read at most every 5s so external edits are picked up
let cachedServers: ServerConfig[] | null = null;
let cachedAt = 0;

export async function loadServers(): Promise<ServerConfig[]> {
  if (cachedServers && Date.now() - cachedAt < CACHE_TTL_MS) return cachedServers;

  try {
    const raw = await fs.readFile(SERVERS_JSON_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ServerConfig[];
    cachedServers = parsed.map(normalizeServer);
    cachedAt = Date.now();
    return cachedServers;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    // No servers.json yet: user must create servers through the panel
    cachedServers = [];
    cachedAt = Date.now();
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
    version: s.version,
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

let registryTail = Promise.resolve();
export function editRegistry<T>(action: () => Promise<T>): Promise<T> {
  const next = registryTail.then(action);
  registryTail = next.then(() => {}, () => {});
  return next;
}

export async function saveServers(servers: ServerConfig[]) {
  await fs.writeFile(SERVERS_JSON_PATH + '.tmp', JSON.stringify(servers, null, 2));
  await fs.rename(SERVERS_JSON_PATH + '.tmp', SERVERS_JSON_PATH);
  invalidateServersCache();
}

export function checkPort(servers: ServerConfig[], id: string, port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1–65535 之间');
  if (servers.some(s => s.id !== id && s.port === port)) throw new Error('这个端口已分配给其他服务器');
}
