
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import { AppProvider } from './contexts/AppContext';
import { AdminProvider } from './contexts/AdminContext';
import AppShell from './components/AppShell';
import AdminGuard from './components/AdminGuard';
import Home from './pages/Home';
import DownloadManager from './pages/DownloadManager';
import AdminLogin from './pages/AdminLogin';
import AdminSetup from './pages/AdminSetup';
import AppleIdLogin from './pages/AppleIdLogin';
import './App.css';

function App() {
  return (
    <CssVarsProvider>
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

              <Route path="/*" element={
                <AdminGuard>
                  <AppShell>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/dl" element={<DownloadManager />} />
                      <Route path="/apple-id" element={<AppleIdLogin />} />
                    </Routes>
                  </AppShell>
                </AdminGuard>
              } />
            </Routes>
          </Router>
        </AppProvider>
      </AdminProvider>
    </CssVarsProvider>
  );
}

export default App;
