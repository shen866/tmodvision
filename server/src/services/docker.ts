import Docker from 'dockerode';
import path from 'path';
import { execFileSync } from 'child_process';
import { Readable } from 'stream';
import { DATA_DIR, HOST_DATA_DIR } from '../config';
import { getServerById, getServerPaths } from '../servers';

const docker = new Docker();

function toHostPath(containerPath: string): string {
  if (HOST_DATA_DIR === DATA_DIR) return containerPath;
  if (containerPath === DATA_DIR) return HOST_DATA_DIR;
  if (containerPath.startsWith(DATA_DIR + '/')) {
    return HOST_DATA_DIR + containerPath.slice(DATA_DIR.length);
  }
  return containerPath;
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
    running: info.State.Running,
    exitCode: info.State.ExitCode,
    startedAt: info.State.StartedAt,
    finishedAt: info.State.FinishedAt,
    id: info.Id,
    name: info.Name,
    image: info.Config.Image,
  };
}

export async function startServer(serverId: string) {
  const container = await getContainer(serverId);
  if (!container) {
    // Container doesn't exist yet — create and start it
    return createAndStartServerContainer(serverId);
  }
  await container.start();
}

export async function stopServer(serverId: string) {
  const container = await getContainer(serverId);
  if (!container) throw new Error('Container not found');
  await container.stop({ t: 30 });
}

export async function restartServer(serverId: string) {
  const container = await getContainer(serverId);
  if (!container) throw new Error('Container not found');
  await container.restart({ t: 30 });
}

/**
 * Build the tmodloader image and create + start the container for a server.
 * Idempotent — if the container already exists, just start it.
 */
export async function createAndStartServerContainer(serverId: string): Promise<void> {
  const server = await getServerById(serverId);

  // If container already exists, just start it
  const existing = await getContainer(serverId);
  if (existing) {
    const info = await existing.inspect();
    if (!info.State.Running) {
      await existing.start();
    }
    return;
  }

  const buildContextDir = path.join(server.composeDir, 'tmodloader');
  const imageTag = `tmodvision-tmodloader:${serverId}`;

  // Build the image from the tmodloader directory
  console.log(`[docker] Building image ${imageTag} from ${buildContextDir}...`);
  const tarBuffer = execFileSync('tar', ['-c', '-C', buildContextDir, '.'], {
    maxBuffer: 1024 * 1024 * 100, // 100MB
  });
  const buildStream = await docker.buildImage(Readable.from(tarBuffer), {
    t: imageTag,
    buildargs: { TMOD_VERSION: process.env.TMOD_VERSION || 'v2026.04.3.0' },
  });
  // Wait for build to finish
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(buildStream, (err) => (err ? reject(err) : resolve()));
  });
  console.log(`[docker] Image ${imageTag} built successfully`);

  // Create the container
  const container = await docker.createContainer({
    Image: imageTag,
    name: server.containerName,
    Hostname: '',
    Domainname: '',
    User: '',
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    Env: [
      'TMOD_SHUTDOWN_MESSAGE=Server is shutting down NOW!',
      'TMOD_AUTOSAVE_INTERVAL=10',
      `TMOD_MOTD=Welcome to ${server.name}`,
      'TMOD_PASS=',
      'TMOD_MAXPLAYERS=8',
      'TMOD_WORLDSIZE=2',
      'TMOD_WORLDSEED=',
      'TMOD_DIFFICULTY=0',
      'TMOD_SECURE=0',
      'TMOD_LANGUAGE=en-US',
      'TMOD_NPCSTREAM=60',
      'TMOD_UPNP=0',
      'TMOD_PORT=7777',
    ],
    ExposedPorts: { '7777/tcp': {} },
    HostConfig: {
      PortBindings: { '7777/tcp': [{ HostPort: String(server.port) }] },
      Binds: [`${toHostPath(server.dataDir)}:/data`],
      RestartPolicy: { Name: 'unless-stopped' },
    },
  });

  console.log(`[docker] Container ${server.containerName} created, starting...`);
  await container.start();
  console.log(`[docker] Container ${server.containerName} started`);
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
  const parser = createDockerLogParser();
  stream.on('data', (chunk: Buffer) => {
    for (const line of parser.push(chunk)) onData(line);
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
      docker.pull(image, (err: any, stream: any) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
      });
    });
  }

  await docker.run(
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
  const image = 'tmodvision-tmodloader'; // same image as server service
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
    Cmd: ['/terraria-server/LaunchUtils/ScriptCaller.sh', ...args],
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
        break; // both world files exist — done
      } catch {
        // not ready yet
      }

      const info = await container.inspect();
      if (!info.State.Running) {
        throw new Error('世界创建容器已退出，但世界文件未生成（可能脚本执行失败）');
      }
    }
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
