import Transaction from '../models/Transaction.js';
import { generateUserExcel } from '../services/report.service.js';

export const getUserReport = async (req, res) => {
  const tx = await Transaction.find({ user: req.user.userId }).limit(200).lean();
  const buffer = await generateUserExcel(tx.map(t => ({ user: req.user.userId, type: t.type, amount: t.amount })));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
};

export const getAdminReport = async (_req, res) => {
  res.json({ message: 'Admin report endpoint ready' });
};
