import { useEffect, useId, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from './ui/input';

export function VersionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [versions, setVersions] = useState<string[]>([]);
  const list = useId();
  const [fallback, setFallback] = useState('');
  useEffect(() => {
    api
      .get('/api/servers/versions')
      .then((r) => {
        setVersions(r.versions);
        setFallback(r.defaultVersion);
      })
      .catch(() => {});
  }, []);
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>tModLoader 发布版本</span>
      <Input
        list={list}
        placeholder={fallback ? '默认 ' + fallback : '选择或输入完整发布标签'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={list}>
        {versions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </label>
  );
}
