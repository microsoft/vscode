export const calculateInstallmentAmount = ({ principal, annualRate, months }) => {
  const r = annualRate / 12 / 100;
  const top = principal * (r * (1 + r) ** months);
  const down = ((1 + r) ** months) - 1;
  return Number((top / down).toFixed(2));
};
