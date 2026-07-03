import fs from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';
import { listServers, getServerById, getServerPaths } from '../servers';
import { assertSafeName, assertWithinBase } from '../lib/safe';

export interface ModInfo {
  name: string;
  enabled: boolean;
  size: number;
  mtime: Date;
}

export interface WorldInfo {
  name: string;
  size: number;
  mtime: Date;
}

export interface WorkshopMap {
  [workshopId: string]: { fileName: string };
}

export async function ensureDirs() {
  const servers = await listServers();
  for (const server of servers) {
    const paths = getServerPaths(server);
    await fs.mkdir(paths.modsDir, { recursive: true });
    await fs.mkdir(paths.worldsDir, { recursive: true });
    await fs.mkdir(paths.backupsDir, { recursive: true });
    await fs.mkdir(paths.workshopDir, { recursive: true });
  }
}

export async function readEnabledMods(serverId: string): Promise<string[]> {
  const paths = getServerPaths(await resolveServer(serverId));
  try {
    const raw = await fs.readFile(paths.enabledModsPath, 'utf-8');
    return JSON.parse(raw) as string[];
  } catch {
    await fs.writeFile(paths.enabledModsPath, '[]');
    return [];
  }
}

export async function writeEnabledMods(serverId: string, mods: string[]) {
  const paths = getServerPaths(await resolveServer(serverId));
  await fs.writeFile(paths.enabledModsPath, JSON.stringify(mods, null, 2));
}

export async function listInstalledMods(serverId: string): Promise<ModInfo[]> {
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  const enabled = new Set(await readEnabledMods(serverId));
  const entries: ModInfo[] = [];
  try {
    const files = await fs.readdir(paths.modsDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.tmod')) continue;
      const stat = await fs.stat(path.join(paths.modsDir, f.name));
      const name = f.name.slice(0, -5);
      entries.push({
        name,
        enabled: enabled.has(name),
        size: stat.size,
        mtime: stat.mtime,
      });
    }
  } catch {
    // ignore
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function enableMod(serverId: string, name: string) {
  const mods = await readEnabledMods(serverId);
  if (!mods.includes(name)) {
    mods.push(name);
    await writeEnabledMods(serverId, mods);
  }
}

export async function disableMod(serverId: string, name: string) {
  const mods = await readEnabledMods(serverId);
  const idx = mods.indexOf(name);
  if (idx !== -1) {
    mods.splice(idx, 1);
    await writeEnabledMods(serverId, mods);
  }
}

export async function deleteMod(serverId: string, name: string) {
  assertSafeName(name, 'mod name');
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  await disableMod(serverId, name);
  const filePath = path.join(paths.modsDir, `${name}.tmod`);
  assertWithinBase(filePath, paths.modsDir);
  await fs.unlink(filePath);
}

export async function listWorlds(serverId: string): Promise<WorldInfo[]> {
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  const entries: WorldInfo[] = [];
  try {
    const files = await fs.readdir(paths.worldsDir, { withFileTypes: true });
    const seen = new Set<string>();
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.wld')) continue;
      const name = f.name.slice(0, -4);
      if (seen.has(name)) continue;
      seen.add(name);
      const stat = await fs.stat(path.join(paths.worldsDir, f.name));
      entries.push({ name, size: stat.size, mtime: stat.mtime });
    }
  } catch {
    // ignore
  }
  return entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export async function deleteWorld(serverId: string, name: string) {
  assertSafeName(name, 'world name');
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  const wld = path.join(paths.worldsDir, `${name}.wld`);
  const twld = path.join(paths.worldsDir, `${name}.twld`);
  const twldBak = path.join(paths.worldsDir, `${name}.twld.bak`);
  assertWithinBase(wld, paths.worldsDir);
  await fs.unlink(wld).catch(() => {});
  await fs.unlink(twld).catch(() => {});
  await fs.unlink(twldBak).catch(() => {});
}

export async function backupWorld(serverId: string, name: string): Promise<string> {
  assertSafeName(name, 'world name');
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  const wld = path.join(paths.worldsDir, `${name}.wld`);
  const twld = path.join(paths.worldsDir, `${name}.twld`);
  assertWithinBase(wld, paths.worldsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${server.id}-${name}-${timestamp}.zip`;
  const backupPath = path.join(paths.backupsDir, backupName);
  assertWithinBase(backupPath, paths.backupsDir);

  // Use execFileSync (argv array) — no shell, so names cannot inject commands.
  const { mkdirSync } = await import('fs');
  mkdirSync(paths.backupsDir, { recursive: true });
  execFileSync('zip', ['-j', backupPath, wld, twld], { stdio: 'ignore' });
  return backupName;
}

export async function readServerConfig(serverId: string): Promise<Record<string, string>> {
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  try {
    const raw = await fs.readFile(paths.serverConfigPath, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
    return result;
  } catch {
    return {};
  }
}

export async function writeServerConfig(serverId: string, values: Record<string, string>) {
  const paths = getServerPaths(await resolveServer(serverId));
  await writeServerConfigAt(paths, values);
}

export async function writeServerConfigAt(
  paths: ReturnType<typeof getServerPaths>,
  values: Record<string, string>
) {
  const lines: string[] = [
    '# tModLoader server configuration',
    '# Managed by tModVision',
    '',
  ];
  const keys = [
    'world',
    'worldpath',
    'worldname',
    'autocreate',
    'seed',
    'difficulty',
    'maxplayers',
    'port',
    'password',
    'motd',
    'banlist',
    'secure',
    'language',
    'upnp',
    'npcstream',
    'priority',
  ];
  const written = new Set<string>();
  for (const key of keys) {
    if (values[key] !== undefined) {
      lines.push(`${key}=${values[key]}`);
      written.add(key);
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (!written.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }
  await fs.writeFile(paths.serverConfigPath, lines.join('\n') + '\n');
}

export async function setActiveWorld(serverId: string, name: string) {
  assertSafeName(name, 'world name');
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  const config = await readServerConfig(serverId);
  config.world = path.join(paths.worldsDir, `${name}.wld`);
  config.worldpath = paths.worldsDir + '/';
  config.worldname = name;
  await writeServerConfig(serverId, config);
}

export async function readWorkshopMap(serverId: string): Promise<WorkshopMap> {
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  try {
    const raw = await fs.readFile(paths.workshopMapPath, 'utf-8');
    return JSON.parse(raw) as WorkshopMap;
  } catch {
    return {};
  }
}

export async function writeWorkshopMap(serverId: string, map: WorkshopMap) {
  const server = await resolveServer(serverId);
  const paths = getServerPaths(server);
  await fs.writeFile(paths.workshopMapPath, JSON.stringify(map, null, 2));
}

async function resolveServer(serverId: string) {
  return getServerById(serverId);
}
