import { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { setToken, setUser } = useAuth();
  const [form, setForm] = useState({ phone: '', password: '', deviceType: 'desktop', deviceId: 'web-browser' });
  const [message, setMessage] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/auth/login', form);
      setToken(data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setUser(data.user || null);
      setMessage('ورود موفق بود. اکنون داشبورد داده واقعی نمایش می‌دهد.');
    } catch {
      setMessage('ورود ناموفق بود. اطلاعات را بررسی کنید.');
    }
  };

  return (
    <div className="max-w-xl p-6 rounded-xl bg-white dark:bg-slate-800 mx-auto">
      <h1 className="text-xl font-bold mb-4">ورود کاربران</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="w-full p-2 rounded border" placeholder="شماره موبایل" value={form.phone} onChange={(e)=>setForm({ ...form, phone: e.target.value })} />
        <input className="w-full p-2 rounded border" type="password" placeholder="رمز عبور" value={form.password} onChange={(e)=>setForm({ ...form, password: e.target.value })} />
        <button className="px-4 py-2 bg-indigo-600 text-white rounded">ورود</button>
      </form>
      {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
    </div>
  );
}
