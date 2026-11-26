import { Link } from 'react-router-dom';
import { useServers } from '@/contexts/ServerContext';
import { useStatus } from '@/lib/status';
import { Phase } from '@/components/ServerStatus';
import { Button } from '@/components/ui/button';

function ServerRow({ server }: { server: { id: string; name: string; port: number } }) {
  const { data, error } = useStatus(server.id);
  const base = '/server/' + server.id;
  return (
    <tr className="grid gap-2 border-b p-4 last:border-0 md:table-row">
      <td>
        <Link className="font-semibold text-primary" to={base}>
          {server.name}
        </Link>
        <small className="block text-muted-foreground">:{data?.hostPort || server.port}</small>
      </td>
      <td>
        <Link to={base + '/console'}>
          <Phase value={error ? '状态未知' : data?.phase} />
        </Link>
      </td>
      <td>
        <small className="md:hidden">当前版本 · </small>
        {data?.activeVersion || '—'}
      </td>
      <td>
        <small className="md:hidden">世界 · </small>
        {data?.world || '—'}
      </td>
      <td>
        <small className="md:hidden">在线 · </small>
        {error ? '—' : (data?.players?.length ?? '—')} / {data?.maxplayers ?? '—'}
      </td>
      <td>
        <Link className="text-primary" to={base}>
          {data?.lastError
            ? '查看错误'
            : data?.pending.length
              ? data.pending.length + ' 项变更'
              : '进入管理 →'}
        </Link>
      </td>
    </tr>
  );
}
export default function Dashboard() {
  const { servers, loading, error, refreshServers } = useServers();
  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1>服务器总览</h1>
        <Button asChild>
          <Link to="/create">＋ 新建服务器</Link>
        </Button>
      </header>
      {error ? (
        <p role="alert">
          {error} <button onClick={refreshServers}>重试</button>
        </p>
      ) : loading && !servers.length ? (
        <p>读取服务器中…</p>
      ) : servers.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="fleet w-full text-left text-sm">
            <thead className="hidden bg-secondary md:table-header-group">
              <tr>
                {['服务器', '游戏状态', '容器版本', '启动世界', '在线玩家', '操作'].map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <ServerRow key={s.id} server={s} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2>创建第一台服务器</h2>
          <p className="mt-2 text-muted-foreground">为这台服选择版本、世界和模组。</p>
        </div>
      )}
    </section>
  );
}
