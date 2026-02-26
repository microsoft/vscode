import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { getAdminReport, getUserReport } from '../controllers/report.controller.js';
const router = Router();
router.get('/user', authRequired, getUserReport);
router.get('/admin', authRequired, requireRole('SuperAdmin', 'FinancialManager'), getAdminReport);
export default router;
