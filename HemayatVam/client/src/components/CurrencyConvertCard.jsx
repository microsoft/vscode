import { useState } from 'react';
import { api } from '../services/api';

export default function CurrencyConvertCard({ onDone }) {
  const [form, setForm] = useState({ from: 'IRR', to: 'USDT', amount: 1000000 });
  const [msg, setMsg] = useState('');

  const submit = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMsg('ابتدا وارد حساب کاربری شوید.');
      return;
    }

    try {
      const { data } = await api.post('/api/wallet/convert', form, { headers: { Authorization: `Bearer ${token}` } });
      setMsg(`تبدیل انجام شد: ${data.converted} (${data.fee} کارمزد)`);
      onDone?.();
    } catch {
      setMsg('خطا در تبدیل ارز.');
    }
  };

  return (
    <div className="p-4 rounded bg-white dark:bg-slate-800 space-y-2">
      <h3 className="font-bold">تبدیل ارز</h3>
      <div className="grid grid-cols-3 gap-2">
        <select className="p-2 border rounded" value={form.from} onChange={(e)=>setForm({ ...form, from: e.target.value })}>
          <option>IRR</option><option>USDT</option><option>GOLD</option>
        </select>
        <select className="p-2 border rounded" value={form.to} onChange={(e)=>setForm({ ...form, to: e.target.value })}>
          <option>IRR</option><option>USDT</option><option>GOLD</option>
        </select>
        <input className="p-2 border rounded" type="number" value={form.amount} onChange={(e)=>setForm({ ...form, amount: Number(e.target.value) })} />
      </div>
      <button className="px-3 py-2 bg-emerald-600 text-white rounded" onClick={submit}>انجام تبدیل</button>
      {msg && <p className="text-sm text-slate-600 dark:text-slate-200">{msg}</p>}
    </div>
  );
}
