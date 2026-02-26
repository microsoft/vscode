export default function PaymentModal() {
  return <div className="p-4 rounded-xl bg-white dark:bg-slate-800">
    <h3 className="font-bold mb-2">شارژ کیف پول</h3>
    <select className="w-full border rounded p-2 mb-2"><option>زرین‌پال</option><option>نکست‌پی</option><option>IDPay</option></select>
    <button className="bg-indigo-600 text-white px-3 py-2 rounded">پرداخت</button>
  </div>;
}
