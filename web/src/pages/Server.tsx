import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ServerPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    const s = await api.get('/api/server/status');
    setStatus(s);
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, []);

  const action = async (path: string) => {
    setLoading(true);
    await api.post(path);
    await fetchStatus();
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">服务器管理</h1>
      <Card>
        <CardHeader>
          <CardTitle>容器状态</CardTitle>
          <CardDescription>
            {status ? (
              <span className="flex items-center gap-2">
                当前状态:
                {status.state === 'running' ? <Badge>运行中</Badge> : <Badge variant="secondary">{status.state}</Badge>}
              </span>
            ) : (
              '加载中...'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => action('/api/server/start')} disabled={loading || status?.state === 'running'}>
            启动
          </Button>
          <Button variant="secondary" onClick={() => action('/api/server/stop')} disabled={loading || status?.state !== 'running'}>
            停止
          </Button>
          <Button variant="outline" onClick={() => action('/api/server/restart')} disabled={loading}>
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
              <span className="text-muted-foreground">镜像:</span> {status.image}
            </p>
            <p>
              <span className="text-muted-foreground">容器 ID:</span> {status.id?.slice(0, 12)}
            </p>
            <p>
              <span className="text-muted-foreground">启动时间:</span> {status.startedAt ? new Date(status.startedAt).toLocaleString() : '-'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
