import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import {
  MODS_DIR,
  WORKSHOP_DIR,
  readEnabledMods,
  writeEnabledMods,
  readWorkshopMap,
  writeWorkshopMap,
} from './files';
import { runSteamCmd } from './docker';

export async function installWorkshopMod(workshopId: string) {
  await runSteamCmd(workshopId);

  const modDir = path.join(WORKSHOP_DIR, workshopId);
  const files = await glob('**/*.tmod', { cwd: modDir, absolute: true });
  if (files.length === 0) {
    throw new Error(`No .tmod file found after downloading workshop item ${workshopId}`);
  }

  // Use the newest .tmod by mtime
  const withStat = await Promise.all(
    files.map(async (f) => ({ path: f, stat: await fs.stat(f) }))
  );
  withStat.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
  const newest = withStat[0].path;

  const internalName = path.basename(newest, '.tmod');
  const target = path.join(MODS_DIR, `${internalName}.tmod`);
  await fs.copyFile(newest, target);

  const map = await readWorkshopMap();
  map[workshopId] = { fileName: `${internalName}.tmod` };
  await writeWorkshopMap(map);

  return { workshopId, internalName, fileName: `${internalName}.tmod` };
}

export { readEnabledMods, writeEnabledMods };
