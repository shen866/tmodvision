import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useServers } from '@/contexts/ServerContext';

interface BackupInfo {
  fileName: string;
  serverId: string;
  worldName: string;
  createdAt: string;
  size: number;
}

interface BackupConfig {
  enabled: boolean;
  intervalHours: number;
  keepCount: number;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function Backups() {
  const { serverId } = useParams<{ serverId: string }>();
  const { servers } = useServers();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [config, setConfig] = useState<BackupConfig>({ enabled: false, intervalHours: 6, keepCount: 10 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const server = servers.find((s) => s.id === serverId);
  const serverApi = serverId ? api.forServer(serverId) : null;

  const fetchBackups = async () => {
    if (!serverApi) return;
    const data = await serverApi.get('/backups');
    setBackups(data);
  };

  const fetchConfig = async () => {
    if (!serverApi) return;
    const data = await serverApi.get('/backups/config');
    setConfig(data);
  };

  useEffect(() => {
    fetchBackups();
    fetchConfig();
  }, [serverId]);

  const create = async () => {
    if (!serverApi) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await serverApi.post('/backups');
      setMessage(`已创建备份: ${res.fileName}`);
      await fetchBackups();
    } catch (err: any) {
      setMessage(err.message || '备份失败');
    }
    setLoading(false);
  };

  const restore = async (fileName: string) => {
    if (!serverApi) return;
    if (!confirm(`确定恢复备份 ${fileName} 吗？当前世界会自动预备份。`)) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await serverApi.post(`/backups/${encodeURIComponent(fileName)}/restore`);
      setMessage(res.message);
      await fetchBackups();
    } catch (err: any) {
      setMessage(err.message || '恢复失败');
    }
    setLoading(false);
  };

  const del = async (fileName: string) => {
    if (!serverApi) return;
    if (!confirm(`确定删除备份 ${fileName} 吗？`)) return;
    setLoading(true);
    try {
      await serverApi.del(`/backups/${encodeURIComponent(fileName)}`);
      await fetchBackups();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    if (!serverApi) return;
    setLoading(true);
    setMessage('');
    try {
      await serverApi.post('/backups/config', config);
      setMessage('自动备份配置已保存');
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    }
    setLoading(false);
  };

  if (!serverApi) {
    return <div className="p-10 text-center">缺少服务器标识</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">备份管理</h1>
        <p className="text-sm text-muted-foreground">{server?.name}</p>
      </div>
      {message && <p className="text-sm text-primary">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>自动备份配置</CardTitle>
          <CardDescription>配置修改后保存生效</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
            />
            <span className="text-sm font-medium">启用自动备份</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">间隔（小时）</label>
              <Input
                type="number"
                value={config.intervalHours}
                onChange={(e) => setConfig((c) => ({ ...c, intervalHours: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">保留数量</label>
              <Input
                type="number"
                value={config.keepCount}
                onChange={(e) => setConfig((c) => ({ ...c, keepCount: Number(e.target.value) }))}
              />
            </div>
          </div>
          <Button onClick={saveConfig} disabled={loading}>
            保存配置
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>手动备份</CardTitle>
          <CardDescription>立即备份当前世界</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={create} disabled={loading}>
            立即备份
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>备份列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {backups.map((b) => (
            <div key={b.fileName} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{b.worldName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(b.size)} · {new Date(b.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => restore(b.fileName)} disabled={loading}>
                  恢复
                </Button>
                <Button size="sm" variant="destructive" onClick={() => del(b.fileName)} disabled={loading}>
                  删除
                </Button>
              </div>
            </div>
          ))}
          {backups.length === 0 && <p className="text-sm text-muted-foreground">暂无备份</p>}
        </CardContent>
      </Card>
    </div>
  );
}
