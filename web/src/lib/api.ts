const API_BASE = '';

function getToken() {
  return localStorage.getItem('tmodvision_token') || '';
}

async function request(method: string, path: string, body?: any) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
  };
  const opts: RequestInit = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
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

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: any) => request('POST', path, body),
  del: (path: string) => request('DELETE', path),

  verify: (token: string) =>
    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.ok),

  wsUrl: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws/console?token=${getToken()}`;
  },
};
