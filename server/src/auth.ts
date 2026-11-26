import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { IncomingMessage } from 'http';
import { Request, Response, NextFunction } from 'express';
import { AUTH_TOKEN } from './config';

const cookie = '__Host-tmodvision';
const lifetime = 12 * 60 * 60 * 1000;
const sessions = new Map<string, number>();
const failures = new Map<string, { count: number; until: number }>();

function sessionId(req: IncomingMessage) {
  const prefix = cookie + '=';
  return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || '';
}

export function hasSession(req: IncomingMessage) {
  return (sessions.get(sessionId(req)) || 0) > Date.now();
}

export function sameOrigin(req: IncomingMessage) {
  try {
    const origin = new URL(req.headers.origin || '');
    return origin.host === req.headers.host && origin.protocol ===
      (req.headers['x-forwarded-proto'] === 'https' ? 'https:' : 'http:');
  }
  catch { return false; }
}

export function verifyToken(value: string) {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return !!value && timingSafeEqual(digest(value), digest(AUTH_TOKEN));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ') && verifyToken(header.slice(7))) return next();
  if (!hasSession(req)) return res.status(401).json({ error: '请登录管理面板' });
  if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({error: '请求来源无效'});
  next();
}

export function login(req: Request, res: Response) {
  if (!sameOrigin(req)) return res.status(403).json({error:'请求来源无效'});
  // The gateway overwrites this header with its TCP peer address.
  const peer = req.get('X-Real-IP') || req.socket.remoteAddress || '';
  const failure = failures.get(peer);
  if (failure && failure.until > Date.now() && failure.count >= 10) {
    return res.status(429).json({error:'失败次数过多，请在十分钟后重试'});
  }
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] || '';
  if (!verifyToken(token)) {
    const item = failure && failure.until > Date.now() ? failure : {count:0, until:Date.now()+600000};
    failures.set(peer, {...item, count:item.count+1});
    return res.status(401).json({error:'Token 无效'});
  }
  failures.delete(peer);
  const id = randomBytes(32).toString('hex');
  sessions.delete(sessionId(req));
  sessions.set(id, Date.now()+lifetime);
  res.cookie(cookie, id, {httpOnly:true, secure:true, sameSite:'strict', path:'/', maxAge:lifetime});
  res.json({valid:true});
}

export function logout(req: Request, res: Response) {
  sessions.delete(sessionId(req));
  res.clearCookie(cookie, {secure:true, httpOnly:true, sameSite:'strict', path:'/'});
  res.sendStatus(204);
}

setInterval(() => {
  for (const [id, until] of sessions) if (until <= Date.now()) sessions.delete(id);
  for (const [ip, record] of failures) if (record.until <= Date.now()) failures.delete(ip);
}, 60000).unref();
