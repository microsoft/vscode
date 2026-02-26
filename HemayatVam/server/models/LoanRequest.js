import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  principal: Number,
  annualRate: Number,
  months: Number,
  installmentAmount: Number,
  status: { type: String, enum: ['pending', 'approved', 'defaulted', 'completed'], default: 'pending', index: true }
}, { timestamps: true });
schema.methods.markDefault = function(){ this.status='defaulted'; };
export default mongoose.model('LoanRequest', schema);
