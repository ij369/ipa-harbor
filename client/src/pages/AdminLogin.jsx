import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    CardContent,
    Typography,
    FormControl,
    FormLabel,
    Input,
    Button,
    Alert,
    Divider,
    Chip
} from '@mui/joy';
import { useAdmin } from '../contexts/AdminContext';

const AdminLogin = () => {
    const navigate = useNavigate();
    const { isLoggedIn, user, login, logout, getFormattedExpiresAt, isExpiringSoon, loading, error } = useAdmin();

    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    // 如果已登录，显示用户信息
    useEffect(() => {
        if (isLoggedIn && user) {
            // navigate('/');
        }
    }, [isLoggedIn, user, navigate]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!formData.username || !formData.password) {
            setLoginError('请输入用户名和密码');
            return;
        }

        setLoginLoading(true);
        setLoginError('');

        try {
            await login(formData.username, formData.password);
            setFormData({ username: '', password: '' });
            // navigate('/');
        } catch (error) {
            setLoginError(error.message || '登录失败');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('退出登录失败:', error);
        }
    };

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '60vh'
                }}
            >
                <Typography>加载中...</Typography>
            </Box>
        );
    }

    const images = [
        '/lighthouse-2104591.webp',
        '/mountains-5819652.webp',
        '/husavik-3654390.webp',
        '/dsc00691.webp',
        '/dsc00869.webp'
    ];

    const [bgImage, setBgImage] = useState(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const randomImage = images[Math.floor(Math.random() * images.length)];
        const img = new Image();
        img.src = randomImage;

        img.onload = () => {
            setBgImage(randomImage);

            requestAnimationFrame(() => setLoaded(true));
        };
    }, []);
    return (
        <Box
            sx={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                p: 2,
                overflow: 'hidden',
            }}
        >
            {bgImage && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: `url(${bgImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        transform: loaded ? 'scale(1.11)' : 'scale(1.05)',
                        filter: loaded ? 'blur(0px)' : 'blur(2px)',
                        zIndex: -2,
                        opacity: loaded ? 1 : 0,
                        transition: 'opacity 1.8s ease-in-out, transform 6s ease-out, filter 2s ease-out',
                    }}
                />
            )}

            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: -1,
                }}
            />

            <Card sx={{ width: '100%', maxWidth: 400 }}>
                <CardContent>
                    {!isLoggedIn ? (
                        <>
                            <Typography level="h3" sx={{ mb: 2, textAlign: 'center' }}>
                                登入系统
                            </Typography>
                            <Typography level="body-sm" sx={{ mb: 3, textAlign: 'center', color: 'text.secondary' }}>
                                请输入管理员账户
                            </Typography>
                            {error && (
                                <Alert color="danger" sx={{ mb: 2 }}>
                                    {error}
                                </Alert>
                            )}

                            {loginError && (
                                <Alert color="danger" sx={{ mb: 2 }}>
                                    {loginError}
                                </Alert>
                            )}

                            <form onSubmit={handleLogin}>
                                <FormControl sx={{ mb: 2 }}>
                                    <FormLabel>用户名</FormLabel>
                                    <Input
                                        name="username"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        placeholder="请输入用户名"
                                        required
                                    />
                                </FormControl>

                                <FormControl sx={{ mb: 3 }}>
                                    <FormLabel>密码</FormLabel>
                                    <Input
                                        name="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        placeholder="请输入密码"
                                        required
                                    />
                                </FormControl>

                                <Button
                                    type="submit"
                                    fullWidth
                                    loading={loginLoading}
                                    disabled={loginLoading}
                                >
                                    登录
                                </Button>
                            </form>
                        </>
                    ) : (
                        <>
                            <Typography level="h3" sx={{ mb: 2, textAlign: 'center' }}>
                                系统信息
                            </Typography>

                            <Alert color="success" sx={{ mb: 2 }}>
                                已登录
                            </Alert>

                            <Box sx={{ mb: 2 }}>
                                <Typography level="body-sm" sx={{ mb: 1 }}>
                                    用户名
                                </Typography>
                                <Typography level="body-md" sx={{ fontWeight: 'bold' }}>
                                    {user.username}
                                </Typography>
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography level="body-sm" sx={{ mb: 1 }}>
                                    登录过期时间
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography level="body-md">
                                        {getFormattedExpiresAt()}
                                    </Typography>
                                    {isExpiringSoon() && (
                                        <Chip color="warning" size="sm">
                                            即将过期
                                        </Chip>
                                    )}
                                </Box>
                            </Box>

                            <Divider sx={{ my: 2 }} />
                            <Button
                                color="danger"
                                variant="outlined"
                                fullWidth
                                onClick={handleLogout}
                            >
                                退出系统
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default AdminLogin;
