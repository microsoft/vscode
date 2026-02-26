import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { me } from '../controllers/user.controller.js';

const router = Router();
router.get('/me', authRequired, me);

export default router;
