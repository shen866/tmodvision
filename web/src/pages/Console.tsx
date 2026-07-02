import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ConsolePage() {
  const { serverId } = useParams<{ serverId: string }>();
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!serverId) return;
    setLogs([]);
    const ws = new WebSocket(api.wsUrl(serverId));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      setLogs((prev) => [...prev, event.data]);
    };
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, [serverId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !wsRef.current) return;
    wsRef.current.send(command);
    setCommand('');
  };

  const sendRaw = (cmd: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(cmd);
  };

  const broadcast = () => {
    const msg = window.prompt('请输入广播消息');
    if (msg) sendRaw(`say ${msg}`);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">实时控制台</h1>
        <span className={`text-sm ${connected ? 'text-green-600' : 'text-destructive'}`}>
          {connected ? '已连接' : '未连接'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => sendRaw('save')}>
          保存世界
        </Button>
        <Button size="sm" variant="secondary" onClick={broadcast}>
          广播消息
        </Button>
        <Button size="sm" variant="secondary" onClick={() => sendRaw('playing')}>
          在线玩家
        </Button>
        <Button size="sm" variant="outline" onClick={() => sendRaw('dawn')}>
          黎明
        </Button>
        <Button size="sm" variant="outline" onClick={() => sendRaw('noon')}>
          正午
        </Button>
        <Button size="sm" variant="outline" onClick={() => sendRaw('dusk')}>
          黄昏
        </Button>
        <Button size="sm" variant="outline" onClick={() => sendRaw('midnight')}>
          午夜
        </Button>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="py-4">
          <CardTitle className="text-base">服务器日志</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <ScrollArea
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-auto bg-black p-4 font-mono text-sm text-green-400"
          >
            {logs.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </ScrollArea>
          <form onSubmit={send} className="flex gap-2 border-t p-4">
            <Input
              placeholder="输入命令 (如 save / say hello)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={!connected}
            />
            <Button type="submit" disabled={!connected}>
              发送
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
