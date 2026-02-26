import { api } from './api';

export const fetchMe = async (token) => {
  const res = await api.get('/api/user/me', { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
};

export const logoutRequest = async (token, refreshToken) => {
  await api.post('/auth/logout', { refreshToken }, { headers: { Authorization: `Bearer ${token}` } });
};
