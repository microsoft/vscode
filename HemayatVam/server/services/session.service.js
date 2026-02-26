import jwt from 'jsonwebtoken';
import RefreshToken from '../models/RefreshToken.js';
import { env } from '../config/env.js';

export const enforceSessionRule = async ({ userId, deviceType, deviceId, ip }) => {
  const sessions = await RefreshToken.find({ user: userId, revoked: false, deviceType }).sort({ createdAt: 1 });
  if (sessions.length >= 1) {
    sessions[0].revoked = true;
    await sessions[0].save();
  }

  const refreshToken = jwt.sign(
    { userId, deviceId, deviceType, issuedAt: Date.now() },
    env.jwtRefreshSecret,
    { expiresIn: '7d' }
  );

  await RefreshToken.create({
    user: userId,
    token: refreshToken,
    deviceType,
    deviceId,
    ip,
    expiresAt: new Date(Date.now() + 7 * 86400000)
  });

  return refreshToken;
};

export const rotateRefreshToken = async ({ token, ip }) => {
  const payload = jwt.verify(token, env.jwtRefreshSecret);
  const active = await RefreshToken.findOne({ token, revoked: false });
  if (!active) {
    throw new Error('SESSION_REVOKED');
  }

  active.revoked = true;
  await active.save();

  return enforceSessionRule({
    userId: payload.userId,
    deviceType: payload.deviceType,
    deviceId: payload.deviceId,
    ip
  });
};
