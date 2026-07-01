import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import ServerPage from '@/pages/Server';
import ModsPage from '@/pages/Mods';
import WorldsPage from '@/pages/Worlds';
import ConfigPage from '@/pages/Config';
import ConsolePage from '@/pages/Console';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const links = [
    { path: '/', label: '仪表盘' },
    { path: '/server', label: '服务器' },
    { path: '/mods', label: '模组' },
    { path: '/worlds', label: '世界' },
    { path: '/config', label: '配置' },
    { path: '/console', label: '控制台' },
  ];

  const logout = () => {
    localStorage.removeItem('tmodvision_token');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b bg-background px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">tModVision</span>
            <span className="text-xs text-muted-foreground">个人 tModLoader 服务器</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            退出
          </Button>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-hidden p-6">
        <aside className="hidden w-48 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
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
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server"
        element={
          <ProtectedRoute>
            <ServerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mods"
        element={
          <ProtectedRoute>
            <ModsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/worlds"
        element={
          <ProtectedRoute>
            <WorldsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/config"
        element={
          <ProtectedRoute>
            <ConfigPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/console"
        element={
          <ProtectedRoute>
            <ConsolePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
