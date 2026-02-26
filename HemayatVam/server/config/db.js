import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async () => {
  await mongoose.connect(env.mongoUri);
  console.log('MongoDB connected');
};
