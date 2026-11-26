import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { assertWorkshopId, assertSafeName } from '../lib/safe';
import { defaultVersion } from './releases';
import { getStatus } from './docker';
import { modHeader } from './modHeader';
import { glob } from 'glob';
import { getServerById, getServerPaths } from '../servers';
import { readEnabledMods, writeEnabledMods, readWorkshopMap, writeWorkshopMap } from './files';
import { runSteamCmd } from './docker';

const installing = new Map<string, Promise<unknown>>();
export async function installWorkshopMod(serverId: string, workshopId: string) {
  assertWorkshopId(workshopId);
  const previous = installing.get(workshopId) || Promise.resolve();
  const job = previous.catch(() => {}).then(() => install(serverId, workshopId));
  installing.set(workshopId, job);
  try {
    return await job;
  } finally {
    if (installing.get(workshopId) === job) installing.delete(workshopId);
  }
}
async function install(serverId: string, workshopId: string) {
  const server = await getServerById(serverId);
  const paths = getServerPaths(server);
  await runSteamCmd(serverId, workshopId);

  const modDir = path.join(paths.workshopDir, workshopId);
  const files = await glob('**/*.tmod', { cwd: modDir, absolute: true });
  if (files.length === 0) {
    throw new Error(`No .tmod file found after downloading workshop item ${workshopId}`);
  }

  // Workshop items may ship builds for multiple tML branches.
  const release = server.version || (await getStatus(serverId)).version || defaultVersion;
  const targetVersion = release.replace(/^v/, '').split('-')[0].split('.').map(Number).join('.');
  const versions = new Intl.Collator('en', { numeric: true });
  const candidates = await Promise.all(
    files.map(async (file) => ({ file, header: await modHeader(file) }))
  );
  const eligible = candidates.filter(
    ({ header }) => header && versions.compare(header.loader, targetVersion) <= 0
  );
  eligible.sort(
    (a, b) =>
      versions.compare(b.header!.loader, a.header!.loader) ||
      versions.compare(b.header!.version, a.header!.version)
  );
  const selected =
    eligible[0] || (candidates.length === 1 && !candidates[0].header ? candidates[0] : null);
  if (!selected) throw new Error('工坊文件中找不到适用于目标版本 ' + release + ' 的构建');
  const newest = selected.file;
  const internalName = selected.header?.name || path.basename(newest, '.tmod');
  assertSafeName(internalName);
  const target = path.join(paths.modsDir, `${internalName}.tmod`);
  await fs.copyFile(newest, target + '.tmp');
  await fs.rename(target + '.tmp', target);

  const map = await readWorkshopMap(serverId);
  map[workshopId] = { fileName: `${internalName}.tmod` };
  await writeWorkshopMap(serverId, map);

  return { workshopId, internalName, fileName: `${internalName}.tmod` };
}

export { readEnabledMods, writeEnabledMods };

export async function importLocalMod(serverId: string, source: Readable) {
  const {modsDir} = getServerPaths(await getServerById(serverId));
  const temporary = path.join(modsDir, '.upload-' + randomUUID());
  try {
    await pipeline(source, createWriteStream(temporary, {flags:'wx'}));
    const header = await modHeader(temporary);
    if (!header) throw new Error('文件缺少可识别的 .tmod 头部');
    assertSafeName(header.name, 'mod name');
    await fs.rename(temporary, path.join(modsDir, header.name + '.tmod'));
    return header;
  } finally { await fs.rm(temporary, {force:true}); }
}
