import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import { WalletService } from '../services/wallet.service.js';

const walletService = new WalletService();

export const getMyWallet = async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.user.userId });
  if (!wallet) return res.status(404).json({ message: 'کیف پول یافت نشد.' });
  res.json(wallet);
};

export const getWalletTransactions = async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.user.userId });
  if (!wallet) return res.status(404).json({ message: 'کیف پول یافت نشد.' });

  const tx = await Transaction.find({ wallet: wallet._id }).sort({ createdAt: -1 }).limit(100);
  res.json(tx);
};

export const convertWalletCurrency = async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.user.userId });
  if (!wallet) return res.status(404).json({ message: 'کیف پول یافت نشد.' });

  // تبدیل ارز به صورت تراکنش اتمیک با کارمزد ۰.۵٪
  const result = await walletService.convertAndPersist({
    userId: req.user.userId,
    walletId: wallet._id,
    from: req.body.from,
    to: req.body.to,
    amount: req.body.amount
  });

  res.json({ message: 'تبدیل ارز انجام شد.', ...result });
};
