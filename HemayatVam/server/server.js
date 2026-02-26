import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { startLoanOverdueCron } from './cron/loanOverdue.cron.js';
import { startSettlementCron } from './cron/settlement.cron.js';

(async () => {
  await connectDB();
  startLoanOverdueCron();
  startSettlementCron();
  app.listen(env.port, () => console.log(`Server running on :${env.port}`));
})();
