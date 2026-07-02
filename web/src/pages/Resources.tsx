import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface DiskUsage {
  serverId: string;
  serverName: string;
  total: number;
  worlds: number;
  mods: number;
  backups: number;
  steamMods: number;
}

interface TotalUsage {
  total: number;
  steamMods: number;
  servers: DiskUsage[];
}

interface OrphanedMod {
  workshopId: string;
  internalNames: string[];
  size: number;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function Resources() {
  const [usage, setUsage] = useState<TotalUsage | null>(null);
  const [orphans, setOrphans] = useState<OrphanedMod[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchData = async () => {
    const u = await api.get('/api/resources/usage');
    setUsage(u);
    const o = await api.get('/api/resources/orphans');
    setOrphans(o);
    setSelected(new Set());
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const cleanup = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定清理选中的 ${selected.size} 个工坊缓存吗？`)) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await api.post('/api/resources/cleanup', { workshopIds: Array.from(selected) });
      setMessage(`已释放 ${formatBytes(res.freed)} 空间`);
      await fetchData();
    } catch (err: any) {
      setMessage(err.message || '清理失败');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">资源管理</h1>
      {message && <p className="text-sm text-primary">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>磁盘占用</CardTitle>
          <CardDescription>各服务器数据目录占用统计</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage && (
            <>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">总占用</p>
                <p className="text-2xl font-bold">{formatBytes(usage.total)}</p>
                <p className="text-xs text-muted-foreground">
                  共享 steamMods 缓存: {formatBytes(usage.steamMods)}
                </p>
              </div>
              <div className="space-y-2">
                {usage.servers.map((s) => (
                  <div key={s.serverId} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{s.serverName}</p>
                      <p className="text-sm font-medium">{formatBytes(s.total)}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-4">
                      <p>Worlds: {formatBytes(s.worlds)}</p>
                      <p>Mods: {formatBytes(s.mods)}</p>
                      <p>备份: {formatBytes(s.backups)}</p>
                      <p>steamMods: {formatBytes(s.steamMods)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>可清理缓存</CardTitle>
          <CardDescription>未被任何服务器 enabled.json 引用的工坊模组</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {orphans.length === 0 && <p className="text-sm text-muted-foreground">暂无可清理缓存</p>}
          {orphans.map((o) => (
            <div key={o.workshopId} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">Workshop ID: {o.workshopId}</p>
                <p className="text-xs text-muted-foreground">
                  {o.internalNames.join(', ')} · {formatBytes(o.size)}
                </p>
              </div>
              <Switch
                checked={selected.has(o.workshopId)}
                onCheckedChange={() => toggleSelect(o.workshopId)}
              />
            </div>
          ))}
          {orphans.length > 0 && (
            <Button onClick={cleanup} disabled={loading || selected.size === 0}>
              {loading ? '清理中...' : `清理选中项 (${formatBytes(orphans.filter((o) => selected.has(o.workshopId)).reduce((sum, o) => sum + o.size, 0))})`}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
