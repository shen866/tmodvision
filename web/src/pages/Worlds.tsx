import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectOption } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface World {
  name: string;
  size: number;
  mtime: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function WorldsPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [size, setSize] = useState('2');
  const [difficulty, setDifficulty] = useState('0');
  const [seed, setSeed] = useState('');
  const [creating, setCreating] = useState(false);
  const [actingWorld, setActingWorld] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const serverApi = serverId ? api.forServer(serverId) : null;

  const fetchWorlds = async () => {
    if (!serverApi) return;
    setWorldsLoading(true);
    try {
      const data = await serverApi.get('/worlds');
      setWorlds(data);
      const cfg = await serverApi.get('/config');
      setConfig(cfg);
    } finally {
      setWorldsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorlds();
  }, [serverId]);

  const activeWorld = config.world?.split('/').pop()?.replace('.wld', '') || '';

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverApi) return;
    setCreating(true);
    setMessage('');
    try {
      await serverApi.post('/worlds', { name, size: Number(size), difficulty: Number(difficulty), seed });
      setMessage('世界创建成功');
      setName('');
      await fetchWorlds();
    } catch (err: any) {
      setMessage(err.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const del = async (name: string) => {
    if (!serverApi) return;
    if (!confirm(`确定删除世界 ${name} 吗？`)) return;
    setActingWorld(name);
    try {
      await serverApi.del(`/worlds/${encodeURIComponent(name)}`);
      await fetchWorlds();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    } finally {
      setActingWorld(null);
    }
  };

  const backup = async (name: string) => {
    if (!serverApi) return;
    setActingWorld(name);
    try {
      const res = await serverApi.post(`/worlds/${encodeURIComponent(name)}/backup`);
      setMessage(`已备份: ${res.fileName}`);
    } catch (err: any) {
      setMessage(err.message || '备份失败');
    } finally {
      setActingWorld(null);
    }
  };

  const activate = async (name: string) => {
    if (!serverApi) return;
    setActingWorld(name);
    try {
      await serverApi.post(`/worlds/${encodeURIComponent(name)}/activate`);
      setMessage(`已切换至世界 ${name}，重启服务器后生效`);
      await fetchWorlds();
    } catch (err: any) {
      setMessage(err.message || '切换失败');
    } finally {
      setActingWorld(null);
    }
  };

  if (!serverApi) {
    return <div className="p-10 text-center">缺少服务器标识</div>;
  }

  const isActing = (name: string) => actingWorld === name;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">世界管理</h1>
      {message && <p className="text-sm text-primary">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>创建新世界</CardTitle>
          <CardDescription>创建完成后需要启动/重启服务器</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="世界名称" value={name} onChange={(e) => setName(e.target.value)} required />
            <Select value={size} onChange={(e) => setSize(e.target.value)}>
              <SelectOption value="1">小</SelectOption>
              <SelectOption value="2">中</SelectOption>
              <SelectOption value="3">大</SelectOption>
            </Select>
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <SelectOption value="0">经典</SelectOption>
              <SelectOption value="1">专家</SelectOption>
              <SelectOption value="2">大师</SelectOption>
              <SelectOption value="3">旅途</SelectOption>
            </Select>
            <Input placeholder="种子 (可选)" value={seed} onChange={(e) => setSeed(e.target.value)} />
            <div className="md:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={creating || !name} loading={creating}>
                创建
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>世界列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {worldsLoading && <p className="text-sm text-muted-foreground">加载中...</p>}
          {!worldsLoading &&
            worlds.map((world) => (
              <div key={world.name} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {world.name} {world.name === activeWorld && <Badge>当前</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(world.size)} · {new Date(world.mtime).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => backup(world.name)}
                    loading={isActing(world.name)}
                    disabled={isActing(world.name)}
                  >
                    备份
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activate(world.name)}
                    loading={isActing(world.name)}
                    disabled={isActing(world.name)}
                  >
                    切换
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => del(world.name)}
                    loading={isActing(world.name)}
                    disabled={isActing(world.name)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          {!worldsLoading && worlds.length === 0 && <p className="text-sm text-muted-foreground">暂无世界</p>}
        </CardContent>
      </Card>
    </div>
  );
}
