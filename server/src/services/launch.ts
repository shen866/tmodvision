import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { getServerById, getServerPaths } from '../servers';
import { readServerConfig, readEnabledMods } from './files';

export async function launchSettings(id: string) {
  const paths = getServerPaths(await getServerById(id));
  const config = await readServerConfig(id);
  const mods: Record<string, string> = {};
  for (const name of await readEnabledMods(id)) {
    const stat = await fs
      .stat(path.join(paths.modsDir, path.basename(name) + '.tmod'))
      .catch(() => null);
    mods[name] = stat ? stat.size + ':' + stat.mtimeMs : 'workshop';
  }
  return {
    world: config.worldname || path.basename(config.world || '', '.wld'),
    maxplayers: Number(config.maxplayers) || null,
    mods,
    config: Object.fromEntries(
      Object.entries(config).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')])
    ),
  };
}

type Snapshot = Awaited<ReturnType<typeof launchSettings>> & { startedAt: string };
async function snapshotFile(id: string) {
  return path.join((await getServerById(id)).dataDir, 'tModLoader', 'panel-launch.json');
}
export async function saveLaunch(id: string, snapshot: Snapshot) {
  const file = await snapshotFile(id);
  await fs.writeFile(file + '.tmp', JSON.stringify(snapshot), { mode: 0o600 });
  await fs.rename(file + '.tmp', file);
}
export async function readLaunch(id: string, startedAt?: string): Promise<Snapshot | null> {
  if (!startedAt) return null;
  try {
    const data = JSON.parse(await fs.readFile(await snapshotFile(id), 'utf8'));
    return data.startedAt === startedAt ? data : null;
  } catch {
    return null;
  }
}
export function changedKeys(previous: Record<string, string>, next: Record<string, string>) {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(
    (k) => previous[k] !== next[k]
  );
}
