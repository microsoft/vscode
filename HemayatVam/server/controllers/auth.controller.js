import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import AdminLog from '../models/AdminLog.js';
import RefreshToken from '../models/RefreshToken.js';
import { env } from '../config/env.js';
import { enforceSessionRule, rotateRefreshToken } from '../services/session.service.js';

const REGISTRATION_STEP_FEE = 80000;

const chargeStep = async ({ userId, walletId, step, session }) => {
  // کسر هزینه هر مرحله ثبت‌نام به‌صورت اتمیک برای جلوگیری از خطای همزمانی
  const wallet = await Wallet.findById(walletId).session(session);
  wallet.deductBalance('IRR', REGISTRATION_STEP_FEE);
  await wallet.save({ session });

  await Transaction.create([
    {
      user: userId,
      wallet: walletId,
      type: 'fee',
      amount: REGISTRATION_STEP_FEE,
      currency: 'IRR',
      status: 'success',
      metadata: { step, reason: 'registration_step_fee' }
    }
  ], { session });
};

export const step1Register = async (req, res) => {
  const { phone, email } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) return res.status(409).json({ message: 'کاربر با این شماره قبلاً ثبت شده است.' });

  const user = await User.create({ phone, email, status: 'pending_verification', registrationStep: 1 });
  await Wallet.create({
    user: user._id,
    balances: {
      IRR: { available: 0, locked: 0 },
      USDT: { available: 0, locked: 0 },
      GOLD: { available: 0, locked: 0 }
    }
  });

  res.status(201).json({ message: 'OTP sent', userId: user._id, status: user.status });
};

export const step2SetPassword = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user.userId).session(session);
      await user.setPassword(req.body.password);
      user.registrationStep = 2;
      await user.save({ session });

      const wallet = await Wallet.findOne({ user: user._id }).session(session);
      await chargeStep({ userId: user._id, walletId: wallet._id, step: 2, session });
    });

    res.json({ message: 'Step 2 completed' });
  } finally {
    session.endSession();
  }
};

export const step3Identity = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user.userId).session(session);
      user.fullName = req.body.fullName;
      user.registrationStep = 3;
      await user.save({ session });

      const wallet = await Wallet.findOne({ user: user._id }).session(session);
      await chargeStep({ userId: user._id, walletId: wallet._id, step: 3, session });
    });

    res.json({ message: 'Step 3 completed' });
  } finally {
    session.endSession();
  }
};

export const step4UploadDocs = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user.userId).session(session);
      user.status = 'under_review';
      user.registrationStep = 4;
      await user.save({ session });

      const wallet = await Wallet.findOne({ user: user._id }).session(session);
      await chargeStep({ userId: user._id, walletId: wallet._id, step: 4, session });
    });

    res.json({ message: 'Submitted for review', status: 'under_review' });
  } finally {
    session.endSession();
  }
};

export const adminApproveUser = async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ message: 'کاربر یافت نشد.' });

  user.status = 'active';
  await user.save();

  await AdminLog.create({
    admin: req.user.userId,
    action: 'approve_user',
    targetType: 'User',
    targetId: String(user._id),
    meta: { afterStatus: 'active' }
  });

  res.json({ message: 'کاربر تایید شد.', status: user.status });
};

export const login = async (req, res) => {
  const { phone, password, deviceType = 'desktop', deviceId = 'browser' } = req.body;
  const user = await User.findOne({ phone });

  if (!user || !(await user.comparePassword(password))) {
    if (user) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 3) user.status = 'locked';
      await user.save();
    }
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.status === 'locked') {
    return res.status(423).json({ message: 'حساب کاربری شما قفل شده است.' });
  }

  user.failedLoginAttempts = 0;
  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = jwt.sign(
    { userId: user._id, role: user.role, deviceId, deviceType, issuedAt: Date.now() },
    env.jwtSecret,
    { expiresIn: '15m' }
  );

  const refreshToken = await enforceSessionRule({
    userId: user._id,
    deviceType,
    deviceId,
    ip: req.ip
  });

  res.json({ accessToken, refreshToken, user: { id: user._id, role: user.role, status: user.status } });
};

export const refreshSession = async (req, res) => {
  try {
    const newRefreshToken = await rotateRefreshToken({ token: req.body.refreshToken, ip: req.ip });
    const payload = jwt.verify(newRefreshToken, env.jwtRefreshSecret);
    const accessToken = jwt.sign(
      { userId: payload.userId, deviceId: payload.deviceId, deviceType: payload.deviceType, issuedAt: Date.now() },
      env.jwtSecret,
      { expiresIn: '15m' }
    );
    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ message: 'رفرش‌توکن نامعتبر است.' });
  }
};

export const verify2FA = async (req, res) => {
  const user = await User.findById(req.user.userId);
  const ok = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: req.body.token });
  res.json({ verified: ok });
};

export const submitKYC = async (req, res) => {
  // شبیه‌سازی OCR: در محیط واقعی از سرویس OCR بومی/داخلی استفاده می‌شود.
  const user = await User.findById(req.user.userId);
  user.kycVerified = true;
  await user.save();
  res.json({ message: 'KYC submitted and verified' });
};

export const registerBiometric = async (req, res) => {
  const user = await User.findById(req.user.userId);
  user.biometricCredentialId = req.body.credentialId;
  await user.save();
  res.json({ message: 'Biometric registered' });
};


export const logout = async (req, res) => {
  const { refreshToken } = req.body;
  await RefreshToken.updateOne(
    { user: req.user.userId, token: refreshToken, revoked: false },
    { revoked: true }
  );
  res.json({ message: 'خروج با موفقیت انجام شد.' });
};
