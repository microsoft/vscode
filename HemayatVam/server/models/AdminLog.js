import mongoose from 'mongoose';
const schema = new mongoose.Schema({ admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, action: String, targetType: String, targetId: String, meta: mongoose.Schema.Types.Mixed }, { timestamps: true });
schema.methods.summarize = function(){ return `${this.action}:${this.targetType}`; };
export default mongoose.model('AdminLog', schema);
