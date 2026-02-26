import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  token: { type: String, required: true, index: true },
  deviceId: String,
  deviceType: { type: String, enum: ['mobile', 'desktop'] },
  ip: String,
  expiresAt: Date,
  revoked: { type: Boolean, default: false }
}, { timestamps: true });
schema.methods.revoke = function(){ this.revoked = true; };
export default mongoose.model('RefreshToken', schema);
