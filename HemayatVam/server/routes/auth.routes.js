import { Router } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rateLimit.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { ensureStepFee } from '../middleware/registrationFee.middleware.js';
import {
  adminApproveUser,
  login,
  logout,
  refreshSession,
  registerBiometric,
  step1Register,
  step2SetPassword,
  step3Identity,
  step4UploadDocs,
  submitKYC,
  verify2FA
} from '../controllers/auth.controller.js';
import { biometricSchema, identityStepSchema, loginSchema, passwordStepSchema, refreshSchema, registerStep1Schema, twoFASchema } from '../utils/validators.js';

const router = Router();
router.post('/register/step1', authRateLimiter, validateBody(registerStep1Schema), step1Register);
router.post('/register/step2', authRequired, ensureStepFee, validateBody(passwordStepSchema), step2SetPassword);
router.post('/register/step3', authRequired, ensureStepFee, validateBody(identityStepSchema), step3Identity);
router.post('/register/step4', authRequired, ensureStepFee, step4UploadDocs);
router.post('/login', authRateLimiter, validateBody(loginSchema), login);
router.post('/refresh', validateBody(refreshSchema), refreshSession);
router.post('/logout', authRequired, validateBody(refreshSchema), logout);
router.post('/2fa/verify', authRequired, validateBody(twoFASchema), verify2FA);
router.post('/kyc/submit', authRequired, submitKYC);
router.post('/biometric/register', authRequired, validateBody(biometricSchema), registerBiometric);
router.patch('/admin/approve/:userId', authRequired, requireRole('SuperAdmin', 'FinancialManager'), adminApproveUser);

export default router;
