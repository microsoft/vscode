import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, logoutRequest } from '../services/authService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }, [token]);

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await fetchMe(token);
        setUser(me);
      } catch {
        setToken('');
        setUser(null);
        localStorage.removeItem('refreshToken');
      } finally {
        setAuthLoading(false);
      }
    };
    init();
  }, [token]);

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (token && refreshToken) await logoutRequest(token, refreshToken);
    } catch {
      // حتی در صورت خطا خروج سمت کلاینت انجام می‌شود.
    }
    setToken('');
    setUser(null);
    localStorage.removeItem('refreshToken');
  };

  const value = useMemo(
    () => ({ user, setUser, theme, setTheme, token, setToken, logout, authLoading }),
    [user, theme, token, authLoading]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
