import cron from 'node-cron';

export const startSettlementCron = () => {
  cron.schedule('0 5 * * 0', async () => console.log('Weekly investor settlement running...'));
  cron.schedule('0 6 1 * *', async () => console.log('Monthly commission settlement running...'));
};
