import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectOption } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useServers } from '@/contexts/ServerContext';

export default function Create() {
  const navigate = useNavigate();
  const { servers, refreshServers } = useServers();

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [port, setPort] = useState('7778');
  const [dataDir, setDataDir] = useState('');
  const [composeDir, setComposeDir] = useState('');
  const [copyModsFrom, setCopyModsFrom] = useState('');
  const [createWorld, setCreateWorld] = useState(false);
  const [worldName, setWorldName] = useState('');
  const [worldSize, setWorldSize] = useState('2');
  const [worldDifficulty, setWorldDifficulty] = useState('0');
  const [worldSeed, setWorldSeed] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!id || !name || !port) {
      setError('请填写必填项');
      return;
    }

    const body: any = {
      id,
      name,
      port: Number(port),
    };
    if (dataDir) body.dataDir = dataDir;
    if (composeDir) body.composeDir = composeDir;
    if (copyModsFrom) body.copyModsFrom = copyModsFrom;
    if (createWorld && worldName) {
      body.world = {
        name: worldName,
        size: Number(worldSize),
        difficulty: Number(worldDifficulty),
        seed: worldSeed,
      };
    }

    setLoading(true);
    try {
      await api.post('/api/servers', body);
      await refreshServers();
      navigate('/');
    } catch (err: any) {
      setError(err.message || '创建失败');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">新建服务器</h1>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription>设置服务器标识与网络</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">服务器 ID</label>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="例如：overhaul"
                required
              />
              <p className="text-xs text-muted-foreground">仅支持字母、数字、下划线和横线</p>
            </div>
            <div>
              <label className="text-sm font-medium">显示名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">端口</label>
              <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">数据目录（可选）</label>
              <Input
                value={dataDir}
                onChange={(e) => setDataDir(e.target.value)}
                placeholder="默认：./tModLoader-<id>"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Compose 目录（可选）</label>
              <Input
                value={composeDir}
                onChange={(e) => setComposeDir(e.target.value)}
                placeholder="默认：./servers/<id>"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模组预设</CardTitle>
            <CardDescription>可选复制已有服务器的模组配置</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={copyModsFrom} onChange={(e) => setCopyModsFrom(e.target.value)}>
              <SelectOption value="">不复制</SelectOption>
              {servers.map((s) => (
                <SelectOption key={s.id} value={s.id}>
                  {s.name}
                </SelectOption>
              ))}
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>世界参数</CardTitle>
            <CardDescription>立即创建一个世界存档</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={createWorld} onCheckedChange={(v) => setCreateWorld(v)} />
              <label className="text-sm font-medium">创建世界</label>
            </div>

            {createWorld && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">世界名称</label>
                  <Input value={worldName} onChange={(e) => setWorldName(e.target.value)} required={createWorld} />
                </div>
                <div>
                  <label className="text-sm font-medium">种子（可选）</label>
                  <Input value={worldSeed} onChange={(e) => setWorldSeed(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">地图大小</label>
                  <Select value={worldSize} onChange={(e) => setWorldSize(e.target.value)}>
                    <SelectOption value="1">小</SelectOption>
                    <SelectOption value="2">中</SelectOption>
                    <SelectOption value="3">大</SelectOption>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">难度</label>
                  <Select value={worldDifficulty} onChange={(e) => setWorldDifficulty(e.target.value)}>
                    <SelectOption value="0">经典</SelectOption>
                    <SelectOption value="1">专家</SelectOption>
                    <SelectOption value="2">大师</SelectOption>
                    <SelectOption value="3">旅途</SelectOption>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={loading} disabled={loading}>
            创建服务器
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/')} disabled={loading}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
