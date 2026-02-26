import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { token, authLoading } = useAuth();
  if (authLoading) return <div className="p-4 rounded bg-white dark:bg-slate-800">در حال بررسی نشست کاربر...</div>;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
