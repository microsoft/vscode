import ExcelJS from 'exceljs';

export const generateUserExcel = async (rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('گزارش کاربران');
  ws.addRow(['کاربر', 'تراکنش', 'مبلغ']);
  rows.forEach(r => ws.addRow([r.user, r.type, r.amount]));
  return wb.xlsx.writeBuffer();
};
