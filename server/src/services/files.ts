import fs from 'fs/promises';
import path from 'path';
import {
  MODS_DIR,
  WORLDS_DIR,
  BACKUPS_DIR,
  SERVER_CONFIG_PATH,
  ENABLED_MODS_PATH,
  WORKSHOP_MAP_PATH,
  WORKSHOP_DIR,
} from '../config';

export { MODS_DIR, WORLDS_DIR, BACKUPS_DIR, SERVER_CONFIG_PATH, ENABLED_MODS_PATH, WORKSHOP_MAP_PATH, WORKSHOP_DIR };

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
  await fs.mkdir(MODS_DIR, { recursive: true });
  await fs.mkdir(WORLDS_DIR, { recursive: true });
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  await fs.mkdir(WORKSHOP_DIR, { recursive: true });
}

export async function readEnabledMods(): Promise<string[]> {
  try {
    const raw = await fs.readFile(ENABLED_MODS_PATH, 'utf-8');
    return JSON.parse(raw) as string[];
  } catch {
    await fs.writeFile(ENABLED_MODS_PATH, '[]');
    return [];
  }
}

export async function writeEnabledMods(mods: string[]) {
  await fs.writeFile(ENABLED_MODS_PATH, JSON.stringify(mods, null, 2));
}

export async function listInstalledMods(): Promise<ModInfo[]> {
  const enabled = new Set(await readEnabledMods());
  const entries: ModInfo[] = [];
  try {
    const files = await fs.readdir(MODS_DIR, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.tmod')) continue;
      const stat = await fs.stat(path.join(MODS_DIR, f.name));
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

export async function enableMod(name: string) {
  const mods = await readEnabledMods();
  if (!mods.includes(name)) {
    mods.push(name);
    await writeEnabledMods(mods);
  }
}

export async function disableMod(name: string) {
  const mods = await readEnabledMods();
  const idx = mods.indexOf(name);
  if (idx !== -1) {
    mods.splice(idx, 1);
    await writeEnabledMods(mods);
  }
}

export async function deleteMod(name: string) {
  await disableMod(name);
  const filePath = path.join(MODS_DIR, `${name}.tmod`);
  await fs.unlink(filePath);
}

export async function listWorlds(): Promise<WorldInfo[]> {
  const entries: WorldInfo[] = [];
  try {
    const files = await fs.readdir(WORLDS_DIR, { withFileTypes: true });
    const seen = new Set<string>();
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.wld')) continue;
      const name = f.name.slice(0, -4);
      if (seen.has(name)) continue;
      seen.add(name);
      const stat = await fs.stat(path.join(WORLDS_DIR, f.name));
      entries.push({ name, size: stat.size, mtime: stat.mtime });
    }
  } catch {
    // ignore
  }
  return entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

export async function deleteWorld(name: string) {
  const wld = path.join(WORLDS_DIR, `${name}.wld`);
  const twld = path.join(WORLDS_DIR, `${name}.twld`);
  await fs.unlink(wld).catch(() => {});
  await fs.unlink(twld).catch(() => {});
}

export async function backupWorld(name: string): Promise<string> {
  const wld = path.join(WORLDS_DIR, `${name}.wld`);
  const twld = path.join(WORLDS_DIR, `${name}.twld`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${name}-${timestamp}.zip`;
  const backupPath = path.join(BACKUPS_DIR, backupName);

  // Use system zip if available
  const { execSync } = await import('child_process');
  execSync(`zip -j "${backupPath}" "${wld}" "${twld}"`, { stdio: 'ignore' });
  return backupName;
}

export async function readServerConfig(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(SERVER_CONFIG_PATH, 'utf-8');
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

export async function writeServerConfig(values: Record<string, string>) {
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
  await fs.writeFile(SERVER_CONFIG_PATH, lines.join('\n') + '\n');
}

export async function setActiveWorld(name: string) {
  const config = await readServerConfig();
  config.world = path.join(WORLDS_DIR, `${name}.wld`);
  config.worldpath = WORLDS_DIR + '/';
  config.worldname = name;
  await writeServerConfig(config);
}

export async function readWorkshopMap(): Promise<WorkshopMap> {
  try {
    const raw = await fs.readFile(WORKSHOP_MAP_PATH, 'utf-8');
    return JSON.parse(raw) as WorkshopMap;
  } catch {
    return {};
  }
}

export async function writeWorkshopMap(map: WorkshopMap) {
  await fs.writeFile(WORKSHOP_MAP_PATH, JSON.stringify(map, null, 2));
}
