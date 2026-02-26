import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const authRequired = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};
