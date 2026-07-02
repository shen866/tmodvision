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
  startedAt: string | null; // docker container.State.StartedAt
  sinceSec: number | null; // unix-seconds watermark of last consumed log line
}

const states = new Map<string, PlayerState>();
const POLL_INTERVAL_MS = 5000;
const INITIAL_TAIL = 1000;

let pollTimer: NodeJS.Timeout | null = null;
let polling = false;

function getState(serverId: string): PlayerState {
  let st = states.get(serverId);
  if (!st) {
    st = { set: new Set(), startedAt: null, sinceSec: null };
    states.set(serverId, st);
  }
  return st;
}

export function getOnlinePlayers(serverId: string): string[] {
  return Array.from(getState(serverId).set);
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
    st.startedAt = info.State.StartedAt;
    st.sinceSec = null;
  }

  const buf = await container.logs({
    follow: false,
    stdout: true,
    stderr: true,
    timestamps: true,
    ...(st.sinceSec == null ? { tail: INITIAL_TAIL } : { since: st.sinceSec }),
  });
  const chunks = parseDockerLog(buf);

  let maxTs: number | null = null;
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      if (!line) continue;
      const { ts, message } = splitTimestamp(line);
      if (ts != null && ts > (maxTs ?? -1)) maxTs = ts;
      applyLine(st, message);
    }
  }

  if (maxTs != null) st.sinceSec = maxTs + 1;
}

// Docker `timestamps: true` prepends an RFC3339 timestamp + space.
function splitTimestamp(line: string): { ts: number | null; message: string } {
  const idx = line.indexOf(' ');
  const head = idx >= 0 ? line.slice(0, idx) : line;
  const rest = idx >= 0 ? line.slice(idx + 1) : '';
  const ts = Date.parse(head);
  if (Number.isNaN(ts)) return { ts: null, message: line };
  return { ts: Math.floor(ts / 1000), message: rest };
}

// tModLoader join/leave lines. Localized logs have no space between name and
// verb, so we match both phrasings:
//   "<name> has joined."  /  "<name> has left."        (English)
//   "<name>已加入。"        /  "<name>已离开。"           (中文)
// The line may still carry leading tags/timestamps, stripped by cleanName().
function applyLine(st: PlayerState, line: string) {
  const joinM = line.match(/^(.+?)\s*(?:has joined\.|已加入。)\s*$/);
  if (joinM) {
    const name = cleanName(joinM[1]);
    if (name) st.set.add(name);
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
