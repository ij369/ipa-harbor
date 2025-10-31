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

export default function UserStatus() {
    const navigate = useNavigate();
    const { user, isAuthenticated, loading, logout } = useApp();

    const handleLogout = async () => {
        try {
            const result = await Swal.fire({
                title: '确认撤销登录',
                text: '确定要撤销当前 Apple ID 的登录吗？',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: '确定',
                cancelButtonText: '取消'
            });

            if (result.isConfirmed) {
                try {
                    await revokeAuth();
                    logout();
                    Swal.fire({
                        icon: 'success',
                        title: '退出成功',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: '退出失败',
                        text: error.message,
                        confirmButtonText: '确定'
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
                <Typography level="body-sm">加载中...</Typography>
            </Box>
        );
    }

    if (!isAuthenticated || !user) {
        return (
            <Button variant="outlined" size="sm" onClick={handleLogin}>
                Apple ID 登录
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
                <MenuItem disabled>当前 Apple ID 已登录</MenuItem>
                <MenuItem disabled>
                    <Stack spacing={0.3}>
                        <Typography level="body-sm" fontWeight="md">
                            {user.name || '未知用户'}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {user.email || '未知邮箱'}
                        </Typography>
                    </Stack>
                </MenuItem>

                <MenuItem onClick={handleLogout} color="danger"
                >
                    <LogoutIcon />
                    撤销登录
                </MenuItem>
            </Menu>
        </Dropdown>
    );
}
