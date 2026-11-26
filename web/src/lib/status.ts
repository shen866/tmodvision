import { useEffect, useState } from 'react';
import { api } from './api';

export interface Sample {
  time: number;
  cpu: number | null;
  memory: number;
}
export interface Status {
  phase: string;
  running?: boolean;
  activeVersion?: string;
  plannedVersion: string;
  world?: string;
  plannedWorld: string;
  port: number;
  hostPort?: number;
  maxplayers: number | null;
  players: string[] | null;
  startedAt?: string;
  sampledAt: number | null;
  history: Sample[];
  pending: string[];
  activity?: string;
  lastError?: string;
  appliedKnown: boolean;
  loadedMods: Record<string,string> | null;
  appliedMods: string[] | null;
}
export function useStatus(id?: string) {
  const [data, setData] = useState<Status>();
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api.forServer(id!).get('/status');
        if (!disposed) {
          setData(result);
          setError('');
        }
      } catch (err) {
        if (!disposed) setError((err as Error).message);
      } finally {
        if (!disposed) timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [id, refresh]);
  return { data, error, refresh: () => setRefresh((v) => v + 1) };
}
