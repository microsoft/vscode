import { useEffect, useState } from 'react';
import NotificationBell from '../components/NotificationBell';
import PaymentModal from '../components/PaymentModal';
import { fetchMyWallet, fetchWalletTransactions } from '../services/walletService';
import CurrencyConvertCard from '../components/CurrencyConvertCard';

const tabs = ['کیف پول', 'سرمایه‌گذاری', 'وام‌ها', 'تنظیمات'];

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState('کیف پول');
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');

  const loadWallet = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('برای مشاهده داده واقعی، ابتدا وارد شوید.');
      return;
    }

    try {
      const [walletData, txData] = await Promise.all([
        fetchMyWallet(token),
        fetchWalletTransactions(token)
      ]);
      setWallet(walletData);
      setTransactions(txData);
      setError('');
    } catch {
      setError('خطا در دریافت اطلاعات کیف پول.');
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('برای مشاهده داده واقعی، ابتدا وارد شوید.');
      return;
    }

    loadWallet();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">داشبورد کاربر</h1>
        <NotificationBell />
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'کیف پول' && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="p-4 rounded bg-white dark:bg-slate-800">
            <h2 className="font-bold mb-2">موجودی کیف پول</h2>
            {wallet ? (
              <ul className="space-y-1 text-sm">
                <li>IRR: {wallet.balances?.IRR?.available ?? 0}</li>
                <li>USDT: {wallet.balances?.USDT?.available ?? 0}</li>
                <li>GOLD: {wallet.balances?.GOLD?.available ?? 0}</li>
              </ul>
            ) : (
              <p className="text-sm text-slate-500">اطلاعاتی موجود نیست.</p>
            )}
          </div>

          <div className="p-4 rounded bg-white dark:bg-slate-800">
            <h2 className="font-bold mb-2">آخرین تراکنش‌ها</h2>
            <ul className="space-y-1 text-sm max-h-48 overflow-auto">
              {transactions.length ? transactions.map((tx) => (
                <li key={tx._id} className="border-b pb-1">{tx.type} - {tx.amount} {tx.currency}</li>
              )) : <li className="text-slate-500">تراکنشی ثبت نشده است.</li>}
            </ul>
          </div>
        </div>
      )}

      {activeTab !== 'کیف پول' && <div className="p-4 rounded bg-white dark:bg-slate-800">تب فعال: {activeTab}</div>}

      <CurrencyConvertCard onDone={loadWallet} />

      {error && <div className="p-3 rounded bg-amber-100 text-amber-800 text-sm">{error}</div>}

      <PaymentModal />
    </div>
  );
}
