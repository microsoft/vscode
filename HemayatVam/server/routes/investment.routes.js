import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { createAd, investInAd } from '../controllers/investment.controller.js';
const router = Router();
router.post('/', authRequired, createAd);
router.post('/:id/invest', authRequired, investInAd);
export default router;
