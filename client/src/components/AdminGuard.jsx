import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, LinearProgress } from '@mui/joy';
import { useAdmin } from '../contexts/AdminContext';

/**
 * 管理员守卫
 */
const AdminGuard = ({ children, requireAuth = true, allowSetup = false }) => {
    const { isInitialized, isLoggedIn, loading } = useAdmin();
    const { pathname } = useLocation();

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                }}
            >
                <LinearProgress />
            </Box>
        );
    }

    // 优先级由上到下
    const redirectRules = [
        // 未初始化且不允许设置
        { when: !isInitialized && !allowSetup, to: '/setup' },
        // 系统已初始化但访问 setup 页面
        { when: isInitialized && allowSetup && isLoggedIn, to: '/' },
        { when: isInitialized && allowSetup && !isLoggedIn, to: '/login' },
        // 需要认证但未登录
        { when: requireAuth && !isLoggedIn, to: '/login' },
        // 已登录访问登录页
        { when: isLoggedIn && pathname === '/login', to: '/' },
    ];

    const redirect = redirectRules.find(rule => rule.when);
    if (redirect) {
        return <Navigate to={redirect.to} replace />;
    }

    return children;
};

export default AdminGuard;
