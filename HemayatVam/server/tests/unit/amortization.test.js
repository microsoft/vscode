import { calculateInstallmentAmount } from '../../utils/amortization.js';

test('calculate installment returns positive number', () => {
  const result = calculateInstallmentAmount({ principal: 1000000, annualRate: 24, months: 12 });
  expect(result).toBeGreaterThan(0);
});
