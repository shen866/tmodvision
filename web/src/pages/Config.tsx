import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectOption } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ConfigPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const serverApi = serverId ? api.forServer(serverId) : null;

  const fetchConfig = async () => {
    if (!serverApi) return;
    setConfigLoading(true);
    try {
      const data = await serverApi.get('/config');
      setConfig(data);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [serverId]);

  const update = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!serverApi) return;
    setSaving(true);
    setMessage('');
    try {
      await serverApi.post('/config', config);
      setMessage('配置已保存，重启服务器后生效');
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!serverApi) {
    return <div className="p-10 text-center">缺少服务器标识</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">服务器配置</h1>
      {message && <p className="text-sm text-primary">{message}</p>}
      <Card>
        <CardHeader>
          <CardTitle>serverconfig.txt</CardTitle>
          <CardDescription>修改常用配置项，保存后重启服务器生效</CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">世界文件</label>
                  <Input value={config.world || ''} onChange={(e) => update('world', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">世界名称</label>
                  <Input value={config.worldname || ''} onChange={(e) => update('worldname', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">自动创建大小</label>
                  <Select value={config.autocreate || '2'} onChange={(e) => update('autocreate', e.target.value)}>
                    <SelectOption value="1">小</SelectOption>
                    <SelectOption value="2">中</SelectOption>
                    <SelectOption value="3">大</SelectOption>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">难度</label>
                  <Select value={config.difficulty || '0'} onChange={(e) => update('difficulty', e.target.value)}>
                    <SelectOption value="0">经典</SelectOption>
                    <SelectOption value="1">专家</SelectOption>
                    <SelectOption value="2">大师</SelectOption>
                    <SelectOption value="3">旅途</SelectOption>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">最大玩家数</label>
                  <Input type="number" value={config.maxplayers || ''} onChange={(e) => update('maxplayers', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">端口</label>
                  <Input type="number" value={config.port || ''} onChange={(e) => update('port', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">密码</label>
                  <Input value={config.password || ''} onChange={(e) => update('password', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">欢迎消息 (MOTD)</label>
                  <Input value={config.motd || ''} onChange={(e) => update('motd', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">语言</label>
                  <Input value={config.language || ''} onChange={(e) => update('language', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Secure</label>
                  <Select value={config.secure || '0'} onChange={(e) => update('secure', e.target.value)}>
                    <SelectOption value="0">关闭</SelectOption>
                    <SelectOption value="1">开启</SelectOption>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">种子</label>
                  <Input value={config.seed || ''} onChange={(e) => update('seed', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">NPC Stream</label>
                  <Input type="number" value={config.npcstream || ''} onChange={(e) => update('npcstream', e.target.value)} />
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={save} disabled={saving} loading={saving}>
                  保存配置
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
