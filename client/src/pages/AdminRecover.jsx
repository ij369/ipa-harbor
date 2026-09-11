import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
    Stack,
    Link,
} from '@mui/joy';
import { CheckCircle } from '@mui/icons-material';
import { adminRecover, resolveClientErrorMessage } from '../utils/api';
import { useAdmin } from '../contexts/AdminContext';
import { useTranslation } from 'react-i18next';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import InfoOutlineIcon from '@mui/icons-material/InfoOutline';

const pageShellSx = {
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    py: 2,
    px: 2,
    '--safe-area-pad-bottom': '16px',
    '--safe-area-pad-x': '16px',
};

const pageCardSx = {
    width: '100%',
    maxWidth: 500,
    my: 'auto',
    flexShrink: 0,
};

const AdminRecover = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setupRequiresInitPin } = useAdmin();

    const [formData, setFormData] = useState({
        username: '',
        newPassword: '',
        initPin: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const validateForm = () => {
        if (!formData.username || !formData.newPassword) {
            setError(t('ui.adminRecoverCredentialsRequired'));
            return false;
        }

        if (formData.username.length < 3) {
            setError(t('ui.usernameMinLength'));
            return false;
        }

        if (formData.newPassword.length < 6) {
            setError(t('ui.passwordMinLength'));
            return false;
        }

        if (setupRequiresInitPin && !formData.initPin) {
            setError(t('ui.initPinRequired'));
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
            await adminRecover({
                username: formData.username,
                newPassword: formData.newPassword,
                initPin: formData.initPin || undefined,
            });
            setSuccess(true);

            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err) {
            setError(resolveClientErrorMessage(err) || t('apiErrorMessages.ADMIN_RECOVERY_FAILED'));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <Box className="safe-area-bottom safe-area-x" sx={pageShellSx}>
                <Card sx={pageCardSx}>
                    <CardContent sx={{ textAlign: 'center' }}>
                        <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                        <Typography level="h3" sx={{ mb: 2, color: 'success.main' }}>
                            {t('ui.adminRecoverSuccessTitle')}
                        </Typography>
                        <Typography level="body-md" sx={{ mb: 2 }}>
                            {t('ui.adminRecoverSuccessHint')}
                        </Typography>
                        <LinearProgress sx={{ mt: 2 }} />
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box className="safe-area-bottom safe-area-x" sx={pageShellSx}>
            <Card sx={pageCardSx}>
                <CardContent>
                    <Typography color="text.primary" sx={{ mb: 1, textAlign: 'center', fontSize: '1.625rem', fontWeight: 'bold' }}>
                        {t('ui.adminRecoverTitle')}
                    </Typography>

                    <Alert color="primary" sx={{ my: 2 }}>
                        <Typography level="body-xs" startDecorator={<InfoOutlineIcon sx={{ fontSize: '0.75rem', color: 'primary.main' }} />}>
                            {t('ui.adminRecoverInfo')}
                        </Typography>
                    </Alert>

                    <form onSubmit={handleSubmit}>
                        <FormControl sx={{ mb: 3 }}>
                            <FormLabel>{t('ui.username')}</FormLabel>
                            <Input
                                name="username"
                                value={formData.username}
                                onChange={handleInputChange}
                                placeholder={t('ui.usernameInputPlaceholder')}
                                required
                            />
                        </FormControl>

                        <FormControl sx={{ mb: 3 }}>
                            <FormLabel>{t('ui.newPassword')}</FormLabel>
                            <Input
                                name="newPassword"
                                type="password"
                                value={formData.newPassword}
                                onChange={handleInputChange}
                                placeholder={t('ui.passwordInputPlaceholder')}
                                required
                            />
                        </FormControl>

                        {setupRequiresInitPin && (
                            <FormControl sx={{ mb: 3 }}>
                                <FormLabel>{t('ui.initPin')}</FormLabel>
                                <Input
                                    name="initPin"
                                    value={formData.initPin}
                                    onChange={handleInputChange}
                                    placeholder={t('ui.initPinPlaceholder')}
                                    autoComplete="off"
                                    required
                                />
                            </FormControl>
                        )}

                        {error && (
                            <Alert color="danger" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            fullWidth
                            loading={loading}
                            disabled={loading}
                            size="lg"
                        >
                            {t('ui.adminRecoverSubmit')}
                        </Button>
                    </form>

                    <Typography level="title-sm" sx={{ mt: 2, mb: 1 }}>
                        {t('ui.securityRequirements')}
                    </Typography>
                    <Stack direction="column" gap={1}>
                        {[t('ui.usernameMinLength'), t('ui.passwordMinLength')].map((item, index) => (
                            <Typography key={`req-${index}`} level="body-xs" startDecorator={<RadioButtonCheckedIcon sx={{ fontSize: '0.75rem', color: 'success.main' }} />}>
                                {item}
                            </Typography>
                        ))}
                    </Stack>

                    <Typography level="body-sm" sx={{ mt: 2, textAlign: 'center' }}>
                        <Link component={RouterLink} to="/login">
                            {t('ui.backToLogin')}
                        </Link>
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};

export default AdminRecover;
