import Docker from 'dockerode';
import { TMOD_CONTAINER_NAME } from '../config';

const docker = new Docker();

async function getContainer() {
  const containers = await docker.listContainers({ all: true });
  const info = containers.find(
    (c) => c.Names.includes(`/${TMOD_CONTAINER_NAME}`) || c.Id.startsWith(TMOD_CONTAINER_NAME)
  );
  if (!info) return null;
  return docker.getContainer(info.Id);
}

export async function getStatus() {
  const container = await getContainer();
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

export async function startServer() {
  const container = await getContainer();
  if (!container) throw new Error('Container not found');
  await container.start();
}

export async function stopServer() {
  const container = await getContainer();
  if (!container) throw new Error('Container not found');
  await container.stop({ t: 30 });
}

export async function restartServer() {
  const container = await getContainer();
  if (!container) throw new Error('Container not found');
  await container.restart({ t: 30 });
}

export async function injectCommand(command: string) {
  const container = await getContainer();
  if (!container) throw new Error('Container not found');
  const exec = await container.exec({
    Cmd: ['inject', command],
    AttachStdout: false,
    AttachStderr: false,
  });
  await exec.start({});
}

export async function streamLogs(
  onData: (chunk: string) => void,
  onError: (err: Error) => void
): Promise<{ destroy: () => void }> {
  const container = await getContainer();
  if (!container) throw new Error('Container not found');
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100,
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

function parseDockerLog(buffer: Buffer): string[] {
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

export async function runSteamCmd(workshopId: string): Promise<void> {
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
      '/data/steamMods',
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
        Binds: [`/data/steamMods:/data/steamMods`],
        AutoRemove: true,
      },
    }
  );
}

export async function createWorld(
  name: string,
  size: number,
  difficulty: number,
  seed?: string
): Promise<void> {
  const image = 'tmodvision-tmodloader'; // same image as server service
  const worldPath = `/data/tModLoader/Worlds/${name}.wld`;
  const args = [
    '-server',
    '-tmlsavedirectory',
    '/data/tModLoader',
    '-steamworkshopfolder',
    '/data/steamMods/steamapps/workshop',
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
      Binds: [`/data:/data`],
      AutoRemove: false,
    },
    name: `tmodvision-worldcreate-${Date.now()}`,
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
        await fs.access(`/data/tModLoader/Worlds/${name}.twld`);
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
