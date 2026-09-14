import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    Divider,
    Chip,
    Stack,
    Link,
} from '@mui/joy';
import { useAdmin } from '../contexts/AdminContext';
import { resolveClientErrorMessage, passkeyLoginOptions } from '../utils/api';
import {
    isPasskeySupported,
    isPasskeyConditionalUiEnabled,
    isPasskeyNonRetryableError,
    isPasskeyUserCancelled,
    resolvePasskeyClientError,
    startConditionalPasskeyLogin,
} from '../utils/passkey';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PasskeyIcon from '../components/PasskeyIcon';

const AdminLogin = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        isLoggedIn, user, login, passkeyLogin, completePasskeyLogin, logout,
        getFormattedExpiresAt, isExpiringSoon, loading,
        statusLoaded, passkeyEnabled,
    } = useAdmin();

    const [formData, setFormData] = useState({
        username: '',
        password: '',
    });
    const [loginLoading, setLoginLoading] = useState(false);
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [conditionalRestartKey, setConditionalRestartKey] = useState(0);
    const [bgImage, setBgImage] = useState(null);
    const [loaded, setLoaded] = useState(false);

    const passkeyAvailable = statusLoaded && passkeyEnabled && isPasskeySupported();
    const conditionalUiActive = passkeyAvailable && isPasskeyConditionalUiEnabled();

    const handleConditionalCredential = useCallback(async ({ challengeId, credential }) => {
        setPasskeyLoading(true);
        setLoginError('');
        try {
            await completePasskeyLogin(challengeId, credential);
            setFormData({ username: '', password: '' });
        } catch (err) {
            const message = resolvePasskeyClientError(err);
            if (message) {
                setLoginError(message);
            }
        } finally {
            setPasskeyLoading(false);
            setConditionalRestartKey((key) => key + 1);
        }
    }, [completePasskeyLogin]);

    const handleConditionalError = useCallback((err) => {
        if (isPasskeyUserCancelled(err) || isPasskeyNonRetryableError(err)) {
            return;
        }
        const message = resolvePasskeyClientError(err);
        if (message) {
            setLoginError(message);
        }
        setConditionalRestartKey((key) => key + 1);
    }, []);

    const conditionalAbortRef = useRef(null);
    const conditionalActiveRef = useRef(false);

    const abortConditional = useCallback(() => {
        conditionalAbortRef.current?.abort();
        conditionalAbortRef.current = null;
        conditionalActiveRef.current = false;
    }, []);

    useEffect(() => {
        if (!conditionalUiActive || isLoggedIn || loading) {
            return undefined;
        }

        let cancelled = false;
        const abortController = new AbortController();
        conditionalAbortRef.current = abortController;
        conditionalActiveRef.current = true;

        (async () => {
            try {
                const optionsResponse = await passkeyLoginOptions();
                if (cancelled || !conditionalActiveRef.current) {
                    return;
                }

                const { challengeId, options } = optionsResponse.data;
                const credential = await startConditionalPasskeyLogin(
                    options,
                    abortController.signal,
                );

                if (cancelled || !credential) {
                    return;
                }

                conditionalActiveRef.current = false;
                conditionalAbortRef.current = null;
                await handleConditionalCredential({ challengeId, credential });
            } catch (err) {
                if (cancelled || isPasskeyUserCancelled(err)) {
                    return;
                }
                if (isPasskeyNonRetryableError(err)) {
                    return;
                }
                handleConditionalError(err);
            }
        })();

        return () => {
            cancelled = true;
            abortConditional();
        };
    }, [
        conditionalUiActive,
        isLoggedIn,
        loading,
        conditionalRestartKey,
        handleConditionalCredential,
        handleConditionalError,
        abortConditional,
    ]);

    useEffect(() => {
        if (isLoggedIn && user) {
            // navigate('/');
        }
    }, [isLoggedIn, user, navigate]);

    useEffect(() => {
        const images = [
            '/lighthouse-2104591.webp',
            '/mountains-5819652.webp',
            '/husavik-3654390.webp',
            '/dsc00691.webp',
            '/dsc00869.webp',
        ];
        const randomImage = images[Math.floor(Math.random() * images.length)];
        const img = new Image();
        img.src = randomImage;
        img.onload = () => {
            setBgImage(randomImage);
            requestAnimationFrame(() => setLoaded(true));
        };
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!formData.username || !formData.password) {
            setLoginError(`${t('ui.usernamePlaceholder')} & ${t('ui.passwordPlaceholder_admin')}`);
            return;
        }

        setLoginLoading(true);
        setLoginError('');

        try {
            await login(formData.username, formData.password);
            setFormData({ username: '', password: '' });
        } catch (loginErr) {
            setLoginError(resolveClientErrorMessage(loginErr) || t('apiErrorMessages.ADMIN_LOGIN_FAILED'));
        } finally {
            setLoginLoading(false);
        }
    };

    const handlePasskeyLogin = async () => {
        abortConditional();
        setPasskeyLoading(true);
        setLoginError('');
        try {
            await passkeyLogin();
            setFormData({ username: '', password: '' });
        } catch (err) {
            const message = resolvePasskeyClientError(err);
            if (message) {
                setLoginError(message);
            }
        } finally {
            setPasskeyLoading(false);
            setConditionalRestartKey((key) => key + 1);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (logoutErr) {
            console.error('退出登录失败:', logoutErr);
        }
    };

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '60vh',
                }}
            >
                <Typography>{t('ui.loading')}</Typography>
            </Box>
        );
    }

    return (
        <Box
            className="full-min-height safe-area-bottom safe-area-x"
            sx={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pt: 2,
                px: 2,
                overflow: 'hidden',
                '--safe-area-pad-bottom': '16px',
                '--safe-area-pad-x': '16px',
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
                                {t('ui.adminLoginTitle')}
                            </Typography>
                            <Typography level="body-sm" sx={{ mb: 3, textAlign: 'center', color: 'text.secondary' }}>
                                {t('ui.adminLoginSubtitle')}
                            </Typography>
                            {loginError && (
                                <Alert color="danger" sx={{ mb: 2 }}>
                                    {loginError}
                                </Alert>
                            )}

                            <form onSubmit={handleLogin}>
                                <FormControl sx={{ mb: 2 }}>
                                    <FormLabel>{t('ui.username')}</FormLabel>
                                    <Input
                                        name="username"
                                        value={formData.username}
                                        onChange={handleInputChange}
                                        placeholder={t('ui.usernamePlaceholder')}
                                        autoComplete="username webauthn"
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
                                        placeholder={t('ui.passwordPlaceholder_admin')}
                                        autoComplete="current-password"
                                        required
                                    />
                                </FormControl>

                                <Button
                                    type="submit"
                                    fullWidth
                                    loading={loginLoading}
                                    disabled={loginLoading || passkeyLoading}
                                >
                                    {t('ui.login')}
                                </Button>
                            </form>

                            {passkeyAvailable && (
                                <Button
                                    fullWidth
                                    variant="soft"
                                    color="neutral"
                                    sx={{ mt: 1.5 }}
                                    loading={passkeyLoading}
                                    disabled={passkeyLoading || loginLoading}
                                    onClick={handlePasskeyLogin}
                                    startDecorator={<PasskeyIcon />}
                                >
                                    {t('ui.passkeyLogin')}
                                </Button>
                            )}
                            <Typography level="body-sm" sx={{ mt: 1.5, textAlign: 'center' }}>
                                <Link component={RouterLink} to="/recover">
                                    {t('ui.adminRecoverLink')}
                                </Link>
                            </Typography>
                            <Divider sx={{ mt: 1.5 }} />
                            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1.5 }}>
                                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                    {t('ui.language')}:
                                </Typography>
                                <LanguageSwitcher variant="select" size="sm" />
                            </Stack>
                        </>
                    ) : (
                        <>
                            <Typography level="h3" sx={{ mb: 2, textAlign: 'center' }}>
                                {t('ui.systemInfo')}
                            </Typography>

                            <Alert color="success" sx={{ mb: 2 }}>
                                {t('ui.loggedIn')}
                            </Alert>

                            <Box sx={{ mb: 2 }}>
                                <Typography level="body-sm" sx={{ mb: 1 }}>
                                    {t('ui.username')}
                                </Typography>
                                <Typography level="body-md" sx={{ fontWeight: 'bold' }}>
                                    {user.username}
                                </Typography>
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography level="body-sm" sx={{ mb: 1 }}>
                                    {t('ui.loginExpiry')}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography level="body-md">
                                        {getFormattedExpiresAt()}
                                    </Typography>
                                    {isExpiringSoon() && (
                                        <Chip color="warning" size="sm">
                                            {t('ui.expiringSoon')}
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
                                {t('ui.logoutSystem')}
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default AdminLogin;
