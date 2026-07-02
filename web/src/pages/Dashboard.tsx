import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useServers } from '@/contexts/ServerContext';

interface ServerStatus {
  state: string;
  port: number | null;
  maxplayers: number | null;
}

export default function Dashboard() {
  const { servers, refreshServers } = useServers();
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({});

  const fetchStatuses = async () => {
    const next: Record<string, ServerStatus> = {};
    await Promise.all(
      servers.map(async (s) => {
        try {
          const status = await api.forServer(s.id).get('/status');
          next[s.id] = status;
        } catch {
          next[s.id] = { state: 'unknown', port: s.port, maxplayers: null };
        }
      })
    );
    setStatuses(next);
  };

  useEffect(() => {
    refreshServers();
  }, []);

  useEffect(() => {
    if (servers.length === 0) return;
    fetchStatuses();
    const id = setInterval(fetchStatuses, 3000);
    return () => clearInterval(id);
  }, [servers]);

  const stateBadge = (state: string) => {
    if (state === 'running') return <Badge>运行中</Badge>;
    if (state === 'exited') return <Badge variant="secondary">已停止</Badge>;
    return <Badge variant="outline">{state || '未知'}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <Button variant="outline" size="sm" onClick={refreshServers}>
          刷新
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => {
          const status = statuses[server.id];
          return (
            <Card key={server.id}>
              <CardHeader>
                <CardTitle>{server.name}</CardTitle>
                <CardDescription>
                  {status ? stateBadge(status.state) : '加载中...'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">端口:</span> {server.port}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">玩家:</span>{' '}
                  {status?.maxplayers ? `- / ${status.maxplayers}` : '-'}
                </p>
                <Button size="sm" asChild className="w-full">
                  <Link to={`/server/${server.id}`}>进入管理</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {servers.length === 0 && (
          <p className="text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
            暂无服务器配置，请在 ./data/servers.json 中配置或启动默认单服模式。
          </p>
        )}
      </div>
    </div>
  );
}
