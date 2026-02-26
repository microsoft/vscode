import User from '../models/User.js';

export const me = async (req, res) => {
  const user = await User.findById(req.user.userId).select('fullName phone email role status kycVerified registrationStep');
  if (!user) return res.status(404).json({ message: 'کاربر یافت نشد.' });
  res.json(user);
};
