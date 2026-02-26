import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { requestLoan } from '../controllers/loan.controller.js';
const router = Router();
router.post('/', authRequired, requestLoan);
export default router;
