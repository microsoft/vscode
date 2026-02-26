import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import MainLayout from './layouts/MainLayout';
import RegisterFlow from './components/RegisterFlow';
import UserDashboard from './pages/UserDashboard';
import AdminPanel from './pages/AdminPanel';
import LegalPage from './pages/LegalPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<RegisterFlow />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="admin" element={<AdminPanel />} />
            <Route path="terms" element={<LegalPage />} />
            <Route path="privacy" element={<LegalPage />} />
            <Route path="kyc" element={<LegalPage />} />
            <Route path="transparency" element={<LegalPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
