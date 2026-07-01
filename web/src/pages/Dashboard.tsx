import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Dashboard() {
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

  const stateBadge = (state: string) => {
    if (state === 'running') return <Badge>运行中</Badge>;
    if (state === 'exited') return <Badge variant="secondary">已停止</Badge>;
    return <Badge variant="outline">{state || '未知'}</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>服务器状态</CardTitle>
            <CardDescription>{status ? stateBadge(status.state) : '加载中...'}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button size="sm" onClick={() => action('/api/server/start')} disabled={loading || status?.state === 'running'}>
              启动
            </Button>
            <Button size="sm" variant="secondary" onClick={() => action('/api/server/stop')} disabled={loading || status?.state !== 'running'}>
              停止
            </Button>
            <Button size="sm" variant="outline" onClick={() => action('/api/server/restart')} disabled={loading}>
              重启
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模组</CardTitle>
            <CardDescription>管理已安装模组与工坊搜索</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild>
              <Link to="/mods">前往模组页</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>世界</CardTitle>
            <CardDescription>创建、切换、备份世界</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild>
              <Link to="/worlds">前往世界页</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>配置</CardTitle>
            <CardDescription>修改 serverconfig.txt</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild>
              <Link to="/config">编辑配置</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>控制台</CardTitle>
            <CardDescription>实时日志与命令</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild>
              <Link to="/console">打开控制台</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
