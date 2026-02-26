import { Link, Outlet } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';

export default function MainLayout() {
  const { token, logout } = useAuth();

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto">
      <header className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <nav className="flex gap-4 text-sm items-center">
          <Link to="/">ثبت‌نام</Link>
          <Link to="/login">ورود</Link>
          <Link to="/dashboard">داشبورد</Link>
          <Link to="/admin">ادمین</Link>
          <Link to="/terms">قوانین</Link>
          <Link to="/privacy">حریم خصوصی</Link>
          <Link to="/kyc">KYC</Link>
          <Link to="/transparency">شفافیت</Link>
          {token && <button className="px-2 py-1 rounded bg-rose-600 text-white" onClick={logout}>خروج</button>}
        </nav>
        <ThemeToggle />
      </header>
      <Outlet />
    </div>
  );
}
