import mongoose from 'mongoose';
const schema = new mongoose.Schema({ name: String, fee: Number, description: String, active: { type: Boolean, default: true } }, { timestamps: true });
schema.methods.disable = function(){ this.active=false; };
export default mongoose.model('Package', schema);
