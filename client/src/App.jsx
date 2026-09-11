
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CssVarsProvider } from '@mui/joy/styles';
import { joyTheme } from './theme/joyTheme';
import CssBaseline from '@mui/joy/CssBaseline';
import { AppProvider } from './contexts/AppContext';
import { AdminProvider } from './contexts/AdminContext';
import AppShell from './components/AppShell';
import AdminGuard from './components/AdminGuard';
import Home from './pages/Home';
import DownloadManager from './pages/DownloadManager';
import Purchases from './pages/Purchases';
import Settings from './pages/Settings';
import AdminLogin from './pages/AdminLogin';
import AdminSetup from './pages/AdminSetup';
import AppleIdLogin from './pages/AppleIdLogin';
import './App.css';

function App() {
  return (
    <CssVarsProvider theme={joyTheme}>
      <CssBaseline />
      <AdminProvider>
        <AppProvider>
          <Router>
            <Routes>
              {/* 设置向导页面需要检查是否已初始化 */}
              <Route path="/setup" element={
                <AdminGuard requireAuth={false} allowSetup={true}>
                  <AdminSetup />
                </AdminGuard>
              } />

              <Route path="/login" element={
                <AdminGuard requireAuth={false}>
                  <AdminLogin />
                </AdminGuard>
              } />

              <Route path="/apple-id" element={
                <AdminGuard>
                  <AppleIdLogin />
                </AdminGuard>
              } />

              <Route element={
                <AdminGuard>
                  <AppShell />
                </AdminGuard>
              }>
                <Route index element={<Home />} />
                <Route path="purchases" element={<Purchases />} />
                <Route path="dl" element={<DownloadManager />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </Router>
        </AppProvider>
      </AdminProvider>
    </CssVarsProvider>
  );
}

export default App;
