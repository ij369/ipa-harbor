import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, Button, LinearProgress, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useAdmin } from '../contexts/AdminContext';

/**
 * 管理员守卫
 */
const AdminGuard = ({ children, requireAuth = true, allowSetup = false, allowRecover = false }) => {
    const { isInitialized, isLoggedIn, loading, statusLoaded, error, checkAdminStatus } = useAdmin();
    const { pathname } = useLocation();
    const { t } = useTranslation();

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                }}
            >
                <LinearProgress />
            </Box>
        );
    }

    // 无法连接后端时，不应误判为未初始化而跳转 /setup
    if (!statusLoaded) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    px: 2,
                }}
            >
                <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420, textAlign: 'center' }}>
                    <Typography level="title-lg">{t('ui.serverUnavailableTitle')}</Typography>
                    <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                        {error || t('ui.serverUnavailableHint')}
                    </Typography>
                    <Button onClick={checkAdminStatus}>{t('ui.retry')}</Button>
                </Stack>
            </Box>
        );
    }

    // 优先级由上到下
    const redirectRules = [
        // 已确认未初始化且不允许设置/恢复
        { when: !isInitialized && !allowSetup && !allowRecover, to: '/setup' },
        // 未初始化时访问恢复页，应走设置向导
        { when: !isInitialized && allowRecover, to: '/setup' },
        // 系统已初始化但访问 setup 页面
        { when: isInitialized && allowSetup && isLoggedIn, to: '/' },
        { when: isInitialized && allowSetup && !isLoggedIn, to: '/login' },
        // 已登录访问恢复页
        { when: isInitialized && allowRecover && isLoggedIn, to: '/' },
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
