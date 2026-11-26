import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface Server {
  id: string;
  name: string;
  containerName: string;
  composeDir: string;
  dataDir: string;
  port: number;
  version?: string;
}

interface ServerContextValue {
  servers: Server[];
  loading: boolean;
  error: string;
  currentServerId: string | null;
  setCurrentServerId: (id: string) => void;
  currentServer: Server | null;
  refreshServers: () => Promise<void>;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ serverId?: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);

  const refreshServers = useCallback(async () => {
    try {
      const res = await fetch('/api/servers');
      if (!res.ok) throw new Error('Failed to fetch servers');
      const data = await res.json();
      setServers(data);
      setError('');
      // If URL has serverId, sync current selection
      if (params.serverId) {
        setCurrentServerId(params.serverId);
      } else if (data.length > 0 && !currentServerId) {
        setCurrentServerId(data[0].id);
      }
    } catch (err) {
      setError('服务器列表读取失败');
    } finally {
      setLoading(false);
    }
  }, [params.serverId, currentServerId]);

  useEffect(() => {
    refreshServers();
  }, [refreshServers]);

  useEffect(() => {
    if (params.serverId && params.serverId !== currentServerId) {
      setCurrentServerId(params.serverId);
    }
  }, [params.serverId]);

  const currentServer = servers.find((s) => s.id === currentServerId) || null;

  return (
    <ServerContext.Provider
      value={{
        servers, loading, error,
        currentServerId,
        setCurrentServerId,
        currentServer,
        refreshServers,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServers() {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error('useServers must be used within ServerProvider');
  return ctx;
}
