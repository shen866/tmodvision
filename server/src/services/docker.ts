import Docker from 'dockerode';
import path from 'path';
import { launchSettings, saveLaunch } from './launch';
import { checkVersion, defaultVersion, resolveTmodloaderTemplate } from './releases';
import { readServerConfig, writeServerConfig } from './files';
import { assertSafeName } from '../lib/safe';
import { execFileSync } from 'child_process';
import { Readable } from 'stream';
import { DATA_DIR, HOST_DATA_DIR } from '../config';
import { getServerById, getServerPaths, ServerConfig } from '../servers';

const docker = new Docker();

function toHostPath(containerPath: string): string {
  if (HOST_DATA_DIR === DATA_DIR) return containerPath;
  if (containerPath === DATA_DIR) return HOST_DATA_DIR;
  if (containerPath.startsWith(DATA_DIR + '/')) {
    return HOST_DATA_DIR + containerPath.slice(DATA_DIR.length);
  }
  return containerPath;
}

export async function checkPublishedPort(port: number, ownName: string) {
  const containers = await docker.listContainers();
  if (
    containers.some(
      (c) =>
        !c.Names.includes('/' + ownName) &&
        c.Ports.some((p) => p.Type === 'tcp' && p.PublicPort === port)
    )
  ) {
    throw new Error('此端口正在被其他容器使用');
  }
}

export async function getContainer(serverId: string) {
  const server = await getServerById(serverId);
  const containers = await docker.listContainers({ all: true });
  const info = containers.find((c) => c.Names.includes(`/${server.containerName}`));
  if (!info) return null;
  return docker.getContainer(info.Id);
}

export async function getStatus(serverId: string) {
  const container = await getContainer(serverId);
  if (!container) {
    return { state: 'missing', id: null };
  }
  const info = await container.inspect();
  return {
    state: info.State.Status,
    version: info.Config.Env?.find((v) => v.startsWith('TMOD_VERSION='))?.slice(13) || null,
    hostPort:
      Number(
        (Object.values(info.HostConfig.PortBindings || {}) as { HostPort: string }[][])[0]?.[0]
          ?.HostPort
      ) || null,
    running: info.State.Running,
    exitCode: info.State.ExitCode,
    startedAt: info.State.StartedAt,
    finishedAt: info.State.FinishedAt,
    id: info.Id,
    name: info.Name,
    image: info.Config.Image,
  };
}

const active = new Map<string, string>();
const errors = new Map<string, string>();
export function operation(id: string) {
  return { activity: active.get(id), lastError: errors.get(id) };
}
async function runOperation(id: string, label: string, task: () => Promise<void>) {
  if (active.has(id)) throw new Error('此服务器正在执行其他操作');
  active.set(id, label);
  errors.delete(id);
  try {
    await task();
  } catch (err) {
    errors.set(id, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    active.delete(id);
  }
}

const builds = new Map<string, Promise<string>>();
async function prepareImage(server: ServerConfig) {
  const version = checkVersion(server.version || defaultVersion);
  const tag = 'tmodvision-tmodloader:' + version.toLowerCase();
  try {
    await docker.getImage(tag).inspect();
    return tag;
  } catch (err: any) {
    if (err.statusCode !== 404) throw err;
  }
  const existing = builds.get(tag);
  if (existing) return existing;
  const build = (async () => {
    // A shared release tag must always come from the panel's canonical template.
    const directory = await resolveTmodloaderTemplate();
    const archive = execFileSync('tar', ['-c', '--exclude=tModLoader.zip', '-C', directory, '.'], {
      maxBuffer: 100 * 1024 * 1024,
    });
    const stream = await docker.buildImage(Readable.from([archive]), {
      t: tag,
      platform: 'linux/amd64',
      buildargs: { TMOD_VERSION: version },
    });
    await new Promise<void>((resolve, reject) =>
      docker.modem.followProgress(stream, (err, events) => {
        const failure = events?.find((event) => event.error)?.error;
        if (err || failure) reject(err || new Error(failure));
        else resolve();
      })
    );
    return tag;
  })();
  builds.set(tag, build);
  try {
    return await build;
  } finally {
    builds.delete(tag);
  }
}

export function prepareServerImage(id: string) {
  return runOperation(id, '准备版本镜像', async () => {
    await prepareImage(await getServerById(id));
  });
}

async function launch(id: string, restart: boolean) {
  const server = await getServerById(id);
  const old = await getContainer(id);
  const info = await old?.inspect();
  const config = await readServerConfig(id);
  const internalPort = Number(config.port) || 7777;
  const binding = internalPort + '/tcp';
  const oldVersion = info?.Config.Env?.find((v) => v.startsWith('TMOD_VERSION='))?.slice(13);
  const replace =
    !info ||
    (server.version && oldVersion !== server.version) ||
    Number(info.HostConfig.PortBindings?.[binding]?.[0]?.HostPort) !== server.port;
  let image: string | undefined;
  if (replace) {
    active.set(id, '准备版本镜像');
    image = info && !server.version ? info.Image : await prepareImage(server);
  }
  active.set(id, '正在应用启动设置');
  // Older panel releases stored the panel-side world directory in game config.
  const paths = getServerPaths(server);
  if (
    config.world?.startsWith(paths.worldsDir + '/') &&
    paths.worldsDir !== '/data/tModLoader/Worlds'
  ) {
    config.world = '/data/tModLoader/Worlds/' + path.basename(config.world);
    config.worldpath = '/data/tModLoader/Worlds/';
    await writeServerConfig(id, config);
  }
  const snapshot = await launchSettings(id);
  let target = old;
  if (replace && image) {
    const candidate = await docker.createContainer({
      Image: image,
      name: old ? server.containerName + '-next-' + Date.now() : server.containerName,
      Tty: true,
      OpenStdin: true,
      ExposedPorts: { [binding]: {} },
      HostConfig: {
        ...info?.HostConfig,
        Binds: info?.HostConfig.Binds || [toHostPath(server.dataDir) + ':/data'],
        PortBindings: { [binding]: [{ HostPort: String(server.port) }] },
        RestartPolicy: info?.HostConfig.RestartPolicy || { Name: 'unless-stopped' },
      },
      ...(info
        ? {
            Env: info.Config.Env.filter((v) => !v.startsWith('TMOD_VERSION=')),
            Labels: info.Config.Labels,
          }
        : {}),
    });
    let renamed = false;
    try {
      if (old) {
        if (info?.State.Running) await old.stop({ t: 30 });
        await old.rename({ name: server.containerName + '-previous-' + Date.now() });
        renamed = true;
        await candidate.rename({ name: server.containerName });
      }
      await candidate.start();
    } catch (err) {
      await candidate.remove({ force: true });
      if (old && renamed) await old.rename({ name: server.containerName });
      if (old && info?.State.Running && !(await old.inspect()).State.Running) await old.start();
      throw err;
    }
    target = candidate;
    if (old) await old.remove();
  } else if (old) {
    if (info?.State.Running && !restart) return;
    if (info?.State.Running) await old.restart({ t: 30 });
    else await old.start();
  }
  if (target)
    await saveLaunch(id, { ...snapshot, startedAt: (await target.inspect()).State.StartedAt });
}

export function startServer(id: string) {
  return runOperation(id, '正在启动', () => launch(id, false));
}
export const createAndStartServerContainer = startServer;
export function restartServer(id: string) {
  return runOperation(id, '正在重启', () => launch(id, true));
}
export function stopServer(id: string) {
  return runOperation(id, '正在停止', async () => {
    const container = await getContainer(id);
    if (!container) throw new Error('找不到服务器容器');
    await container.stop({ t: 30 });
  });
}

export async function injectCommand(serverId: string, command: string) {
  const container = await getContainer(serverId);
  if (!container) throw new Error('Container not found');
  const exec = await container.exec({
    Cmd: ['inject', command],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});

  // Drain the stream and wait for completion so failures surface to the caller.
  await new Promise<void>((resolve, reject) => {
    stream.on('data', () => {});
    stream.on('error', reject);
    stream.on('end', async () => {
      try {
        const inspectInfo = await exec.inspect();
        if (inspectInfo.ExitCode !== 0) {
          reject(new Error(`inject exited with code ${inspectInfo.ExitCode}`));
        } else {
          resolve();
        }
      } catch {
        resolve();
      }
    });
  });
}

export async function streamLogs(
  serverId: string,
  onData: (chunk: string) => void,
  onError: (err: Error) => void
): Promise<{ destroy: () => void }> {
  const container = await getContainer(serverId);
  if (!container) throw new Error('Container not found');
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 200,
    timestamps: false,
  });
  // Buffer incomplete frames across data events — Docker may split a
  // multiplexed frame at arbitrary boundaries.
  const tty = (await container.inspect()).Config.Tty;
  const parser = createDockerLogParser();
  stream.on('data', (chunk: Buffer) => {
    if (tty) onData(chunk.toString());
    else for (const line of parser.push(chunk)) onData(line);
  });
  stream.on('error', onError);
  return {
    destroy: () => {
      try {
        (stream as any).destroy();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Stateful parser that buffers partial Docker multiplexed frames.
 * Each frame: 1 byte stream type, 3 zero bytes, 4-byte big-endian size, then payload.
 */
export function createDockerLogParser() {
  let buf = Buffer.alloc(0);
  return {
    push(chunk: Buffer): string[] {
      buf = Buffer.concat([buf, chunk]);
      const lines: string[] = [];
      while (buf.length >= 8) {
        const size = buf.readUInt32BE(4);
        if (buf.length < 8 + size) break; // incomplete frame, wait for more
        const payload = buf.slice(8, 8 + size).toString('utf-8');
        lines.push(payload);
        buf = buf.slice(8 + size);
      }
      return lines;
    },
  };
}

/**
 * Parse a complete, already-buffered Docker log frame buffer.
 * Kept for callers (e.g. players.ts) that read logs in one shot.
 */
export function parseDockerLog(buffer: Buffer): string[] {
  return createDockerLogParser().push(buffer);
}

export async function runSteamCmd(serverId: string, workshopId: string): Promise<void> {
  const server = await getServerById(serverId);
  const paths = getServerPaths(server);
  const image = 'steamcmd/steamcmd:ubuntu-22';
  // Pull if missing
  try {
    await docker.getImage(image).inspect();
  } catch {
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, { platform: 'linux/amd64' }, (err: any, stream: any) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
      });
    });
  }

  const [result] = await docker.run(
    image,
    [
      '+force_install_dir',
      paths.steamModsDir,
      '+login',
      'anonymous',
      '+workshop_download_item',
      '1281930',
      workshopId,
      '+quit',
    ],
    process.stdout,
    {
      HostConfig: {
        Binds: [`${toHostPath(paths.steamModsDir)}:${paths.steamModsDir}`],
        AutoRemove: true,
      },
    }
  );
  if (result.StatusCode !== 0) throw new Error('SteamCMD 下载失败');
}

export async function createWorld(
  serverId: string,
  name: string,
  size: number,
  difficulty: number,
  seed?: string
): Promise<void> {
  const server = await getServerById(serverId);
  const paths = getServerPaths(server);
  assertSafeName(name);
  const existing = await getContainer(serverId);
  const image =
    server.version || !existing ? await prepareImage(server) : (await existing.inspect()).Image;
  const worldEntrypoint = (await docker.getImage(image).inspect()).Config.Labels?.['io.tmodvision.world-entrypoint'];
  const worldPath = path.join(paths.worldsDir, `${name}.wld`);
  const args = [
    '-server',
    '-tmlsavedirectory',
    paths.tmodDir,
    '-steamworkshopfolder',
    path.join(paths.steamModsDir, 'steamapps', 'workshop'),
    '-world',
    worldPath,
    '-autocreate',
    String(size),
    '-worldname',
    name,
    '-difficulty',
    String(difficulty),
    ...(seed ? ['-seed', seed] : []),
  ];

  const container = await docker.createContainer({
    Image: image,
    ...(worldEntrypoint ? { Cmd: ['--create-world', ...args] } : { Entrypoint: ['/terraria-server/LaunchUtils/ScriptCaller.sh'], Cmd: args }),
    HostConfig: {
      Binds: [`${toHostPath(server.dataDir)}:${server.dataDir}`],
      AutoRemove: false,
    },
    name: `tmodvision-worldcreate-${server.id}-${Date.now()}`,
  });

  try {
    await container.start();

    // Wait for world files to appear. Also bail early if the container exits
    // before producing them (e.g. script crash), so we don't block for the
    // full timeout on an already-failed run.
    const maxWait = 1000 * 60 * 5; // 5 minutes
    const start = Date.now();
    const fs = await import('fs/promises');
    const twldPath = path.join(paths.worldsDir, `${name}.twld`);
    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 2000));

      try {
        await fs.access(worldPath);
        await fs.access(twldPath);
        return; // both world files exist
      } catch {
        // not ready yet
      }

      const info = await container.inspect();
      if (!info.State.Running) {
        throw new Error('世界创建容器已退出，但世界文件未生成（可能脚本执行失败）');
      }
    }
    throw new Error('等待世界生成超时');
  } finally {
    try {
      await container.stop({ t: 10 });
    } catch {
      // ignore
    }
    try {
      await container.remove({ force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Remove any orphaned world-creation containers left behind by a crashed or
 * restarted server process. Called once at startup.
 */
export async function cleanupOrphanedWorldCreators(): Promise<void> {
  const containers = await docker.listContainers({ all: true });
  for (const c of containers) {
    if (!c.Names.some((n) => n.includes('tmodvision-worldcreate-'))) continue;
    const container = docker.getContainer(c.Id);
    try {
      await container.stop({ t: 5 });
    } catch {
      // ignore
    }
    try {
      await container.remove({ force: true });
    } catch {
      // ignore
    }
    console.log(`Cleaned up orphaned world-creation container: ${c.Names.join(', ')}`);
  }
}

export { docker };
