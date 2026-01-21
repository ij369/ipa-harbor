import React from 'react';
import {
    Box,
    Button,
    Typography,
    Avatar,
    Stack,
    Menu,
    MenuItem,
    MenuButton,
    Dropdown
} from '@mui/joy';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { revokeAuth } from '../utils/api';

import Swal from 'sweetalert2';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';

export default function UserStatus() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, isAuthenticated, loading, logout } = useApp();

    const handleLogout = async () => {
        try {
            const result = await Swal.fire({
                title: t('ui.confirmRevokeLogin'), // 确认撤销登录
                text: t('ui.confirmRevokeAppleId'), // 确定要撤销当前 Apple ID 的登录吗？
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: t('ui.confirm'),
                cancelButtonText: t('ui.cancel')
            });

            if (result.isConfirmed) {
                try {
                    await revokeAuth();
                    logout();
                    Swal.fire({
                        icon: 'success',
                        title: t('ui.logoutSuccess'), // 退出成功
                        timer: 1500,
                        showConfirmButton: false
                    });
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: t('ui.logoutFailed'), // 退出失败
                        text: error.message,
                        confirmButtonText: t('ui.confirm')
                    });
                    logout();
                }
            }
        } catch (error) {
            console.error('退出登录错误:', error);
        }
    };

    const handleLogin = () => {
        navigate('/apple-id');
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* <Typography level="body-sm">加载中...</Typography> */}
                <Typography level="body-sm">{t('ui.loading')}</Typography>
            </Box>
        );
    }

    if (!isAuthenticated || !user) {
        return (
            <Button variant="outlined" size="sm" onClick={handleLogin}>
                {/* Apple ID 登录 */}
                {t('ui.appleIdLogin')}
            </Button>
        );
    }

    return (
        <Dropdown>
            <MenuButton
                variant="plain"
                size="sm"
                sx={{
                    p: 0,
                    borderRadius: '50%',
                    overflow: 'hidden',
                }}
            >
                <Avatar size="sm" sx={{ bgcolor: 'primary.500', color: 'white' }}>
                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </Avatar>
            </MenuButton>

            <Menu placement="bottom-end" sx={{ minWidth: 180 }}>
                {/* <MenuItem disabled>当前 Apple ID 已登录</MenuItem> */}
                <MenuItem disabled>{t('ui.currentAppleIdLoggedIn')}</MenuItem>
                <MenuItem disabled>
                    <Stack spacing={0.3}>
                        <Typography level="body-sm" fontWeight="md">
                            {/* {user.name || '未知用户'} */}
                            {user.name || t('ui.unknownUser')}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {/* {user.email || '未知邮箱'} */}
                            {user.email || t('ui.unknownEmail')}
                        </Typography>
                    </Stack>
                </MenuItem>

                <MenuItem onClick={handleLogout} color="danger"
                >
                    <LogoutIcon />
                    {/* 撤销登录 */}
                    {t('ui.revokeLogin')}
                </MenuItem>
            </Menu>
        </Dropdown>
    );
}
