import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useServerStatus } from '@/components/ServerStatus';

const groups = [
  {
    title: '联机设置',
    fields: [
      ['maxplayers', '人数上限', 'number'],
      ['password', '加入密码', 'password'],
      ['motd', '欢迎消息', 'text'],
      ['language', '服务器语言', 'text'],
    ],
  },
  {
    title: '高级配置',
    fields: [
      ['secure', 'Secure', 'switch'],
      ['upnp', 'UPnP', 'switch'],
      ['npcstream', 'NPC 同步频率', 'number'],
    ],
  },
];
export default function ConfigPage() {
  const id = useParams().serverId!;
  const { refresh } = useServerStatus();
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [worlds, setWorlds] = useState<string[]>([]);
  const [world, setWorld] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    Promise.all([api.forServer(id).get('/config'), api.forServer(id).get('/worlds')])
      .then(([config, list]) => {
        setInitial(config);
        setValues(config);
        setWorld(config.worldname || '');
        setWorlds(list.map((w: { name: string }) => w.name));
        setReady(true);
      })
      .catch((e) => setMessage(e.message));
  }, [id]);
  const changed = Object.keys(values).filter((k) => values[k] !== initial[k]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, values[k]]));
      if (world !== (initial.worldname || ''))
        Object.assign(patch, {
          worldname: world,
          world: '/data/tModLoader/Worlds/' + world + '.wld',
          worldpath: '/data/tModLoader/Worlds/',
        });
      await api.forServer(id).post('/config', patch);
      setInitial({ ...values, ...patch });
      setValues({ ...values, ...patch });
      refresh();
      setMessage('已保存，修改将在下次启动时应用。');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="space-y-5" onSubmit={save}>
      <h1>服务器配置</h1>
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {ready && (
        <>
          <section className="rounded-xl border p-5">
            <h2>启动世界</h2>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <select
                aria-label="启动世界"
                className="rounded border p-2"
                value={world}
                onChange={(e) => setWorld(e.target.value)}
              >
                {[...new Set([initial.worldname || '', ...worlds])].map((w) => (
                  <option key={w} value={w}>
                    {w || '默认世界'}
                  </option>
                ))}
              </select>
              <Link className="text-sm text-primary" to={'/server/' + id + '/worlds'}>
                创建世界或设置新地图参数 →
              </Link>
            </div>
          </section>
          {groups.map((group) => (
            <section key={group.title} className="rounded-xl border p-5">
              <h2>{group.title}</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.fields.map(([key, label, type]) => (
                  <label key={key} className="space-y-1 text-sm">
                    <span>
                      {label} <small className="text-muted-foreground">{key}</small>
                    </span>
                    {type === 'switch' ? (
                      <select
                        className="block w-full rounded-md border p-2"
                        value={values[key] || '0'}
                        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                      >
                        <option value="0">关闭</option>
                        <option value="1">开启</option>
                      </select>
                    ) : (
                      <Input
                        type={type}
                        min={key === 'maxplayers' ? 1 : 0}
                        max={key === 'maxplayers' ? 255 : undefined}
                        value={values[key] || ''}
                        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                      />
                    )}
                  </label>
                ))}
              </div>
              {group.title === '联机设置' && (
                <Link className="mt-4 block text-sm text-primary" to={'/server/' + id}>
                  在启动计划中修改对外端口 →
                </Link>
              )}
            </section>
          ))}
          <Button loading={busy} disabled={!changed.length && world === (initial.worldname || '')}>
            保存配置
          </Button>
        </>
      )}
    </form>
  );
}
