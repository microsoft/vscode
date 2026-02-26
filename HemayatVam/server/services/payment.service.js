import crypto from 'crypto';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { env } from '../config/env.js';
import { IDPayStrategy, NextPayStrategy, ZarinPalStrategy } from './payment.strategy.js';

const factory = {
  zarinpal: () => new ZarinPalStrategy(env.zarinpalMerchantId),
  nextpay: () => new NextPayStrategy(env.nextPayApiKey),
  idpay: () => new IDPayStrategy(env.idpayApiKey)
};

export class PaymentService {
  getStrategy(gateway = env.defaultGateway) { return (factory[gateway] || factory.zarinpal)(); }

  verifySignature(payload, signature, secret) {
    const digest = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    return digest === signature;
  }

  async requestPayment({ userId, amount, gateway }) {
    const strategy = this.getStrategy(gateway);
    return strategy.createPaymentRequest({ amount, userId });
  }

  async verifyPayment({ userId, walletId, payload, gateway }, session) {
    const strategy = this.getStrategy(gateway);
    const result = await strategy.verifyTransaction(payload);
    const tx = await Transaction.create([{ user: userId, wallet: walletId, type: 'deposit', amount: payload.amount || 0, status: result.success ? 'success' : 'failed', gateway, referenceId: result.referenceId }], { session });
    if (result.success) {
      const wallet = await Wallet.findById(walletId).session(session);
      wallet.addBalance('IRR', payload.amount || 0);
      await wallet.save({ session });
      await Notification.create([{ user: userId, title: 'واریز موفق', message: 'شارژ کیف پول با موفقیت انجام شد.' }], { session });
    }
    return { result, tx: tx[0] };
  }
}
