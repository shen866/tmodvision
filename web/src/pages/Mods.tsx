import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Mod {
  name: string;
  enabled: boolean;
  size: number;
  mtime: string;
}

interface WorkshopResult {
  publishedFileId: string;
  title: string;
  description: string;
  previewUrl?: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ModsPage() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkshopResult[]>([]);
  const [workshopId, setWorkshopId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchError, setSearchError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Mod | null>(null);

  const fetchMods = async () => {
    const data = await api.get('/api/mods');
    setMods(data);
  };

  useEffect(() => {
    fetchMods();
  }, []);

  const toggle = async (mod: Mod) => {
    if (mod.enabled) {
      await api.post(`/api/mods/${encodeURIComponent(mod.name)}/disable`);
    } else {
      await api.post(`/api/mods/${encodeURIComponent(mod.name)}/enable`);
    }
    await fetchMods();
  };

  const deleteMod = async (mod: Mod) => {
    await api.del(`/api/mods/${encodeURIComponent(mod.name)}`);
    setDeleteTarget(null);
    await fetchMods();
  };

  const search = async () => {
    setLoading(true);
    setSearchError('');
    try {
      const data = await api.get(`/api/mods/workshop/search?q=${encodeURIComponent(query)}`);
      setResults(data);
    } catch (e: any) {
      setSearchError(e.message || '搜索失败');
      setResults([]);
    }
    setLoading(false);
  };

  const install = async (id: string) => {
    setLoading(true);
    setMessage('');
    try {
      await api.post('/api/mods/workshop/install', { workshopId: id });
      setMessage(`模组 ${id} 安装成功`);
      await fetchMods();
    } catch (e: any) {
      setMessage(e.message || '安装失败');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">模组管理</h1>

      {message && <p className="text-sm text-primary">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>工坊搜索</CardTitle>
          <CardDescription>需要配置 STEAM_API_KEY，否则请使用下方 ID 安装</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="搜索创意工坊模组..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button onClick={search} disabled={loading || !query}>
              搜索
            </Button>
          </div>
          {searchError && <p className="text-sm text-destructive">{searchError}</p>}
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.publishedFileId} className="flex items-start justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">ID: {r.publishedFileId}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                </div>
                <Button size="sm" onClick={() => install(r.publishedFileId)} disabled={loading}>
                  安装
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>通过工坊 ID 安装</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="创意工坊 ID" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)} />
          <Button onClick={() => install(workshopId)} disabled={loading || !workshopId}>
            安装
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已安装模组</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mods.map((mod) => (
            <div key={mod.name} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{mod.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(mod.size)} · {new Date(mod.mtime).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {mod.enabled ? <Badge>已启用</Badge> : <Badge variant="outline">未启用</Badge>}
                <Switch checked={mod.enabled} onCheckedChange={() => toggle(mod)} />
                <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(mod)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
          {mods.length === 0 && <p className="text-sm text-muted-foreground">暂无模组</p>}
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>确定要删除模组 {deleteTarget?.name} 吗？此操作不可恢复。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button variant="destructive" onClick={() => deleteTarget && deleteMod(deleteTarget)}>
            删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
