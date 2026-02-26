import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: String,
  category: { type: String, required: true, index: true },
  requiredAmount: { type: Number, required: true },
  minInvestment: { type: Number, required: true },
  fundedAmount: { type: Number, default: 0 },
  profitRate: Number,
  duration: Number,
  guarantee: String,
  documents: [String],
  status: { type: String, enum: ['open', 'funded', 'closed'], default: 'open', index: true }
}, { timestamps: true });
schema.methods.applyInvestment = function(amount){ this.fundedAmount += amount; if(this.fundedAmount>=this.requiredAmount) this.status='funded'; };
export default mongoose.model('InvestmentAd', schema);
