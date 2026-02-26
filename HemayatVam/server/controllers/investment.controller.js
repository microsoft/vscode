import mongoose from 'mongoose';
import InvestmentAd from '../models/InvestmentAd.js';
import Wallet from '../models/Wallet.js';

export const createAd = async (req, res) => {
  const ad = await InvestmentAd.create({ ...req.body, user: req.user.userId });
  res.status(201).json(ad);
};

export const investInAd = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ad = await InvestmentAd.findById(req.params.id).session(session);
      const wallet = await Wallet.findOne({ user: req.user.userId }).session(session);
      wallet.deductBalance('IRR', req.body.amount);
      ad.applyInvestment(req.body.amount);
      await Promise.all([wallet.save({ session }), ad.save({ session })]);
    });
    res.json({ message: 'Investment successful' });
  } finally { session.endSession(); }
};
