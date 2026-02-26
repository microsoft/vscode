import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balances: {
    IRR: { available: { type: Number, default: 0 }, locked: { type: Number, default: 0 } },
    USDT: { available: { type: Number, default: 0 }, locked: { type: Number, default: 0 } },
    GOLD: { available: { type: Number, default: 0 }, locked: { type: Number, default: 0 } }
  }
}, { timestamps: true, optimisticConcurrency: true });

schema.methods.getBalance = function(currency='IRR'){ return this.balances[currency]?.available || 0; };
schema.methods.addBalance = function(currency, amount){ this.balances[currency].available += amount; };
schema.methods.deductBalance = function(currency, amount){
  if (this.balances[currency].available < amount) throw new Error('INSUFFICIENT_BALANCE');
  this.balances[currency].available -= amount;
};

export default mongoose.model('Wallet', schema);
