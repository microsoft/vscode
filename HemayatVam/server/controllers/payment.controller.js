import mongoose from 'mongoose';
import { PaymentService } from '../services/payment.service.js';
import { env } from '../config/env.js';

const service = new PaymentService();

export const requestPayment = async (req, res) => {
  const payload = await service.requestPayment({
    userId: req.user.userId,
    amount: req.body.amount,
    gateway: req.body.gateway
  });
  res.json(payload);
};

export const verifyPayment = async (req, res) => {
  const signature = req.headers['x-signature'];
  const signed = service.verifySignature(req.body, signature, env.jwtSecret);
  if (!signed) {
    return res.status(400).json({ message: 'امضای درخواست نامعتبر است.' });
  }

  const session = await mongoose.startSession();
  try {
    const response = await session.withTransaction(async () =>
      service.verifyPayment(
        {
          userId: req.user.userId,
          walletId: req.body.walletId,
          payload: req.body,
          gateway: req.body.gateway
        },
        session
      )
    );

    res.json(response);
  } finally {
    session.endSession();
  }
};
