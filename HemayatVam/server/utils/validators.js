import Joi from 'joi';

export const registerStep1Schema = Joi.object({
  phone: Joi.string().pattern(/^09\d{9}$/).required(),
  email: Joi.string().email().optional().allow(null, '')
});

export const passwordStepSchema = Joi.object({
  password: Joi.string().min(8).max(64).required()
});

export const identityStepSchema = Joi.object({
  fullName: Joi.string().min(3).max(120).required()
});

export const loginSchema = Joi.object({
  phone: Joi.string().pattern(/^09\d{9}$/).required(),
  password: Joi.string().required(),
  deviceType: Joi.string().valid('mobile', 'desktop').default('desktop'),
  deviceId: Joi.string().min(2).max(200).default('browser')
});

export const refreshSchema = Joi.object({
  refreshToken: Joi.string().required()
});

export const twoFASchema = Joi.object({ token: Joi.string().length(6).required() });
export const biometricSchema = Joi.object({ credentialId: Joi.string().required() });

export const paymentRequestSchema = Joi.object({
  amount: Joi.number().positive().required(),
  gateway: Joi.string().valid('zarinpal', 'nextpay', 'idpay').optional()
});

export const paymentVerifySchema = Joi.object({
  walletId: Joi.string().hex().length(24).required(),
  amount: Joi.number().positive().required(),
  gateway: Joi.string().valid('zarinpal', 'nextpay', 'idpay').required(),
  authority: Joi.string().optional(),
  token: Joi.string().optional(),
  id: Joi.string().optional()
});

export const sessionRevokeSchema = Joi.object({
  sessionId: Joi.string().hex().length(24).required()
});
