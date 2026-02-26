import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  type: { type: String, enum: ['deposit', 'withdraw', 'fee', 'loan', 'investment', 'conversion'], required: true },
  amount: Number,
  currency: { type: String, enum: ['IRR', 'USDT', 'GOLD'], default: 'IRR' },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  gateway: String,
  referenceId: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });
schema.index({ createdAt: -1, user: 1 });
schema.methods.markSuccess = function(ref){ this.status='success'; this.referenceId=ref; };
export default mongoose.model('Transaction', schema);
