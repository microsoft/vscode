import RefreshToken from '../models/RefreshToken.js';

export const listSessions = async (req, res) => {
  const sessions = await RefreshToken.find({ user: req.user.userId, revoked: false })
    .select('deviceId deviceType ip createdAt expiresAt')
    .sort({ createdAt: -1 });

  res.json(sessions);
};

export const revokeSession = async (req, res) => {
  const updated = await RefreshToken.findOneAndUpdate(
    { user: req.user.userId, _id: req.body.sessionId, revoked: false },
    { revoked: true },
    { new: true }
  );

  if (!updated) {
    return res.status(404).json({ message: 'نشست موردنظر پیدا نشد یا قبلاً لغو شده است.' });
  }

  res.json({ message: 'Session revoked' });
};
