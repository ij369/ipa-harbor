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
    Stack
} from '@mui/joy';
import { CheckCircle } from '@mui/icons-material';
import { adminSetup } from '../utils/api';
import { useAdmin } from '../contexts/AdminContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import InfoOutlineIcon from '@mui/icons-material/InfoOutline';

const AdminSetup = () => {
    const { t } = useTranslation();
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
            setError(t('ui.usernamePlaceholder') + ' & ' + t('ui.passwordPlaceholder_admin')); // 请输入用户名 & 请输入密码
            return false;
        }

        if (formData.username.length < 3) {
            setError(t('ui.usernameMinLength')); // 用户名长度至少3个字符
            return false;
        }

        if (formData.password.length < 6) {
            setError(t('ui.passwordMinLength')); // 密码长度至少6个字符
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
                className="full-height"
            >
                <Card sx={{ width: '100%', maxWidth: 500 }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                        <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                        <Typography level="h3" sx={{ mb: 2, color: 'success.main' }}>
                            {/* 设置完成！ */}
                            {t('ui.setupComplete')}
                        </Typography>
                        <Typography level="body-md" sx={{ mb: 2 }}>
                            {/* 管理员账户创建成功，正在跳转到登录页面... */}
                            {t('ui.adminCreatedSuccess')}
                        </Typography>
                        <LinearProgress sx={{ mt: 2 }} />
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Stack
            direction="column"
            gap={1.8}
            alignItems="center"
            justifyContent="center"
            sx={{
                p: 2
            }}
            className="full-height"
        >
            <Card sx={{ width: '100%', maxWidth: 500 }}>
                <CardContent>
                    <Typography color='text.primary' sx={{ mb: 1, textAlign: 'center', fontSize: '1.625rem', fontWeight: 'bold' }}>
                        {t('ui.adminSetupTitle', { appName: 'IPA Harbor' })}
                    </Typography>
                    <Typography level="body-md" sx={{ my: 1, textAlign: 'center' }}>
                        {/* 首次运行需要设置访问账户 */}
                        {t('ui.firstRunSetup')}
                    </Typography>

                    <Alert color="primary" sx={{ my: 2 }}>
                        <Typography level="body-xs" startDecorator={<InfoOutlineIcon sx={{ fontSize: '0.75rem', color: 'primary.main' }} />}>
                            {/* 请创建一个管理员账户。此账户将用于进入系统功能。 */}
                            {t('ui.createAdminHint')}
                        </Typography>
                    </Alert>
                    <form onSubmit={handleSubmit}>
                        <FormControl sx={{ mb: 3 }}>
                            <FormLabel>{t('ui.username')}</FormLabel>
                            <Input
                                name="username"
                                value={formData.username}
                                onChange={handleInputChange}
                                placeholder={t('ui.usernameInputPlaceholder')} // 请输入用户名（至少3个字符）
                                required
                            />
                        </FormControl>

                        <FormControl sx={{ mb: 2 }}>
                            <FormLabel>{t('ui.password')}</FormLabel>
                            <Input
                                name="password"
                                type="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                placeholder={t('ui.passwordInputPlaceholder')} // 请输入密码（至少6个字符）
                                required
                            />
                        </FormControl>

                        <FormControl sx={{ mb: 2 }}>
                            <FormLabel>{t('ui.language')}</FormLabel>
                            <LanguageSwitcher variant="select" size="md" fullWidth={true} />
                        </FormControl>

                        <Button
                            type="submit"
                            fullWidth
                            loading={loading}
                            disabled={loading}
                            size="lg"
                        >
                            {/* 创建管理员账户 */}
                            {t('ui.createAdminAccount')}
                        </Button>
                    </form>

                    <Typography level="title-sm" sx={{ mt: 2, mb: 1 }}>
                        {/* 安全要求： */}
                        {t('ui.securityRequirements')}
                    </Typography>
                    <Stack direction="column" gap={1}>
                        {[t('ui.usernameMinLength'), t('ui.passwordMinLength'), t('ui.strongPasswordRecommend')].map((item, index) => (
                            <Typography key={'req-' + index} level="body-xs" startDecorator={<RadioButtonCheckedIcon sx={{ fontSize: '0.75rem', color: 'success.main' }} />}>
                                {item}
                            </Typography>
                        ))}
                    </Stack>

                    {error && (
                        <Alert color="danger" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}


                </CardContent>
            </Card>

        </Stack>
    );
};

export default AdminSetup;
