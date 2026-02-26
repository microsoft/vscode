import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { listSessions, revokeSession } from '../controllers/session.controller.js';
import { sessionRevokeSchema } from '../utils/validators.js';

const router = Router();
router.get('/list', authRequired, listSessions);
router.post('/revoke', authRequired, validateBody(sessionRevokeSchema), revokeSession);

export default router;
