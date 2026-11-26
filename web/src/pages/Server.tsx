import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useServers } from '@/contexts/ServerContext';
import { useServerStatus } from '@/components/ServerStatus';
import { VersionField } from '@/components/VersionField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';

function Trend({
  title,
  values,
  format,
}: {
  title: string;
  values: number[];
  format: (v: number) => string;
}) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => (100 * i) / Math.max(values.length - 1, 1) + ',' + (31 - (30 * v) / max))
    .join(' ');
  return (
    <div className="rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <strong className="mt-2 block text-xl">
        {values.length ? format(values[values.length - 1]) : '等待采样'}
      </strong>
      {values.length > 1 && (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="mt-3 h-10 w-full text-teal-600"
          role="img"
          aria-label={title + '近期趋势'}
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            vectorEffect="non-scaling-stroke"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  );
}

export default function ServerPage() {
  const id = useParams().serverId!;
  const navigate = useNavigate();
  const { servers, loading, refreshServers } = useServers();
  const server = servers.find((s) => s.id === id);
  const { data, error, refresh } = useServerStatus();
  const client = api.forServer(id);
  const [version, setVersion] = useState('');
  const [port, setPort] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState('');
  const [backup, setBackup] = useState(false);
  const [lastBackup, setLastBackup] = useState('');
  useEffect(() => {
    setVersion(data?.plannedVersion || server?.version || '');
  }, [data?.plannedVersion, server?.version]);
  useEffect(() => {
    setPort(String(server?.port || ''));
  }, [server?.port]);
  useEffect(() => {
    client
      .get('/backups')
      .then((rows) => setLastBackup(rows[0]?.createdAt || ''))
      .catch(() => {});
  }, [id, busy]);
  const run = async (path: string) => {
    setBusy(true);
    setMessage('');
    try {
      if (path === 'delete') {
        await client.del('/');
        await refreshServers();
        navigate('/');
        return;
      }
      if (path === 'restart' && backup) {
        await client.post('/backups', { worldName: data?.world });
      }
      await client.post(
        '/' + path,
        path === 'plan' ? { version: version.trim(), port: Number(port) } : undefined
      );
      if (path === 'plan') await refreshServers();
      setMessage(
        path === 'plan' ? '启动计划已保存' : path === 'prepare' ? '版本镜像已就绪' : '操作已完成'
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      refresh();
      setBusy(false);
      setDialog('');
      setBackup(false);
    }
  };
  if (!server) return <p>{loading ? '读取服务器中…' : '服务器不存在或列表读取失败'}</p>;
  const disabled = busy || !!data?.activity || !!error || !data;
  const history = data?.history || [];
  const uptime =
    data?.running && data.startedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(data.startedAt)) / 60000))
      : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>运行概览</h1>
        <Button asChild variant="outline">
          <Link to={'/server/' + id + '/console'}>打开控制台 →</Link>
        </Button>
      </div>
      {(message || error || data?.lastError) && (
        <p role="status" className="rounded-md border bg-secondary p-3 text-sm">
          {[message, error, data?.lastError].filter(Boolean).join(' · ')}
        </p>
      )}
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['启动世界', data?.world || '—'],
            [
              '在线玩家',
              (error ? '—' : (data?.players?.length ?? '—')) + ' / ' + (data?.maxplayers ?? '—'),
            ],
            ['容器版本', data?.activeVersion || '—'],
            ['运行时长', uptime === null ? '—' : uptime + ' 分钟'],
          ].map(([key, value]) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground">{key}</p>
              <p className="mt-1 break-all font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {!!data?.players?.length && <p className="text-sm">{data.players.join('、')}</p>}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {data?.running ? (
            <>
              <Button disabled={disabled} onClick={() => setDialog('restart')}>
                查看变更并重启
              </Button>
              <Button variant="outline" disabled={disabled} onClick={() => setDialog('stop')}>
                停止
              </Button>
            </>
          ) : (
            <Button disabled={disabled} onClick={() => setDialog('start')}>
              查看计划并启动
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={'/server/' + id + '/mods'}>管理模组</Link>
          </Button>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border p-5">
        <h2>下次启动计划</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <VersionField value={version} onChange={setVersion} />
          <label className="text-sm font-medium">
            对外端口
            <Input
              className="mt-1"
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </label>
        </div>
        <p className="text-sm">目标世界 · {data?.plannedWorld || '—'}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={disabled || !version || !port}
            onClick={() => run('plan')}
          >
            保存计划
          </Button>
          <Button
            variant="outline"
            disabled={disabled || version !== data?.plannedVersion}
            onClick={() => run('prepare')}
          >
            预先准备镜像
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {data?.pending.join('，') ||
            (data?.appliedKnown ? '已与上次启动设置同步' : '首次由面板启动后可比对配置和模组')}
        </p>
      </section>
      <section>
        <h2>运行监控</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          最近 60 次采样 · 最近更新{' '}
          {data?.sampledAt ? new Date(data.sampledAt).toLocaleTimeString() : '—'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Trend
            title="CPU 使用率"
            values={history.flatMap((s) => (s.cpu === null ? [] : [s.cpu]))}
            format={(v) => v.toFixed(1) + '%'}
          />
          <Trend title="内存占用" values={history.map((s) => s.memory)} format={formatBytes} />
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 text-sm">
        <span>最近备份 · {lastBackup ? new Date(lastBackup).toLocaleString() : '—'}</span>
        <Link className="text-primary" to={'/server/' + id + '/backups'}>
          管理备份 →
        </Link>
      </div>
      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer">容器信息与危险操作</summary>
        <p className="my-3">容器 · {server.containerName}</p>
        <Button
          variant="destructive"
          disabled={busy || !!data?.activity}
          onClick={() => setDialog('delete')}
        >
          删除服务器
        </Button>
      </details>
      <Dialog
        open={!!dialog}
        onOpenChange={() => {
          if (!busy) setDialog('');
        }}
      >
        <DialogTitle>
          {
            (
              {
                restart: '确认变更并重启',
                start: '确认启动',
                stop: '停止服务器',
                delete: '永久删除服务器',
              } as Record<string, string>
            )[dialog]
          }
        </DialogTitle>
        <p className="my-3 font-semibold">
          {server.name} · 在线 {data?.players?.length ?? '未知'}
        </p>
        {dialog === 'delete' ? (
          <p>将永久删除这台服的容器、世界、模组、备份和配置。</p>
        ) : dialog === 'stop' ? (
          <p>当前在线玩家将断开连接。</p>
        ) : (
          <>
            <p>
              {data?.plannedVersion} · {data?.plannedWorld} · 端口 {data?.port}
            </p>
            <ul className="my-3 max-h-48 overflow-auto text-sm">
              {data?.pending.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {dialog === 'restart' && (
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={backup}
                  onChange={(e) => setBackup(e.target.checked)}
                />{' '}
                重启前备份当前世界
              </label>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setDialog('')}>
            取消
          </Button>
          <Button
            loading={busy}
            variant={dialog === 'delete' ? 'destructive' : 'default'}
            onClick={() => run(dialog)}
          >
            确认执行
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
