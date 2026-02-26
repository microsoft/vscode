import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <button
      className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}
    </button>
  );
}
