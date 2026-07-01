import { Request, Response, NextFunction } from 'express';
import { AUTH_TOKEN } from './config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer' && parts[1] === AUTH_TOKEN) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

export function verifyToken(token: string) {
  return token === AUTH_TOKEN;
}
