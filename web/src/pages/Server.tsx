import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useServers } from '@/contexts/ServerContext';

export default function ServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { servers } = useServers();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const server = servers.find((s) => s.id === serverId);

  const fetchStatus = async () => {
    if (!serverId) return;
    const s = await api.forServer(serverId).get('/status');
    setStatus(s);
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [serverId]);

  const action = async (path: string) => {
    if (!serverId) return;
    setLoading(true);
    await api.forServer(serverId).post(path);
    await fetchStatus();
    setLoading(false);
  };

  if (!server) {
    return <div className="p-10 text-center">服务器不存在</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <p className="text-sm text-muted-foreground">端口: {server.port}</p>
        </div>
        {status && (
          <Badge variant={status.state === 'running' ? 'default' : 'secondary'}>
            {status.state === 'running' ? '运行中' : status.state}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>控制台</CardTitle>
            <CardDescription>实时日志与命令</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild className="w-full">
              <Link to={`/server/${serverId}/console`}>打开</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模组</CardTitle>
            <CardDescription>启用、禁用、安装模组</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild className="w-full">
              <Link to={`/server/${serverId}/mods`}>管理</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>世界</CardTitle>
            <CardDescription>创建、切换、备份世界</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild className="w-full">
              <Link to={`/server/${serverId}/worlds`}>管理</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>配置</CardTitle>
            <CardDescription>编辑 serverconfig.txt</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild className="w-full">
              <Link to={`/server/${serverId}/config`}>编辑</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>容器控制</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            size="sm"
            onClick={() => action('/start')}
            disabled={loading || status?.state === 'running'}
          >
            启动
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => action('/stop')}
            disabled={loading || status?.state !== 'running'}
          >
            停止
          </Button>
          <Button variant="outline" size="sm" onClick={() => action('/restart')} disabled={loading}>
            重启
          </Button>
        </CardContent>
      </Card>

      {status && (
        <Card>
          <CardHeader>
            <CardTitle>详细信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">容器名:</span> {server.containerName}
            </p>
            <p>
              <span className="text-muted-foreground">镜像:</span> {status.image || '-'}
            </p>
            <p>
              <span className="text-muted-foreground">容器 ID:</span>{' '}
              {status.id?.slice(0, 12) || '-'}
            </p>
            <p>
              <span className="text-muted-foreground">启动时间:</span>{' '}
              {status.startedAt ? new Date(status.startedAt).toLocaleString() : '-'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
