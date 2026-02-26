import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  loan: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanRequest', required: true, index: true },
  dueDate: Date,
  amount: Number,
  paid: { type: Boolean, default: false },
  missedCount: { type: Number, default: 0 },
  penaltyRate: { type: Number, default: 2 }
}, { timestamps: true });
schema.methods.getPenalty = function(daysLate){ return this.amount * (this.penaltyRate / 100) * daysLate; };
export default mongoose.model('Installment', schema);
