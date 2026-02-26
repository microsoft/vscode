import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { convertWalletCurrency, getMyWallet, getWalletTransactions } from '../controllers/wallet.controller.js';
import Joi from 'joi';

const router = Router();

const convertSchema = Joi.object({
  from: Joi.string().valid('IRR', 'USDT', 'GOLD').required(),
  to: Joi.string().valid('IRR', 'USDT', 'GOLD').invalid(Joi.ref('from')).required(),
  amount: Joi.number().positive().required()
});

router.get('/me', authRequired, getMyWallet);
router.get('/transactions', authRequired, getWalletTransactions);
router.post('/convert', authRequired, validateBody(convertSchema), convertWalletCurrency);

export default router;
