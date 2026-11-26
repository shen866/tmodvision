import { useEffect, useState } from 'react';
import { useServerStatus } from '@/components/ServerStatus';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Mod {
  name: string;
  enabled: boolean;
  version?: string;
  loader?: string;
  size: number;
  mtime: string;
}

interface WorkshopResult {
  publishedFileId: string;
  title: string;
  description: string;
  previewUrl?: string;
}

export default function ModsPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const {data: status, refresh} = useServerStatus();
  const [mods, setMods] = useState<Mod[]>([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkshopResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [workshopId, setWorkshopId] = useState('');
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchError, setSearchError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Mod | null>(null);

  const serverApi = serverId ? api.forServer(serverId) : null;

  const fetchMods = async () => {
    if (!serverApi) return;
    setModsLoading(true);
    try {
      const data = await serverApi.get('/mods');
      setMods(data); refresh();
    } catch (err) { setMessage((err as Error).message); } finally {
      setModsLoading(false);
    }
  };

  useEffect(() => {
    fetchMods();
  }, [serverId]);

  async function importFile(file?: File) {
    if (!file || !serverApi) return;
    setImporting(true);
    try {
      const result = await serverApi.post('/mods/import',file);
      setMessage('已导入 ' + result.name + ' v' + result.version + '，可在本服清单中选择启用');
      await fetchMods();
    } catch (err) {setMessage((err as Error).message);}
    finally {setImporting(false);}
  }

  const toggle = async (mod: Mod) => {
    if (!serverApi) return;
    setTogglingIds((prev) => new Set(prev).add(mod.name));
    try {
      if (mod.enabled) {
        await serverApi.post(`/mods/${encodeURIComponent(mod.name)}/disable`);
      } else {
        await serverApi.post(`/mods/${encodeURIComponent(mod.name)}/enable`);
      }
      setMessage(`${mod.name} 已${mod.enabled ? '禁用' : '启用'}，重启服务器后生效`);
      await fetchMods();
    } catch (err: any) {
      setMessage(err.message || '操作失败');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(mod.name);
        return next;
      });
    }
  };

  const deleteMod = async (mod: Mod) => {
    if (!serverApi) return;
    setDeletingId(mod.name);
    try {
      await serverApi.del(`/mods/${encodeURIComponent(mod.name)}`);
      setDeleteTarget(null);
      await fetchMods();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const search = async () => {
    if (!serverApi) return;
    setSearching(true);
    setSearchError('');
    try {
      const data = await serverApi.get(`/mods/workshop/search?q=${encodeURIComponent(query)}`);
      setResults(data);
    } catch (e: any) {
      setSearchError(e.message || '搜索失败');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const install = async (id: string) => {
    if (!serverApi || !id) return;
    setInstallingIds((prev) => new Set(prev).add(id));
    setMessage('');
    try {
      await serverApi.post('/mods/workshop/install', { workshopId: id });
      setMessage(`模组 ${id} 安装成功，重启服务器后生效`);
      setQuery('');
      setResults([]);
      setWorkshopId('');
      await fetchMods();
    } catch (e: any) {
      setMessage(e.message || '安装失败');
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (!serverApi) {
    return <div className="p-10 text-center">缺少服务器标识</div>;
  }

  const isInstalling = (id: string) => installingIds.has(id);
  const isToggling = (name: string) => togglingIds.has(name);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">模组管理</h1>

      {message && <p className="text-sm text-primary">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>本服模组</CardTitle>
          <label className="text-sm">导入本地 .tmod
            <input aria-label="导入本地模组" className="ml-2 max-w-full text-xs" type="file" accept=".tmod" disabled={importing}
              onChange={e=>{const file=e.target.files?.[0]; e.target.value=''; importFile(file);}}/>
          </label>
        </CardHeader>
        <CardContent className="space-y-2">
          {modsLoading && <p className="text-sm text-muted-foreground">加载中...</p>}
          {!modsLoading &&
            mods.map((mod) => (
              <div key={mod.name} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{mod.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {mod.version ? 'v' + mod.version + ' · ' : ''}{mod.loader ? '构建于 tML ' + mod.loader + ' · ' : ''}{formatBytes(mod.size)} · {new Date(mod.mtime).toLocaleString()}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{status?.loadedMods ? (status.loadedMods[mod.name] ? '运行中 · v' + status.loadedMods[mod.name] : '本次未加载') : status?.appliedMods?.includes(mod.name) ? '本次启动已选用 · 加载待确认' : '加载状态待确认'}</p>
                <div className="flex items-center gap-3">
                  {mod.enabled ? <Badge>下次启用</Badge> : <Badge variant="outline">下次禁用</Badge>}
                  <Switch
                    checked={mod.enabled}
                    onCheckedChange={() => toggle(mod)}
                    disabled={isToggling(mod.name)}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(mod)}
                    disabled={deletingId === mod.name}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          {!modsLoading && mods.length === 0 && <p className="text-sm text-muted-foreground">暂无模组</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>工坊搜索</CardTitle>
          <CardDescription>需要配置 STEAM_API_KEY，否则请使用下方 ID 安装</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="搜索创意工坊模组..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={searching}
            />
            <Button onClick={search} disabled={searching || !query} loading={searching}>
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
                <Button
                  size="sm"
                  onClick={() => install(r.publishedFileId)}
                  loading={isInstalling(r.publishedFileId)}
                  disabled={isInstalling(r.publishedFileId)}
                >
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
          <Input
            placeholder="创意工坊 ID"
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            disabled={isInstalling(workshopId)}
          />
          <Button
            onClick={() => install(workshopId)}
            loading={isInstalling(workshopId)}
            disabled={isInstalling(workshopId) || !workshopId}
          >
            安装
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>确定要删除模组 {deleteTarget?.name} 吗？此操作不可恢复。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={!!deletingId}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteTarget && deleteMod(deleteTarget)}
            loading={!!deletingId}
            disabled={!!deletingId}
          >
            删除
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
