import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Stack,
    Input,
    Button,
    FormControl,
    FormLabel,
    IconButton,
    Alert,
    Divider
} from '@mui/joy';
import { ArrowBack, } from '@mui/icons-material';
import { login, revokeAuth } from '../utils/api';
import { useApp } from '../contexts/AppContext';
import Swal from 'sweetalert2';

const AppleIdLogin = () => {
    const navigate = useNavigate();
    const { setUser, user, isAuthenticated, checkAuthStatus, logout } = useApp();

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        twoFactor: ''
    });
    const [loading, setLoading] = useState(false);
    const [showTwoFactor, setShowTwoFactor] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.email || !formData.password) {
            setError('邮箱和密码不能为空');
            return;
        }

        if (showTwoFactor && !formData.twoFactor) {
            setError('请输入二次验证码');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await login(
                formData.email,
                formData.password,
                showTwoFactor ? formData.twoFactor : null
            );

            if (response.success) {
                setUser(response.data);
                navigate('/');
            }
        } catch (error) {
            console.error('登录失败:', error.message);
            setError(error.message);

            if (error.needsTwoFactor) {
                setShowTwoFactor(true);
                setError('');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBackToBasic = () => {
        setShowTwoFactor(false);
        setError('');
        setFormData(prev => ({
            ...prev,
            twoFactor: ''
        }));
    };

    const handleBackToHome = () => {
        navigate('/');
    };

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
                        toast: true,
                        position: 'top',
                        showConfirmButton: false,
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

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '60vh',
                p: 2
            }}
        >
            {isAuthenticated ?
                <Card sx={{ width: '100%', maxWidth: 400 }}>
                    <CardContent>
                        <h1>Apple ID 已登录</h1>
                        <Typography level="body-lg" sx={{ color: 'text.secondary' }}>{user.name}</Typography>
                        <Typography level="body-md" sx={{ color: 'text.secondary' }}>{user.email}</Typography>
                        <Divider sx={{ my: 2 }} />
                        <Button variant="outlined" color="danger" size="lg" onClick={handleLogout}>
                            撤销登录
                        </Button>
                    </CardContent>
                </Card>
                :
                <Card sx={{ width: '100%', maxWidth: 400 }}>
                    <CardContent>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                            <IconButton
                                size="sm"
                                variant="outlined"
                                onClick={handleBackToHome}
                                sx={{ borderRadius: '50%' }}
                            >
                                <ArrowBack />
                            </IconButton>
                            <Typography level="h3" sx={{ flex: 1, textAlign: 'center' }}>
                                登录 Apple ID
                            </Typography>
                            <Box sx={{ width: 32 }} /> {/* 占位符保持居中 */}
                        </Stack>

                        {showTwoFactor && (
                            <Box sx={{ mb: 2 }}>
                                <IconButton
                                    size="sm"
                                    variant="outlined"
                                    onClick={handleBackToBasic}
                                    sx={{ borderRadius: '50%' }}
                                >
                                    <ArrowBack />
                                </IconButton>
                            </Box>
                        )}

                        {error && (
                            <Alert color="danger" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <form onSubmit={handleSubmit}>
                            <Stack spacing={3}>
                                {!showTwoFactor && (
                                    <Box sx={{ textAlign: 'center', mb: 2 }}>
                                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                            请使用您的 Apple ID 登录
                                        </Typography>
                                    </Box>
                                )}

                                <FormControl sx={{ display: showTwoFactor ? 'none' : 'block' }}>
                                    <FormLabel>Apple ID</FormLabel>
                                    <Input
                                        type="text"
                                        value={formData.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="请输入Apple ID邮箱"
                                        autoComplete="username"
                                        required
                                        disabled={loading}
                                    />
                                </FormControl>

                                <FormControl sx={{ display: showTwoFactor ? 'none' : 'block' }}>
                                    <FormLabel>密码</FormLabel>
                                    <Input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => handleInputChange('password', e.target.value)}
                                        placeholder="请输入密码"
                                        autoComplete="current-password"
                                        required
                                        disabled={loading}
                                    />
                                </FormControl>

                                <FormControl sx={{ display: showTwoFactor ? 'block' : 'none' }}>
                                    <FormLabel>二次验证码</FormLabel>
                                    <Input
                                        type="text"
                                        value={formData.twoFactor}
                                        onChange={(e) => handleInputChange('twoFactor', e.target.value)}
                                        placeholder="请输入6位验证码"
                                        disabled={loading}
                                        autoComplete="one-time-code"
                                        slotProps={{
                                            input: {
                                                inputMode: 'numeric',
                                                maxLength: 6
                                            }
                                        }}
                                    />
                                    <Typography level="body-xs" sx={{ mt: 1, color: 'text.secondary' }}>
                                        请查看您的受信任设备或短信/邮件获取验证码
                                    </Typography>
                                </FormControl>

                                <Button
                                    type="submit"
                                    fullWidth
                                    loading={loading}
                                    disabled={loading}
                                    size="lg"
                                >
                                    {loading ? '登录中...' : (showTwoFactor ? '验证并登录' : '登录')}
                                </Button>
                            </Stack>
                        </form>

                        {!showTwoFactor && (
                            <>
                                <Divider sx={{ my: 3 }} />
                                <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                                    需要登录后才能搜索应用、领取应用和下载 App Store 中的 IPA
                                </Typography>
                            </>
                        )}
                    </CardContent>
                </Card>}
        </Box>
    );
};

export default AppleIdLogin;
