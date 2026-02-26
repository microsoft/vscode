import mongoose from 'mongoose';
const schema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, subject: String, message: String, status: { type: String, enum: ['open', 'closed'], default: 'open' } }, { timestamps: true });
schema.methods.close = function(){ this.status='closed'; };
export default mongoose.model('Ticket', schema);
