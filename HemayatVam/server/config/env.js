import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://mongo:27017/hemayatvam',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  defaultGateway: process.env.ACTIVE_GATEWAY || 'zarinpal',
  zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID || '',
  nextPayApiKey: process.env.NEXTPAY_API_KEY || '',
  idpayApiKey: process.env.IDPAY_API_KEY || '',
  kavenegarApiKey: process.env.KAVENEGAR_API_KEY || '',
  sentryDsn: process.env.SENTRY_DSN || ''
};
