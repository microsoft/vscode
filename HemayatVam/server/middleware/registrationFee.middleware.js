import Wallet from '../models/Wallet.js';

export const ensureStepFee = async (req, res, next) => {
  const wallet = await Wallet.findOne({ user: req.user.userId });
  if (!wallet || wallet.getBalance('IRR') < 80000) {
    return res.status(402).json({ code: 'INSUFFICIENT_BALANCE', required: 80000 });
  }
  req.wallet = wallet;
  next();
};
