import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useServers } from '@/contexts/ServerContext';

export default function ServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { servers, refreshServers } = useServers();
  const navigate = useNavigate();
  const [status, setStatus] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const server = servers.find((s) => s.id === serverId);

  const fetchStatus = async () => {
    if (!serverId) return;
    try {
      const s = await api.forServer(serverId).get('/status');
      setStatus(s);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [serverId]);

  const action = async (path: string, setter: (v: boolean) => void) => {
    if (!serverId) return;
    setter(true);
    try {
      await api.forServer(serverId).post(path);
      await fetchStatus();
    } finally {
      setter(false);
    }
  };

  const handleDelete = async () => {
    if (!serverId) return;
    setDeleting(true);
    try {
      await api.forServer(serverId).del('/');
      await refreshServers();
      navigate('/');
    } catch (err: any) {
      alert(err.message || '删除失败');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
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
        {initialLoading ? (
          <Badge variant="outline">加载中...</Badge>
        ) : (
          status && (
            <Badge variant={status.state === 'running' ? 'default' : 'secondary'}>
              {status.state === 'running' ? '运行中' : status.state}
            </Badge>
          )
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
            onClick={() => action('/start', setStarting)}
            disabled={starting || stopping || restarting || status?.state === 'running'}
            loading={starting}
          >
            启动
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => action('/stop', setStopping)}
            disabled={starting || stopping || restarting || status?.state !== 'running'}
            loading={stopping}
          >
            停止
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => action('/restart', setRestarting)}
            disabled={starting || stopping || restarting}
            loading={restarting}
          >
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

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">危险区域</CardTitle>
          <CardDescription>删除服务器会移除容器、世界、模组、配置等所有相关数据</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            删除服务器
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader>
          <DialogTitle>确认删除服务器</DialogTitle>
          <DialogDescription>
            确定要删除服务器「{server.name}」吗？此操作将停止并移除容器，并永久删除其世界、模组、配置等所有数据，且不可恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleDelete} loading={deleting} disabled={deleting}>
            删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
