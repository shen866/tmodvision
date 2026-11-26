import fs from 'fs/promises';
import path from 'path';

const pinned = /^v\d{4}\.\d{1,2}\.\d+\.\d+(?:-[\w.-]+)?$/;
export const defaultVersion = pinned.test(process.env.TMOD_VERSION || '')
  ? process.env.TMOD_VERSION!
  : 'v2026.04.3.0';

export function checkVersion(value: unknown): string {
  if (typeof value !== 'string' || !pinned.test(value))
    throw new Error('请输入完整的 tModLoader 发布标签，例如 v2026.04.3.0');
  return value;
}

let tags: string[] = [];
let expires = 0;
export async function releaseList() {
  if (Date.now() > expires) {
    try {
      const response = await fetch(
        'https://api.github.com/repos/tModLoader/tModLoader/releases?per_page=50',
        {
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!response.ok) throw new Error('release catalog unavailable');
      const releases = (await response.json()) as { tag_name: string; draft: boolean }[];
      tags = releases.filter((r) => !r.draft && pinned.test(r.tag_name)).map((r) => r.tag_name);
      expires = Date.now() + 3600000;
    } catch {
      expires = Date.now() + 60000;
    }
  }
  return { defaultVersion, versions: [...new Set([defaultVersion, ...tags])] };
}

export async function resolveTmodloaderTemplate(): Promise<string> {
  const candidates = ['/app/tmodloader-template', path.resolve(process.cwd(), '../tmodloader')];
  for (const dir of candidates) {
    try {
      await fs.access(dir);
      return dir;
    } catch {
      // try next
    }
  }
  throw new Error('tmodloader template directory not found');
}
