import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { requestPayment, verifyPayment } from '../controllers/payment.controller.js';
import { paymentRequestSchema, paymentVerifySchema } from '../utils/validators.js';

const router = Router();
router.post('/request', authRequired, validateBody(paymentRequestSchema), requestPayment);
router.post('/verify', authRequired, validateBody(paymentVerifySchema), verifyPayment);

export default router;
