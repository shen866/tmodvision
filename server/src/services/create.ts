import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR, HOST_DATA_DIR } from '../config';
import {
  ServerConfig,
  loadServers,
  invalidateServersCache,
  getServerPaths,
  SERVERS_JSON_PATH,
} from '../servers';
import { createWorld } from './docker';
import { writeServerConfig } from './files';

export interface CreateServerInput {
  id: string;
  name: string;
  port: number;
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
  const id = sanitizeId(input.id);
  if (!id) throw new Error('Server id is required');

  const servers = await loadServers();
  if (servers.some((s) => s.id === id)) {
    throw new Error(`Server '${id}' already exists`);
  }

  const dataDir = path.resolve(DATA_DIR, input.dataDir || `./tModLoader-${id}`);
  const composeDir = path.resolve(DATA_DIR, input.composeDir || `./servers/${id}`);
  const containerName = `tmodloader-${id}`;

  const server: ServerConfig = {
    id,
    name: input.name || id,
    containerName,
    composeDir,
    dataDir,
    port: Number(input.port) || 7777,
  };

  // Register early so downstream helpers (copyModsPreset / createWorld) can resolve this server
  servers.push(server);
  await fs.writeFile(SERVERS_JSON_PATH, JSON.stringify(servers, null, 2));
  invalidateServersCache();

  // Create directory structure
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
  const worldPath = path.join(paths.worldsDir, `${worldName}.wld`);
  await writeServerConfig(id, {
    world: worldPath,
    worldpath: paths.worldsDir + '/',
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
    await copyModsPreset(input.copyModsFrom, id);
  }

  // Create world if parameters provided
  if (input.world?.name) {
    await createWorld(
      id,
      input.world.name,
      Number(input.world.size) || 2,
      Number(input.world.difficulty) || 0,
      input.world.seed
    );
  }

  return server;
}

async function copyModsPreset(fromServerId: string, toServerId: string) {
  const { getServerById } = await import('../servers');
  const fromServer = await getServerById(fromServerId);
  const toServer = await getServerById(toServerId);
  const fromPaths = getServerPaths(fromServer);
  const toPaths = getServerPaths(toServer);

  // Copy Mods directory
  try {
    const entries = await fs.readdir(fromPaths.modsDir, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(fromPaths.modsDir, entry.name);
      const dest = path.join(toPaths.modsDir, entry.name);
      if (entry.isDirectory()) {
        await fs.cp(src, dest, { recursive: true });
      } else {
        await fs.copyFile(src, dest);
      }
    }
  } catch {
    // ignore if source mods dir missing
  }

  // Copy enabled.json
  try {
    await fs.copyFile(fromPaths.enabledModsPath, toPaths.enabledModsPath);
  } catch {
    // ignore if source enabled.json missing
  }
}

async function resolveTmodloaderTemplate(): Promise<string> {
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

function toHostPath(containerPath: string): string {
  if (HOST_DATA_DIR === DATA_DIR) return containerPath;
  if (containerPath === DATA_DIR) return HOST_DATA_DIR;
  if (containerPath.startsWith(DATA_DIR + '/')) {
    return HOST_DATA_DIR + containerPath.slice(DATA_DIR.length);
  }
  return containerPath;
}

function generateComposeFile(server: ServerConfig): string {
  return `services:
  tmodloader:
    build:
      context: ./tmodloader
      args:
        - TMOD_VERSION=\${TMOD_VERSION:-v2026.04.3.0}
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
