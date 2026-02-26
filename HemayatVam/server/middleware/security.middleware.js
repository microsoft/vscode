import User from '../models/User.js';
import { logSecurity } from '../utils/logger.js';

export const trackSuspiciousIp = async (req, _res, next) => {
  if (!req.user?.userId) return next();
  const user = await User.findById(req.user.userId);
  const ip = req.ip;
  if (user.lastLoginIp && user.lastLoginIp !== ip) {
    user.suspiciousIps = [...new Set([...(user.suspiciousIps || []), ip])];
    logSecurity('suspicious_ip_detected', { userId: user.id, ip });
  }
  user.lastLoginIp = ip;
  await user.save();
  next();
};
