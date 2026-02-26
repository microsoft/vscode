import LoanRequest from '../models/LoanRequest.js';
import Installment from '../models/Installment.js';
import { calculateInstallmentAmount } from '../utils/amortization.js';

export const requestLoan = async (req, res) => {
  const installmentAmount = calculateInstallmentAmount({ principal: req.body.principal, annualRate: req.body.annualRate, months: req.body.months });
  const loan = await LoanRequest.create({ user: req.user.userId, ...req.body, installmentAmount, status: 'approved' });
  const installments = [];
  for (let i = 1; i <= req.body.months; i++) {
    installments.push({ loan: loan._id, amount: installmentAmount, dueDate: new Date(Date.now() + i * 30 * 86400000) });
  }
  await Installment.insertMany(installments);
  res.status(201).json({ loan, installments });
};
