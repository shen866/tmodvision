const API_BASE = '';

async function request(method: string, path: string, body?: any) {
  const headers: Record<string,string> = {};
  const opts: RequestInit = { method, headers };
  if (body) {
    if (body instanceof File) {
      headers['Content-Type'] = 'application/octet-stream';
      opts.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) {
    localStorage.removeItem('tmodvision_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

function forServer(serverId: string) {
  const prefix = `/api/server/${encodeURIComponent(serverId)}`;
  return {
    get: (path: string) => request('GET', `${prefix}${path}`),
    post: (path: string, body?: any) => request('POST', `${prefix}${path}`, body),
    del: (path: string) => request('DELETE', `${prefix}${path}`),
  };
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: any) => request('POST', path, body),
  del: (path: string) => request('DELETE', path),

  forServer,

  login: async (token: string) => {
    const res = await fetch('/api/auth/login', {method:'POST',headers:{Authorization:'Bearer '+token}});
    if (!res.ok) throw new Error((await res.json()).error || '登录失败');
  },
  session: () => fetch('/api/auth/session').then(r => r.ok),
  logout: () => request('POST','/api/auth/logout'),

  wsUrl: (serverId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws/console?serverId=${encodeURIComponent(serverId)}`;
  },
};
