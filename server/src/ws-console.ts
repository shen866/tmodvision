import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { verifyToken } from './auth';
import { streamLogs, injectCommand } from './services/docker';

export function attachConsole(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws/console' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || '';
    if (!verifyToken(token)) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    let logStream: { destroy: () => void } | null = null;

    ws.on('message', async (data) => {
      try {
        const cmd = data.toString().trim();
        if (!cmd) return;
        await injectCommand(cmd);
      } catch (err: any) {
        ws.send(`[tModVision] Failed to send command: ${err.message}\n`);
      }
    });

    ws.on('close', () => {
      if (logStream) logStream.destroy();
    });

    try {
      logStream = await streamLogs(
        (line) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(line);
          }
        },
        (err) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`[tModVision] Log stream error: ${err.message}\n`);
          }
        }
      );
    } catch (err: any) {
      ws.send(`[tModVision] Unable to attach to server logs: ${err.message}\n`);
    }
  });
}
