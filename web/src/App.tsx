import { Routes, Route, Navigate, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ServerProvider, useServers } from '@/contexts/ServerContext';
import { StatusProvider, Phase, useServerStatus } from '@/components/ServerStatus';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import ServerPage from '@/pages/Server';
import ModsPage from '@/pages/Mods';
import WorldsPage from '@/pages/Worlds';
import ConfigPage from '@/pages/Config';
import ConsolePage from '@/pages/Console';
import CreatePage from '@/pages/Create';
import ResourcesPage from '@/pages/Resources';
import BackupsPage from '@/pages/Backups';

function ServerSidebar() {
  const location = useLocation();
  const { serverId } = useParams<{ serverId: string }>();
  const { servers } = useServers();
  const navigate = useNavigate();

  if (!serverId) return null;

  const links = [
    { path: `/server/${serverId}`, label: '运行概览' },
    { path: `/server/${serverId}/console`, label: '控制台' },
    { path: `/server/${serverId}/mods`, label: '模组' },
    { path: `/server/${serverId}/worlds`, label: '世界' },
    { path: `/server/${serverId}/config`, label: '配置' },
    { path: `/server/${serverId}/backups`, label: '备份' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <p className="px-3 text-xs font-medium text-muted-foreground">当前服务器</p>
        <select
          aria-label="切换服务器" value={serverId}
          onChange={(e) => {
            const id = e.target.value;
            navigate(location.pathname.replace('/server/' + serverId, '/server/' + id));
          }}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.port})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        {links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              location.pathname === link.path
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { serverId } = useParams();
  const { servers } = useServers();
  const selected = servers.find(s => s.id === serverId);
  const { data, error } = useServerStatus();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [location.pathname]);
  const isHome = location.pathname === '/';

  const logout = async () => {
    await api.logout();
    localStorage.removeItem('tmodvision_token');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b bg-background px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-xl font-bold text-primary">
              tModVision
            </Link>
            <span className="text-xs text-muted-foreground">服务器管理</span>
          </div>
          <div className="flex gap-2"><Button className="md:hidden" variant="outline" size="sm" onClick={() => setMenu(!menu)} aria-expanded={menu}>导航</Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            退出
          </Button></div>
        </div>
      </header>
      <div className="mx-auto flex w-full relative max-w-7xl flex-1 gap-6 overflow-hidden p-3 md:p-6">
        <aside aria-label="主导航" className={'w-52 shrink-0 flex-col gap-3 overflow-y-auto md:static md:flex ' + (menu ? 'absolute inset-y-0 left-0 z-20 flex border-r bg-background p-4 shadow-lg' : 'hidden')}>
          <Link
            to="/"
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              isHome
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            服务器总览
          </Link>
          <Link
            to="/resources"
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              location.pathname === '/resources'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            资源管理
          </Link>
          {!isHome && <ServerSidebar />}
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {selected && <div className="mb-5 flex flex-wrap items-center gap-3 border-b pb-3 text-sm">
            <strong>{selected.name}</strong><span className="text-muted-foreground">端口 {data?.hostPort || selected.port}</span>
            <Phase value={error ? '状态未知' : data?.phase}/></div>}
          {children}</main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { serverId } = useParams();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    localStorage.removeItem('tmodvision_token');
    api.session().catch(() => false)
      .then((ok) => setValid(ok))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="p-10 text-center">验证中...</div>;
  if (!valid) return <Navigate to="/login" replace />;
  return (
    <ServerProvider>
      <StatusProvider key={serverId || 'fleet'} id={serverId}><Layout>{children}</Layout></StatusProvider>
    </ServerProvider>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <CreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server/:serverId"
        element={
          <ProtectedRoute>
            <ServerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server/:serverId/console"
        element={
          <ProtectedRoute>
            <ConsolePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server/:serverId/mods"
        element={
          <ProtectedRoute>
            <ModsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server/:serverId/worlds"
        element={
          <ProtectedRoute>
            <WorldsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server/:serverId/config"
        element={
          <ProtectedRoute>
            <ConfigPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server/:serverId/backups"
        element={
          <ProtectedRoute>
            <BackupsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/resources"
        element={
          <ProtectedRoute>
            <ResourcesPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
