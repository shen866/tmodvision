import Docker from 'dockerode';
import path from 'path';
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
  const info = containers.find(
    (c) =>
      c.Names.includes(`/${server.containerName}`) ||
      c.Id.startsWith(server.containerName)
  );
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
  if (!container) throw new Error('Container not found');
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

export async function injectCommand(serverId: string, command: string) {
  const container = await getContainer(serverId);
  if (!container) throw new Error('Container not found');
  const exec = await container.exec({
    Cmd: ['inject', command],
    AttachStdout: false,
    AttachStderr: false,
  });
  await exec.start({});
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
  stream.on('data', (chunk: Buffer) => {
    // Docker multiplexes stdout/stderr; strip the 8-byte header per frame
    const lines = parseDockerLog(chunk);
    for (const line of lines) onData(line);
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

export function parseDockerLog(buffer: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    // header: stream type (1), 0, 0, 0, size (4)
    const size = buffer.readUInt32BE(offset + 4);
    const payload = buffer.slice(offset + 8, offset + 8 + size).toString('utf-8');
    lines.push(payload);
    offset += 8 + size;
  }
  return lines;
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

  await container.start();

  // Wait for world file to appear, then stop the container
  const maxWait = 1000 * 60 * 5; // 5 minutes
  const start = Date.now();
  const fs = await import('fs/promises');
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await fs.access(worldPath);
      // Also wait for .twld
      try {
        await fs.access(path.join(paths.worldsDir, `${name}.twld`));
      } catch {
        continue;
      }
      break;
    } catch {
      // continue
    }
  }

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

export { docker };
