import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminDashboardPage from './pages/admin/dashboard';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminDashboardPage />
  </React.StrictMode>
);
