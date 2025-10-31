import React, { useState } from 'react';
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
    LinearProgress,
    List,
    ListItem,
    ListItemDecorator
} from '@mui/joy';
import { CheckCircle } from '@mui/icons-material';
import { adminSetup } from '../utils/api';
import { useAdmin } from '../contexts/AdminContext';

const AdminSetup = () => {
    const navigate = useNavigate();
    const { checkAdminStatus } = useAdmin();

    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const validateForm = () => {
        if (!formData.username || !formData.password) {
            setError('请填写所有字段');
            return false;
        }

        if (formData.username.length < 3) {
            setError('用户名长度至少为3个字符');
            return false;
        }

        if (formData.password.length < 6) {
            setError('密码长度至少为6个字符');
            return false;
        }

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            await adminSetup(formData.username, formData.password);
            setSuccess(true);

            // 等待2秒后重新检查状态并跳转
            setTimeout(async () => {
                await checkAdminStatus();
                navigate('/login');
            }, 2000);
        } catch (error) {
            setError(error.message || '创建管理员账户失败');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
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
                <Card sx={{ width: '100%', maxWidth: 500 }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                        <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                        <Typography level="h3" sx={{ mb: 2, color: 'success.main' }}>
                            设置完成！
                        </Typography>
                        <Typography level="body-md" sx={{ mb: 2 }}>
                            管理员账户创建成功，正在跳转到登录页面...
                        </Typography>
                        <LinearProgress sx={{ mt: 2 }} />
                    </CardContent>
                </Card>
            </Box>
        );
    }

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
            <Card sx={{ width: '100%', maxWidth: 500 }}>
                <CardContent>
                    <Typography level="h2" sx={{ mb: 1, textAlign: 'center' }}>
                        欢迎使用 IPA Harbor
                    </Typography>
                    <Typography level="body-md" sx={{ mb: 3, textAlign: 'center', color: 'text.secondary' }}>
                        首次运行需要设置访问账户
                    </Typography>

                    <Alert color="primary" sx={{ mb: 3 }}>
                        <Typography level="body-sm">
                            请创建一个管理员账户。此账户将用于进入系统功能。
                        </Typography>
                    </Alert>

                    <Typography level="title-md" sx={{ mb: 2 }}>
                        安全要求：
                    </Typography>
                    <List size="sm" sx={{ mb: 3 }}>
                        <ListItem>
                            <ListItemDecorator>•</ListItemDecorator>
                            用户名长度至少3个字符
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>•</ListItemDecorator>
                            密码长度至少6个字符
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>•</ListItemDecorator>
                            建议使用强密码
                        </ListItem>
                    </List>

                    {error && (
                        <Alert color="danger" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <FormControl sx={{ mb: 3 }}>
                            <FormLabel>用户名</FormLabel>
                            <Input
                                name="username"
                                value={formData.username}
                                onChange={handleInputChange}
                                placeholder="请输入用户名（至少3个字符）"
                                required
                            />
                        </FormControl>

                        <FormControl sx={{ mb: 2 }}>
                            <FormLabel>密码</FormLabel>
                            <Input
                                name="password"
                                type="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                placeholder="请输入密码（至少6个字符）"
                                required
                            />
                        </FormControl>

                        <Button
                            type="submit"
                            fullWidth
                            loading={loading}
                            disabled={loading}
                            size="lg"
                        >
                            创建管理员账户
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
};

export default AdminSetup;
