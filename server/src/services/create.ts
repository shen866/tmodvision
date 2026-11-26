import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR, HOST_DATA_DIR } from '../config';
import {
  ServerConfig,
  loadServers,
  saveServers,
  editRegistry,
  checkPort,
  getServerPaths,
} from '../servers';
import { defaultVersion, checkVersion, resolveTmodloaderTemplate } from './releases';
import { getContainer, checkPublishedPort, docker, createAndStartServerContainer } from './docker';
import { writeServerConfigAt } from './files';
import { resolveSubPath, assertWithinBase, assertSafeName } from '../lib/safe';

export interface CreateServerInput {
  id: string;
  name: string;
  port: number;
  version?: string;
  dataDir?: string;
  composeDir?: string;
  copyModsFrom?: string;
  world?: {
    name: string;
    size: number;
    difficulty: number;
    seed?: string;
  };
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function createServer(input: CreateServerInput): Promise<ServerConfig> {
  return editRegistry(() => registerServer(input));
}

async function registerServer(input: CreateServerInput) {
  const id = sanitizeId(input.id);
  if (!id) throw new Error('Server id is required');

  const servers = await loadServers();
  if (servers.some((s) => s.id === id)) {
    throw new Error(`Server '${id}' already exists`);
  }

  checkPort(servers, id, input.port);
  await checkPublishedPort(input.port, '');
  if (input.world) assertSafeName(input.world.name);
  // Resolve dataDir/composeDir safely — only relative paths inside DATA_DIR.
  const dataDir = resolveSubPath(DATA_DIR, input.dataDir, `./tModLoader-${id}`);
  const composeDir = resolveSubPath(DATA_DIR, input.composeDir, `./servers/${id}`);
  const dirs = [
    dataDir,
    composeDir,
    path.resolve(DATA_DIR, 'steamMods'),
    ...servers.flatMap((s) => [s.dataDir, s.composeDir]).filter((d) => d !== DATA_DIR),
  ];
  for (const [i, dir] of [dataDir, composeDir].entries()) {
    if (
      dir === path.resolve(DATA_DIR) ||
      dirs.some(
        (other, j) =>
          j !== i && (dir === other || dir.startsWith(other + '/') || other.startsWith(dir + '/'))
      )
    ) {
      throw new Error('数据目录与 Compose 目录必须独立');
    }
  }
  const containerName = `tmodloader-${id}`;

  const server: ServerConfig = {
    id,
    name: input.name || id,
    containerName,
    composeDir,
    dataDir,
    port: input.port,
    version: checkVersion(input.version ?? defaultVersion),
  };

  // Build everything on disk BEFORE registering, so a failure leaves no
  // half-created entry in servers.json.
  const paths = getServerPaths(server);
  await fs.mkdir(paths.modsDir, { recursive: true });
  await fs.mkdir(paths.worldsDir, { recursive: true });
  await fs.mkdir(paths.backupsDir, { recursive: true });
  await fs.mkdir(paths.workshopDir, { recursive: true });
  await fs.mkdir(composeDir, { recursive: true });

  // Copy tmodloader build files
  const sourceTmodloader = await resolveTmodloaderTemplate();
  const targetTmodloader = path.join(composeDir, 'tmodloader');
  try {
    await fs.cp(sourceTmodloader, targetTmodloader, { recursive: true });
  } catch (err: any) {
    throw new Error(`Failed to copy tmodloader build files: ${err.message}`);
  }

  // Generate serverconfig.txt
  const worldName = input.world?.name || `${id}-world`;
  const worldPath = path.posix.join('/data/tModLoader/Worlds', `${worldName}.wld`);
  await writeServerConfigAt(paths, {
    world: worldPath,
    worldpath: '/data/tModLoader/Worlds/',
    worldname: worldName,
    autocreate: String(input.world?.size ?? 2),
    seed: input.world?.seed || '',
    difficulty: String(input.world?.difficulty ?? 0),
    maxplayers: '8',
    port: '7777',
    password: '',
    motd: `Welcome to ${server.name}`,
    language: 'en-US',
    secure: '0',
    npcstream: '60',
    upnp: '0',
    banlist: 'banlist.txt',
  });

  // Generate docker-compose.yml
  const composeContent = generateComposeFile(server);
  await fs.writeFile(path.join(composeDir, 'docker-compose.yml'), composeContent);

  // Copy mods preset if specified
  if (input.copyModsFrom) {
    await copyModsPreset(input.copyModsFrom, server);
  }

  // Register the server now that the filesystem is ready.
  await saveServers([...servers, server]);

  // Create and start the container in the background — building the image can
  // take several minutes so don't block the HTTP response.
  createAndStartServerContainer(id).catch((err) => {
    console.error(`Container start failed for ${id}:`, err);
  });

  return server;
}

/**
 * Remove a server and everything it created: the server container, any
 * leftover world-creation containers, its data and compose directories, and
 * its servers.json entry. Nothing per-server is left behind.
 */
export async function deleteServer(serverId: string): Promise<void> {
  return editRegistry(() => removeServer(serverId));
}

async function removeServer(serverId: string) {
  const servers = await loadServers();
  const server = servers.find((s) => s.id === serverId);
  if (!server) throw new Error(`Server '${serverId}' not found`);

  for (const dir of [server.dataDir, server.composeDir]) {
    assertWithinBase(dir, DATA_DIR);
    if (
      path.resolve(dir) === path.resolve(DATA_DIR) ||
      servers.some(
        (other) =>
          other.id !== serverId &&
          [other.dataDir, other.composeDir].some((d) => d === dir || d.startsWith(dir + '/'))
      )
    ) {
      throw new Error('此目录包含共享数据，无法整服删除');
    }
  }
  const container = await getContainer(serverId);
  if (container) {
    if ((await container.inspect()).State.Running) await container.stop({ t: 30 });
    await container.remove();
  }

  // Also remove any leftover world-creation containers for this server.
  try {
    const containers = await docker.listContainers({ all: true });
    const prefix = `tmodvision-worldcreate-${serverId}-`;
    for (const c of containers) {
      if (!c.Names.some((n) => n.replace(/^\//, '').startsWith(prefix))) continue;
      const container = docker.getContainer(c.Id);
      try {
        await container.stop({ t: 5 });
      } catch {
        /* ignore */
      }
      try {
        await container.remove({ force: true });
      } catch {
        /* ignore */
      }
    }
  } catch {
    // ignore
  }

  // Remove server data and compose directories. Safety: only delete paths
  // that live inside DATA_DIR.
  assertWithinBase(server.dataDir, DATA_DIR);
  assertWithinBase(server.composeDir, DATA_DIR);
  await fs.rm(server.dataDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(server.composeDir, { recursive: true, force: true }).catch(() => {});

  // Unregister from servers.json.
  const remaining = servers.filter((s) => s.id !== serverId);
  await saveServers(remaining);
}

async function copyModsPreset(fromServerId: string, toServer: ServerConfig) {
  const { getServerById } = await import('../servers');
  const fromServer = await getServerById(fromServerId);
  const fromPaths = getServerPaths(fromServer);
  const toPaths = getServerPaths(toServer);

  try {
    await fs.cp(fromPaths.modsDir, toPaths.modsDir, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  try {
    await fs.copyFile(fromPaths.workshopMapPath, toPaths.workshopMapPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function toHostPath(containerPath: string): string {
  if (HOST_DATA_DIR === DATA_DIR) return containerPath;
  if (containerPath === DATA_DIR) return HOST_DATA_DIR;
  if (containerPath.startsWith(DATA_DIR + '/')) {
    return HOST_DATA_DIR + containerPath.slice(DATA_DIR.length);
  }
  return containerPath;
}

export function generateComposeFile(server: ServerConfig): string {
  return `services:
  tmodloader:
    platform: linux/amd64
    build:
      context: ./tmodloader
      args:
        - TMOD_VERSION=${server.version || defaultVersion}
    container_name: ${server.containerName}
    restart: unless-stopped
    stdin_open: true
    tty: true
    ports:
      - "${server.port}:7777"
    environment:
      - TMOD_SHUTDOWN_MESSAGE=\${TMOD_SHUTDOWN_MESSAGE:-Server is shutting down NOW!}
      - TMOD_AUTOSAVE_INTERVAL=\${TMOD_AUTOSAVE_INTERVAL:-10}
      - TMOD_AUTODOWNLOAD=\${TMOD_AUTODOWNLOAD:-}
      - TMOD_ENABLEDMODS=\${TMOD_ENABLEDMODS:-}
      - TMOD_MOTD=\${TMOD_MOTD:-A tModLoader server powered by tModVision}
      - TMOD_PASS=\${TMOD_PASS:-}
      - TMOD_MAXPLAYERS=\${TMOD_MAXPLAYERS:-8}
      - TMOD_WORLDNAME=\${TMOD_WORLDNAME:-tModWorld}
      - TMOD_WORLDSIZE=\${TMOD_WORLDSIZE:-2}
      - TMOD_WORLDSEED=\${TMOD_WORLDSEED:-}
      - TMOD_DIFFICULTY=\${TMOD_DIFFICULTY:-0}
      - TMOD_SECURE=\${TMOD_SECURE:-0}
      - TMOD_LANGUAGE=\${TMOD_LANGUAGE:-en-US}
      - TMOD_NPCSTREAM=\${TMOD_NPCSTREAM:-60}
      - TMOD_UPNP=\${TMOD_UPNP:-0}
      - TMOD_PORT=\${TMOD_PORT:-7777}
    volumes:
      - ${toHostPath(server.dataDir)}:/data
`;
}
