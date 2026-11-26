import type Docker from 'dockerode';
import { getContainer, parseDockerLog } from './docker';
import { listServers } from '../servers';

// Per-server online-player tracker.
//
// Decoupled from the console WebSocket: a background poller pulls container
// logs on an interval and replays join/leave events into an in-memory set.
// On container restart (detected via startedAt change) the set is cleared and
// recent history re-tailed, so the count stays accurate without anyone having
// the console open.

interface PlayerState {
  set: Set<string>;
  ready: boolean;
  loadedMods?: Record<string,string> | null;
  stage?: string;
  problem?: string;
  sampled: number;
  history: { time: number; cpu: number | null; memory: number }[];
  previousCpu?: { total: number; system: number };
  startedAt: string | null; // docker container.State.StartedAt
  sinceSec: number | null; // unix-seconds watermark of last consumed log line
}

const states = new Map<string, PlayerState>();
const POLL_INTERVAL_MS = 5000;

let pollTimer: NodeJS.Timeout | null = null;
let polling = false;

function getState(serverId: string): PlayerState {
  let st = states.get(serverId);
  if (!st) {
    st = { set: new Set(), ready: false, sampled: 0, history: [], startedAt: null, sinceSec: null };
    states.set(serverId, st);
  }
  return st;
}

export function getOnlinePlayers(serverId: string): string[] {
  return Array.from(getState(serverId).set);
}

export function monitor(id: string, startedAt?: string) {
  const st = getState(id);
  const valid = !!startedAt && st.startedAt === startedAt;
  const fresh = valid && Date.now() - st.sampled < 20000;
  return {
    loadedMods: fresh && st.ready ? st.loadedMods ?? null : null,
    stage: fresh ? st.stage : null,
    gameError: fresh ? st.problem : null,
    ready: fresh ? st.ready : null,
    players: fresh && st.ready ? [...st.set] : null,
    sampledAt: valid && st.sampled ? st.sampled : null,
    history: valid ? st.history : [],
  };
}

export function startPlayerPoller() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    pollAll().catch(() => {});
  }, POLL_INTERVAL_MS);
  pollAll().catch(() => {});
}

async function pollAll() {
  if (polling) return;
  polling = true;
  try {
    const servers = await listServers();
    await Promise.allSettled(servers.map((s) => refreshServer(s.id)));
  } finally {
    polling = false;
  }
}

// Distinguish the selected enabled.json entries from the mods that completed loading.
async function loadedMods(container: Docker.Container) {
  const exec = await container.exec({
    Cmd: ['grep', '-F', '[tML]: Finalizing Content:', '/terraria-server/tModLoader-Logs/server.log'],
    AttachStdout: true, Tty: true,
  });
  const stream = await exec.start({Tty:true});
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const entries: Record<string,string> = {};
  for (const line of Buffer.concat(chunks).toString().split('\n')) {
    const match = line.match(/\[tML\]: Finalizing Content: (\w+) \(.*\) v([\d.]+)/);
    if (match) entries[match[1]] = match[2];
  }
  if (!entries.ModLoader) return null;
  delete entries.ModLoader;
  return entries;
}

async function refreshServer(serverId: string): Promise<void> {
  const container = await getContainer(serverId);
  const st = getState(serverId);

  if (!container) {
    st.set.clear();
    st.startedAt = null;
    st.sinceSec = null;
    return;
  }

  const info = await container.inspect();
  if (!info.State.Running) {
    st.set.clear();
    st.sinceSec = null; // re-tail fresh history on next start
    return;
  }

  // Restart (or first sighting) → drop stale state and replay recent logs.
  if (info.State.StartedAt !== st.startedAt) {
    st.set.clear();
    st.ready = false;
    st.loadedMods = undefined;
    st.stage = undefined;
    st.problem = undefined;
    st.sampled = 0;
    st.history = [];
    st.previousCpu = undefined;
    st.startedAt = info.State.StartedAt;
    st.sinceSec = null;
  }

  const buf = await container.logs({
    follow: false,
    stdout: true,
    stderr: true,
    timestamps: true,
    since: st.sinceSec ?? Math.floor(Date.parse(info.State.StartedAt) / 1000),
  });
  const chunks = info.Config.Tty ? [buf.toString()] : parseDockerLog(buf);

  let maxTs: number | null = null;
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      if (!line) continue;
      const { ts, message } = splitTimestamp(line);
      if (ts != null && ts > (maxTs ?? -1)) maxTs = ts;
      if (ts != null && ts < Date.parse(info.State.StartedAt)) continue;
      applyLine(st, message);
    }
  }

  if (maxTs != null) st.sinceSec = Math.floor(maxTs / 1000);
  st.sampled = Date.now();
  if (st.ready && st.loadedMods === undefined) st.loadedMods = await loadedMods(container).catch(() => null);
  const stats = await container.stats({ stream: false, 'one-shot': true });
  const cpu = stats.cpu_stats;
  const total = cpu.cpu_usage.total_usage;
  const system = cpu.system_cpu_usage;
  const prev = st.previousCpu;
  const percent =
    prev && system > prev.system
      ? ((100 * (total - prev.total)) / (system - prev.system)) * (cpu.online_cpus || 1)
      : null;
  st.history.push({ time: st.sampled, cpu: percent, memory: stats.memory_stats.usage || 0 });
  if (st.history.length > 60) st.history.shift();
  st.previousCpu = { total, system };
}

// Docker `timestamps: true` prepends an RFC3339 timestamp + space.
function splitTimestamp(line: string): { ts: number | null; message: string } {
  const idx = line.indexOf(' ');
  const head = idx >= 0 ? line.slice(0, idx) : line;
  const rest = idx >= 0 ? line.slice(idx + 1) : '';
  const ts = Date.parse(head);
  if (Number.isNaN(ts)) return { ts: null, message: line };
  return { ts, message: rest };
}

// tModLoader join/leave lines. Localized logs have no space between name and
// verb, so we match both phrasings:
//   "<name> has joined."  /  "<name> has left."        (English)
//   "<name>已加入。"        /  "<name>已离开。"           (中文)
// The line may still carry leading tags/timestamps, stripped by cleanName().
function applyLine(st: PlayerState, line: string) {
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (!st.ready) {
    if (/^(Loading mods|正在加载模组)/i.test(clean)) st.stage = '加载模组中';
    if (/^(Loading world|正在加载世界|Generating world|\d+(?:\.\d+)?% - )/i.test(clean)) st.stage = '准备世界中';
    if (/^(?:An error occurred while loading|Failed to load|Unhandled exception)/i.test(clean))
      st.problem = clean.slice(0, 400);
  }
  if (/^(?:Server started|服务器已启动|服务器已开启)[.!。！]?$/.test(clean)) st.ready = true;
  const joinM = line.match(/^(.+?)\s*(?:has joined\.|已加入。)\s*$/);
  if (joinM) {
    const name = cleanName(joinM[1]);
    if (name) {
      st.set.add(name);
      st.ready = true;
    }
    return;
  }
  const leftM = line.match(/^(.+?)\s*(?:has left\.|已离开。)\s*$/);
  if (leftM) {
    const name = cleanName(leftM[1]);
    if (name) st.set.delete(name);
  }
}

function cleanName(raw: string): string {
  let n = raw;
  n = n.replace(/^(\s*\[[^\]]*\]\s*)+/, ''); // leading [TAG] segments
  n = n.replace(
    /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}[\sT]\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*/i,
    ''
  ); // leading wall-clock timestamps
  return n.trim();
}
