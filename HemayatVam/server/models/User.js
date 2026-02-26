import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const schema = new mongoose.Schema({
  fullName: { type: String, trim: true },
  phone: { type: String, required: true, unique: true, index: true },
  email: { type: String, lowercase: true, unique: true, sparse: true },
  passwordHash: { type: String },
  role: { type: String, enum: ['user', 'SuperAdmin', 'FinancialManager', 'SupportAgent', 'ContentModerator'], default: 'user', index: true },
  status: { type: String, enum: ['pending_verification', 'under_review', 'active', 'locked'], default: 'pending_verification', index: true },
  registrationStep: { type: Number, default: 1 },
  failedLoginAttempts: { type: Number, default: 0 },
  twoFactorSecret: String,
  kycVerified: { type: Boolean, default: false },
  biometricCredentialId: String,
  suspiciousIps: [String],
  lastLoginAt: Date
}, { timestamps: true });

schema.methods.setPassword = async function(password) { this.passwordHash = await bcrypt.hash(password, 12); };
schema.methods.comparePassword = async function(password) { return bcrypt.compare(password, this.passwordHash); };

export default mongoose.model('User', schema);
