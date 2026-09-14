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
    LinearProgress,
    Stack,
    Divider
} from '@mui/joy';
import { CheckCircle } from '@mui/icons-material';
import {
    adminSetup,
    adminLogin,
    getAdminStatus,
    passkeyRegisterOptions,
    passkeyRegisterVerify,
    resolveClientErrorMessage,
} from '../utils/api';
import { useAdmin } from '../contexts/AdminContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import InfoOutlineIcon from '@mui/icons-material/InfoOutline';
import PasskeyIcon from '../components/PasskeyIcon';
import {
    isPasskeySupported,
    performPasskeyRegister,
    resolvePasskeyClientError,
} from '../utils/passkey';

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
    // borderRadius: 'md',
};

const AdminSetup = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        checkAdminStatus,
        setupRequiresInitPin,
        logout,
        beginPostSetupFlow,
        endPostSetupFlow,
    } = useAdmin();

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        initPin: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [successPhase, setSuccessPhase] = useState('redirect');
    const [passkeyLoading, setPasskeyLoading] = useState(false);

    useEffect(() => {
        if (!success || successPhase !== 'redirect') {
            return undefined;
        }

        const timer = setTimeout(async () => {
            endPostSetupFlow();
            await checkAdminStatus();
            navigate('/login');
        }, 2000);

        return () => clearTimeout(timer);
    }, [success, successPhase, navigate, endPostSetupFlow, checkAdminStatus]);

    useEffect(() => {
        if (successPhase !== 'passkey-done') {
            return undefined;
        }

        const timer = setTimeout(async () => {
            endPostSetupFlow();
            await logout();
            await checkAdminStatus();
            navigate('/login');
        }, 1500);

        return () => clearTimeout(timer);
    }, [successPhase, navigate, endPostSetupFlow, logout, checkAdminStatus]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const validateForm = () => {
        if (!formData.username || !formData.password) {
            setError(t('ui.usernamePlaceholder') + ' & ' + t('ui.passwordPlaceholder_admin'));
            return false;
        }

        if (formData.username.length < 3) {
            setError(t('ui.usernameMinLength'));
            return false;
        }

        if (formData.password.length < 6) {
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
            await adminSetup({
                username: formData.username,
                password: formData.password,
                initPin: formData.initPin || undefined,
            });

            const statusResponse = await getAdminStatus();
            const passkeyAvailable = Boolean(statusResponse.data?.passkeyEnabled)
                && isPasskeySupported();

            beginPostSetupFlow();
            setSuccess(true);
            setSuccessPhase(passkeyAvailable ? 'passkey-offer' : 'redirect');
        } catch (err) {
            setError(resolveClientErrorMessage(err) || t('apiErrorMessages.ADMIN_SETUP_FAILED'));
        } finally {
            setLoading(false);
        }
    };

    const handleSkipPasskey = async () => {
        endPostSetupFlow();
        await checkAdminStatus();
        navigate('/login');
    };

    const handleEnablePasskey = async () => {
        setPasskeyLoading(true);
        setError('');

        try {
            /*
            * 注册 Passkey 前需先密码登录写入 cookie；若中途打断 Passkey 注册流程，刷新，cookie 仍有效可能自动登录（非缺陷）
            * 若中途刷新，会自动进入面板页面
            */
            await adminLogin(formData.username, formData.password);
            const optionsResponse = await passkeyRegisterOptions();
            const { challengeId, options } = optionsResponse.data;
            const credential = await performPasskeyRegister(options);
            await passkeyRegisterVerify(challengeId, credential);
            setSuccessPhase('passkey-done');
        } catch (err) {
            const message = resolvePasskeyClientError(err) || resolveClientErrorMessage(err);
            if (message) {
                setError(message);
            }
        } finally {
            setPasskeyLoading(false);
        }
    };

    if (success) {
        return (
            <Box className="safe-area-bottom safe-area-x" sx={pageShellSx}>
                <Card sx={pageCardSx}>
                    <CardContent sx={{ textAlign: 'center' }}>
                        <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                        <Typography level="h3" sx={{ mb: 2, color: 'success.main' }}>
                            {t('ui.setupComplete')}
                        </Typography>
                        <Typography level="body-md" sx={{ mb: 3 }}>
                            {successPhase === 'passkey-done'
                                ? t('ui.passkeyRegisterSuccess')
                                : t('ui.adminCreatedSuccess')}
                        </Typography>

                        {successPhase === 'passkey-offer' && (
                            <>
                                <Divider />
                                <Box
                                    sx={{
                                        mb: 3,
                                        py: 3,
                                        px: 1,
                                        // borderRadius: 'md',
                                        // bgcolor: 'primary.softBg',
                                        // border: '1px solid',
                                        // borderColor: 'primary.outlinedBorder',
                                    }}
                                >
                                    <Stack gap={1.5} alignItems="center">
                                        <PasskeyIcon sx={{ fontSize: 36, color: 'primary.plainColor' }} />
                                        <Typography level="title-md" textAlign="center">
                                            {t('ui.setupPasskeyOfferTitle')}
                                        </Typography>
                                        <Typography
                                            level="body-sm"
                                            textAlign="center"
                                            sx={{
                                                color: 'text.secondary',
                                                maxWidth: 360,
                                                lineHeight: 1.65,
                                            }}
                                        >
                                            {t('ui.setupPasskeyOfferDesc')}
                                        </Typography>
                                        <Button
                                            size="lg"
                                            fullWidth
                                            loading={passkeyLoading}
                                            disabled={passkeyLoading}
                                            onClick={handleEnablePasskey}
                                        >
                                            {t('ui.setupEnablePasskey')}
                                        </Button>

                                        <Button
                                            size="lg"
                                            fullWidth
                                            variant="plain"
                                            color="neutral"
                                            disabled={passkeyLoading}
                                            onClick={handleSkipPasskey}
                                        >
                                            {t('ui.setupSkipPasskey')}
                                        </Button>
                                    </Stack>
                                </Box>

                                {error && (
                                    <Alert color="danger" sx={{ mb: 2, textAlign: 'left' }}>
                                        {error}
                                    </Alert>
                                )}
                            </>
                        )}

                        {successPhase === 'redirect' && (
                            <>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    {t('ui.setupRedirectingToLogin')}
                                </Typography>
                                <LinearProgress sx={{ mt: 2 }} />
                            </>
                        )}

                        {successPhase === 'passkey-done' && (
                            <>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    {t('ui.setupRedirectingToLogin')}
                                </Typography>
                                <LinearProgress sx={{ mt: 2 }} />
                            </>
                        )}
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box className="safe-area-bottom safe-area-x" sx={pageShellSx}>
            <Card sx={pageCardSx}>
                <CardContent>
                    <Typography color='text.primary' sx={{ mb: 1, textAlign: 'center', fontSize: '1.625rem', fontWeight: 'bold' }}>
                        {t('ui.adminSetupTitle', { appName: 'IPA Harbor' })}
                    </Typography>
                    <Typography level="body-md" sx={{ my: 1, textAlign: 'center' }}>
                        {t('ui.firstRunSetup')}
                    </Typography>

                    <Alert color="primary" sx={{ my: 2 }}>
                        <Typography level="body-xs" startDecorator={<InfoOutlineIcon sx={{ fontSize: '0.75rem', color: 'primary.main' }} />}>
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
                                placeholder={t('ui.usernameInputPlaceholder')}
                                required
                            />
                        </FormControl>

                        <FormControl sx={{ mb: 3 }}>
                            <FormLabel>{t('ui.password')}</FormLabel>
                            <Input
                                name="password"
                                type="password"
                                value={formData.password}
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

                        <FormControl sx={{ mb: 2 }}>
                            <FormLabel>{t('ui.language')}</FormLabel>
                            <LanguageSwitcher variant="select" size="md" fullWidth={true} />
                        </FormControl>

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
                            {t('ui.createAdminAccount')}
                        </Button>
                    </form>

                    <Typography level="title-sm" sx={{ mt: 2, mb: 1 }}>
                        {t('ui.securityRequirements')}
                    </Typography>
                    <Stack direction="column" gap={1}>
                        {[t('ui.usernameMinLength'), t('ui.passwordMinLength'), t('ui.strongPasswordRecommend')].map((item, index) => (
                            <Typography key={'req-' + index} level="body-xs" startDecorator={<RadioButtonCheckedIcon sx={{ fontSize: '0.75rem', color: 'success.main' }} />}>
                                {item}
                            </Typography>
                        ))}
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
};

export default AdminSetup;
