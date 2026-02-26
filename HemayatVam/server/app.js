import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import sessionRoutes from './routes/session.routes.js';
import investmentRoutes from './routes/investment.routes.js';
import loanRoutes from './routes/loan.routes.js';
import reportRoutes from './routes/report.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.use('/auth', authRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/investment', investmentRoutes);
app.use('/api/loan', loanRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/user', userRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ message: err.message || 'Server error', code: err.code });
});

export default app;
