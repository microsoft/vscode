import cron from 'node-cron';
import Installment from '../models/Installment.js';
import LoanRequest from '../models/LoanRequest.js';

export const startLoanOverdueCron = () => {
  cron.schedule('0 2 * * *', async () => {
    const overdue = await Installment.find({ paid: false, dueDate: { $lt: new Date() } }).populate('loan');
    for (const inst of overdue) {
      inst.missedCount += 1;
      await inst.save();
      if (inst.missedCount >= 3) {
        const loan = await LoanRequest.findById(inst.loan._id);
        loan.markDefault();
        await loan.save();
      }
      // اینجا باید پیامک کاوه‌نگار ارسال شود.
    }
  });
};
