import mongoose from 'mongoose';
const schema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, title: String, message: String, seen: { type: Boolean, default: false } }, { timestamps: true });
schema.methods.markSeen = function(){ this.seen = true; };
export default mongoose.model('Notification', schema);
