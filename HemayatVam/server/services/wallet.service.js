import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';

export class WalletService {
  constructor() {
    this.rates = { IRR_USDT: 0.000024, IRR_GOLD: 0.0000013, USDT_IRR: 42000, GOLD_IRR: 76000000 };
  }

  async deductWithLock({ walletId, amount, currency = 'IRR', userId, reason = 'fee' }) {
    const session = await mongoose.startSession();
    return session
      .withTransaction(async () => {
        const wallet = await Wallet.findById(walletId).session(session);
        wallet.deductBalance(currency, amount);
        await wallet.save({ session });

        await Transaction.create(
          [{ user: userId, wallet: walletId, type: reason, amount, currency, status: 'success' }],
          { session }
        );

        return wallet;
      })
      .finally(() => session.endSession());
  }

  convertCurrency(amount, from, to) {
    const key = `${from}_${to}`;
    const rate = this.rates[key];
    if (!rate) throw new Error('RATE_NOT_FOUND');

    const gross = amount * rate;
    const fee = gross * 0.005;
    return { converted: Number((gross - fee).toFixed(2)), fee: Number(fee.toFixed(2)), rate };
  }

  async convertAndPersist({ userId, walletId, from, to, amount }) {
    const session = await mongoose.startSession();
    return session
      .withTransaction(async () => {
        const wallet = await Wallet.findById(walletId).session(session);
        wallet.deductBalance(from, amount);

        const { converted, fee, rate } = this.convertCurrency(amount, from, to);
        wallet.addBalance(to, converted);
        await wallet.save({ session });

        await Transaction.create(
          [
            {
              user: userId,
              wallet: walletId,
              type: 'conversion',
              amount,
              currency: from,
              status: 'success',
              metadata: { to, converted, fee, rate }
            }
          ],
          { session }
        );

        return { converted, fee, rate };
      })
      .finally(() => session.endSession());
  }
}
