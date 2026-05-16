import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  // For MVP: accept any token or no token (local-first)
  // In production: validate JWT, check subscription, etc.
  if (token) {
    (req as Request & { userId?: string }).userId = 'local-user';
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // For MVP: accept any token
  (req as Request & { userId?: string }).userId = 'local-user';
  next();
}
