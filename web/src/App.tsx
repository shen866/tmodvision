import { Routes, Route, Navigate, Link, useLocation, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ServerProvider, useServers } from '@/contexts/ServerContext';
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
  const { servers, currentServerId, setCurrentServerId } = useServers();

  if (!serverId) return null;

  const links = [
    { path: `/server/${serverId}`, label: '详情' },
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
          value={currentServerId || ''}
          onChange={(e) => {
            const id = e.target.value;
            setCurrentServerId(id);
            window.location.href = `/server/${id}`;
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
  const isHome = location.pathname === '/';

  const logout = () => {
    localStorage.removeItem('tmodvision_token');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b bg-background px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-xl font-bold text-primary">
              tModVision
            </Link>
            <span className="text-xs text-muted-foreground">个人 tModLoader 服务器</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            退出
          </Button>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden p-6">
        <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto md:flex">
          <Link
            to="/"
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              isHome
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            仪表盘
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
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tmodvision_token') || '';
    if (!token) {
      setChecking(false);
      return;
    }
    api
      .verify(token)
      .then((ok) => setValid(ok))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="p-10 text-center">验证中...</div>;
  if (!valid) return <Navigate to="/login" replace />;
  return (
    <ServerProvider>
      <Layout>{children}</Layout>
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
