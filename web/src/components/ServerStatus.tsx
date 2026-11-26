import { createContext, useContext } from 'react';
import { useStatus } from '@/lib/status';

const Context = createContext<ReturnType<typeof useStatus> | null>(null);
export function StatusProvider({ id, children }: { id?: string; children: React.ReactNode }) {
  const value = useStatus(id);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useServerStatus() {
  return useContext(Context)!;
}
export function Phase({ value }: { value?: string }) {
  const color =
    value === '可加入'
      ? 'bg-emerald-100 text-emerald-800'
      : value === '启动异常' || value === '异常退出' || value === '状态未知'
        ? 'bg-red-100 text-red-800'
        : value && value !== '已停止'
          ? 'bg-amber-100 text-amber-900'
          : 'bg-slate-100 text-slate-600';
  return (
    <span
      className={
        'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ' + color
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value || '读取中'}
    </span>
  );
}
