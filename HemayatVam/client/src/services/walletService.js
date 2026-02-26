import { api } from './api';

export const fetchMyWallet = async (token) => {
  const res = await api.get('/api/wallet/me', { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
};

export const fetchWalletTransactions = async (token) => {
  const res = await api.get('/api/wallet/transactions', { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
};
