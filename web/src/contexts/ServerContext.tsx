import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface Server {
  id: string;
  name: string;
  containerName: string;
  composeDir: string;
  dataDir: string;
  port: number;
}

interface ServerContextValue {
  servers: Server[];
  currentServerId: string | null;
  setCurrentServerId: (id: string) => void;
  currentServer: Server | null;
  refreshServers: () => Promise<void>;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ serverId?: string }>();
  const [servers, setServers] = useState<Server[]>([]);
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);

  const refreshServers = useCallback(async () => {
    try {
      const res = await fetch('/api/servers', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('tmodvision_token') || ''}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch servers');
      const data = await res.json();
      setServers(data);
      // If URL has serverId, sync current selection
      if (params.serverId) {
        setCurrentServerId(params.serverId);
      } else if (data.length > 0 && !currentServerId) {
        setCurrentServerId(data[0].id);
      }
    } catch (err) {
      console.error(err);
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
        servers,
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
