import React, { useState, useRef, useEffect } from 'react';
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
    Divider,
    Sheet,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Link
} from '@mui/joy';
import { ArrowBack, ExpandMore } from '@mui/icons-material';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { login, revokeAuth, isRateLimitError, getAdminStatus, checkAppUpdate, resolveClientErrorMessage } from '../utils/api';
import { useAppSession } from '../contexts/AppContext';
import Swal from 'sweetalert2';
import { useTranslation } from 'react-i18next';

const EASE_OUT = [0.22, 1, 0.36, 1];

const hideScrollbarSx = {
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    overscrollBehavior: 'contain',
    '&::-webkit-scrollbar': {
        display: 'none',
    },
};

const AppleIdLogin = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setUser, user, isAuthenticated, checkAuthStatus, logout } = useAppSession();
    const prefersReducedMotion = useReducedMotion();

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        twoFactor: ''
    });
    const [loading, setLoading] = useState(false);
    const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
    const [twoFactorAutoPrompted, setTwoFactorAutoPrompted] = useState(false);
    const [showTwoFactorInput, setShowTwoFactorInput] = useState(false);
    const [error, setError] = useState('');
    const [faqExpanded, setFaqExpanded] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const twoFactorInputRef = useRef(null);
    const shouldFocusTwoFactorRef = useRef(false);
    const twoFactorCredentialsRef = useRef({ email: '', password: '' });

    const resetAutoTwoFactorState = ({ clearTwoFactor = true } = {}) => {
        setTwoFactorAutoPrompted(false);
        setNeedsTwoFactor(false);
        setShowTwoFactorInput(false);
        if (clearTwoFactor) {
            setFormData((prev) => ({ ...prev, twoFactor: '' }));
        }
        twoFactorCredentialsRef.current = { email: '', password: '' };
    };

    const markTwoFactorRequired = (email, password) => {
        twoFactorCredentialsRef.current = { email, password };
        setTwoFactorAutoPrompted(true);
        setNeedsTwoFactor(true);
        shouldFocusTwoFactorRef.current = true;
        setShowTwoFactorInput(true);
        setError('');
    };

    const motionDuration = prefersReducedMotion ? 0 : 0.28;
    const expandDuration = prefersReducedMotion ? 0 : 0.34;

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    useEffect(() => {
        getAdminStatus()
            .then((response) => {
                if (response.success && response.data?.version) {
                    setAppVersion(response.data.version);
                }
            })
            .catch(() => {
                // 静默失败，版本区显示占位
            });
    }, []);

    const buildGithubLinksHtml = (harborGithubUrl, ipatoolGithubUrl) => `
        <p style="margin: 12px 0 8px; font-size: 14px;">${t('ui.reportIssueHint')}</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.8;">
            <a href="${harborGithubUrl}" target="_blank" rel="noopener noreferrer">${t('ui.harborGithub')}</a><br/>
            <a href="${ipatoolGithubUrl}" target="_blank" rel="noopener noreferrer">${t('ui.ipatoolGithub')}</a>
        </p>
    `;

    const handleCheckUpdate = async () => {
        setCheckingUpdate(true);

        try {
            const response = await checkAppUpdate();
            const data = response.data;

            if (data?.currentVersion) {
                setAppVersion(data.currentVersion);
            }

            const linksHtml = buildGithubLinksHtml(
                data.harborGithubUrl,
                data.ipatoolGithubUrl
            );

            if (data.isLatest) {
                await Swal.fire({
                    icon: 'success',
                    title: t('ui.alreadyLatestVersion', { version: data.currentVersion }),
                    html: linksHtml,
                    confirmButtonText: t('ui.confirm'),
                });
                return;
            }

            await Swal.fire({
                icon: 'info',
                title: t('ui.updateAvailable', {
                    latest: data.latestVersion,
                    current: data.currentVersion,
                }),
                html: `
                    <p style="margin: 0 0 8px; font-size: 14px;">
                        <a href="${data.dockerHubUrl}" target="_blank" rel="noopener noreferrer">${t('ui.viewDockerTags')}</a>
                    </p>
                    ${linksHtml}
                `,
                confirmButtonText: t('ui.confirm'),
            });
        } catch (error) {
            if (isRateLimitError(error)) {
                return;
            }

            await Swal.fire({
                icon: 'error',
                title: t('ui.updateCheckFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setCheckingUpdate(false);
        }
    };

    const formContainerVariants = {
        hidden: { opacity: prefersReducedMotion ? 1 : 0 },
        show: {
            opacity: 1,
            transition: prefersReducedMotion
                ? { duration: 0 }
                : { staggerChildren: 0.06, delayChildren: 0.05 },
        },
    };

    const formItemVariants = {
        hidden: {
            opacity: prefersReducedMotion ? 1 : 0,
            y: prefersReducedMotion ? 0 : 8,
        },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: motionDuration, ease: EASE_OUT },
        },
    };

    const collapseVariants = {
        initial: {
            opacity: prefersReducedMotion ? 1 : 0,
            height: prefersReducedMotion ? 'auto' : 0,
        },
        animate: {
            opacity: 1,
            height: 'auto',
            transition: { duration: expandDuration, ease: EASE_OUT },
        },
        exit: {
            opacity: prefersReducedMotion ? 1 : 0,
            height: prefersReducedMotion ? 'auto' : 0,
            transition: { duration: motionDuration, ease: EASE_OUT },
        },
    };

    const twoFactorExpandVariants = {
        initial: {
            opacity: prefersReducedMotion ? 1 : 0,
            height: prefersReducedMotion ? 'auto' : 0,
            y: prefersReducedMotion ? 0 : -6,
        },
        animate: {
            opacity: 1,
            height: 'auto',
            y: 0,
            transition: { duration: expandDuration, ease: EASE_OUT },
        },
        exit: {
            opacity: prefersReducedMotion ? 1 : 0,
            height: prefersReducedMotion ? 'auto' : 0,
            y: prefersReducedMotion ? 0 : -4,
            transition: { duration: motionDuration, ease: EASE_OUT },
        },
    };

    const expandTwoFactorInput = () => {
        shouldFocusTwoFactorRef.current = true;
        setShowTwoFactorInput(true);
        setError('');
    };

    const handleTwoFactorAnimationComplete = () => {
        if (!showTwoFactorInput || !shouldFocusTwoFactorRef.current) {
            return;
        }

        shouldFocusTwoFactorRef.current = false;
        twoFactorInputRef.current?.focus({ preventScroll: true });
    };

    const handleTwoFactorFocus = () => {
        setLoading(false);
    };

    const handleInputChange = (field, value) => {
        let credentialsChanged = false;

        if ((field === 'email' || field === 'password') && twoFactorAutoPrompted) {
            const pending = twoFactorCredentialsRef.current;
            credentialsChanged = field === 'email'
                ? value !== pending.email
                : value !== pending.password;

            if (credentialsChanged) {
                setTwoFactorAutoPrompted(false);
                setNeedsTwoFactor(false);
                setShowTwoFactorInput(false);
                twoFactorCredentialsRef.current = { email: '', password: '' };
            }
        }

        setFormData((prev) => ({
            ...prev,
            [field]: value,
            ...(credentialsChanged ? { twoFactor: '' } : {}),
        }));

        if (field === 'twoFactor' && value) {
            setError('');
        } else if (field === 'email' || field === 'password') {
            setError('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.email || !formData.password) {
            setError(t('ui.appleIdPlaceholder') + ' & ' + t('ui.passwordPlaceholder'));
            return;
        }

        if (needsTwoFactor && twoFactorAutoPrompted && !formData.twoFactor) {
            setError(t('ui.twoFactorPlaceholder'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await login(
                formData.email,
                formData.password,
                formData.twoFactor || null
            );

            if (response.needsTwoFactor) {
                markTwoFactorRequired(formData.email, formData.password);
                return;
            }

            if (response.success && response.data?.email) {
                resetAutoTwoFactorState();
                setUser(response.data);
                navigate('/');
            }
        } catch (error) {
            console.error('登录失败:', error.message);

            if (error.needsTwoFactor) {
                markTwoFactorRequired(formData.email, formData.password);
            } else {
                setError(resolveClientErrorMessage(error));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBackToHome = () => {
        navigate('/');
    };

    const handleLogout = async () => {
        try {
            const result = await Swal.fire({
                title: t('ui.confirmRevokeLogin'),
                text: t('ui.confirmRevokeAppleId'),
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
                        title: t('ui.logoutSuccess'),
                        timer: 1500,
                        toast: true,
                        position: 'top',
                        showConfirmButton: false,
                    });
                } catch (error) {
                    if (isRateLimitError(error)) return;
                    Swal.fire({
                        icon: 'error',
                        title: t('ui.logoutFailed'),
                        text: resolveClientErrorMessage(error),
                        confirmButtonText: t('ui.confirm')
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
                height: '100%',
                ...hideScrollbarSx,
            }}
        >
            <Stack
                direction="column"
                spacing={2}
                className="safe-area-above-fixed-footer safe-area-x"
                sx={{
                    minHeight: '100%',
                    py: 2,
                    pt: 6,
                    '--fixed-footer-height': '80px',
                    '--safe-area-pad-x': '16px',
                }}
                alignItems="center"
                justifyContent="flex-start"
            >
                {isAuthenticated ?
                    <Card sx={{ width: '100%', maxWidth: 400 }}>
                        <CardContent>
                            <h1>{t('ui.appleIdLoggedIn')}</h1>
                            <Typography level="body-lg" sx={{ color: 'text.secondary' }}>{user.name}</Typography>
                            <Typography level="body-md" sx={{ color: 'text.secondary' }}>{user.email}</Typography>
                            <Divider sx={{ my: 2 }} />
                            <Button variant="outlined" color="danger" size="lg" onClick={handleLogout}>
                                {t('ui.revokeLogin')}
                            </Button>
                        </CardContent>
                    </Card>
                    :
                    <Card
                        component={motion.div}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: motionDuration, ease: EASE_OUT }}
                        sx={{ width: '100%', maxWidth: 400, mt: 2 }}
                    >
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
                                    {t('ui.appleIdLogin')}
                                </Typography>
                                <Box sx={{ width: 32 }} /> {/* 占位符保持居中 */}
                            </Stack>

                            <AnimatePresence initial={false}>
                                {needsTwoFactor && (
                                    <Box
                                        component={motion.div}
                                        key="two-factor-alert"
                                        variants={collapseVariants}
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        sx={{ overflow: 'hidden', mb: 2 }}
                                    >
                                        <Alert color="primary" variant="soft">
                                            <Typography level="body-sm" sx={{ mb: twoFactorAutoPrompted ? 0.5 : 0 }}>
                                                {t('ui.twoFactorHint')}
                                            </Typography>
                                            {twoFactorAutoPrompted && (
                                                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                                    {t('ui.twoFactorCredentialsHint')}
                                                </Typography>
                                            )}
                                        </Alert>
                                    </Box>
                                )}
                            </AnimatePresence>

                            <AnimatePresence initial={false}>
                                {error && (
                                    <Box
                                        component={motion.div}
                                        key="login-error"
                                        variants={collapseVariants}
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        sx={{ overflow: 'hidden', mb: 2 }}
                                    >
                                        <Alert color="danger">
                                            {error}
                                        </Alert>
                                    </Box>
                                )}
                            </AnimatePresence>

                            <Box
                                component={motion.form}
                                onSubmit={handleSubmit}
                                variants={formContainerVariants}
                                initial="hidden"
                                animate="show"
                            >
                                <Stack spacing={3}>
                                    <Box
                                        component={motion.div}
                                        variants={formItemVariants}
                                        sx={{ textAlign: 'center', mb: 2 }}
                                    >
                                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                            {t('ui.loginWithAppleId')}
                                        </Typography>
                                    </Box>

                                    <Box component={motion.div} variants={formItemVariants}>
                                        <FormControl>
                                            <FormLabel>{t('ui.appleId')}</FormLabel>
                                            <Input
                                                type="text"
                                                value={formData.email}
                                                onChange={(e) => handleInputChange('email', e.target.value)}
                                                placeholder={t('ui.appleIdPlaceholder')}
                                                autoComplete="username"
                                                required
                                                disabled={loading}
                                            />
                                        </FormControl>
                                    </Box>

                                    <Box component={motion.div} variants={formItemVariants}>
                                        <FormControl>
                                            <FormLabel>{t('ui.password')}</FormLabel>
                                            <Input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => handleInputChange('password', e.target.value)}
                                                placeholder={t('ui.passwordPlaceholder')}
                                                autoComplete="current-password"
                                                required
                                                disabled={loading}
                                            />
                                        </FormControl>
                                    </Box>

                                    <Box component={motion.div} variants={formItemVariants} layout={!prefersReducedMotion}>
                                        <AnimatePresence initial={false} mode="popLayout">
                                            {!showTwoFactorInput && (
                                                <Box
                                                    component={motion.div}
                                                    key="two-factor-link"
                                                    variants={collapseVariants}
                                                    initial="initial"
                                                    animate="animate"
                                                    exit="exit"
                                                    sx={{ overflow: 'hidden' }}
                                                >
                                                    <Box sx={{ textAlign: 'center' }}>
                                                        <Link
                                                            component="button"
                                                            type="button"
                                                            level="body-sm"
                                                            onClick={expandTwoFactorInput}
                                                            sx={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                                        >
                                                            {t('ui.haveTwoFactorCode')}
                                                        </Link>
                                                    </Box>
                                                </Box>
                                            )}

                                            {showTwoFactorInput && (
                                                <Box
                                                    component={motion.div}
                                                    key="two-factor-input"
                                                    variants={twoFactorExpandVariants}
                                                    initial="initial"
                                                    animate="animate"
                                                    exit="exit"
                                                    onAnimationComplete={handleTwoFactorAnimationComplete}
                                                    sx={{ overflow: 'hidden' }}
                                                >
                                                    <FormControl>
                                                        <FormLabel>{t('ui.twoFactorCode')}</FormLabel>
                                                        <Input
                                                            type="text"
                                                            value={formData.twoFactor}
                                                            onChange={(e) => handleInputChange('twoFactor', e.target.value)}
                                                            onFocus={handleTwoFactorFocus}
                                                            placeholder={t('ui.twoFactorPlaceholder')}
                                                            autoComplete="one-time-code"
                                                            tabIndex={0}
                                                            slotProps={{
                                                                input: {
                                                                    ref: twoFactorInputRef,
                                                                    inputMode: 'numeric',
                                                                    maxLength: 6
                                                                }
                                                            }}
                                                        />
                                                        <Typography level="body-xs" sx={{ mt: 1, color: 'text.secondary' }}>
                                                            {t('ui.twoFactorHint')}
                                                        </Typography>
                                                    </FormControl>
                                                </Box>
                                            )}
                                        </AnimatePresence>
                                    </Box>

                                    <Box component={motion.div} variants={formItemVariants} layout={!prefersReducedMotion}>
                                        <Button
                                            type="submit"
                                            fullWidth
                                            loading={loading}
                                            disabled={loading}
                                            size="lg"
                                        >
                                            {loading ? t('ui.loggingIn') : ((needsTwoFactor || formData.twoFactor) ? t('ui.verifyAndLogin') : t('ui.login'))}
                                        </Button>
                                    </Box>
                                </Stack>
                            </Box>

                            <Divider sx={{ my: 3 }} />
                            <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                                {t('ui.loginRequiredHint')}
                            </Typography>
                        </CardContent>
                    </Card>}

                {/* 常见问题折叠组件 */}
                {!isAuthenticated && (
                    <Card sx={{ width: '100%', maxWidth: 400, mt: 2 }}>
                        <CardContent>
                            <Accordion expanded={faqExpanded} onChange={(event, isExpanded) => setFaqExpanded(isExpanded)}>
                                <AccordionSummary
                                    expandIcon={<ExpandMore />}
                                    sx={{ px: 0 }}
                                >
                                    <Typography level="title-md" color="text.secondary">
                                        {t('ui.loginIssuesTitle')}
                                    </Typography>
                                </AccordionSummary>
                                <Box
                                    sx={{
                                        px: 0,
                                        pt: faqExpanded ? 1 : 0,
                                        maxHeight: faqExpanded ? '500px' : '0px',
                                        overflow: 'hidden',
                                        transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), padding-top 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                >
                                    <Box>
                                        <Stack gap={1} sx={{ pl: 2, py: 1 }}>
                                            <Stack direction="row" spacing={1}>
                                                <Typography level="body-xs" sx={{ fontWeight: 'md' }}>1.</Typography>
                                                <Typography level="body-xs">
                                                    {t('ui.loginIssue1')}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={1}>
                                                <Typography level="body-xs" sx={{ fontWeight: 'md' }}>2.</Typography>
                                                <Typography level="body-xs">
                                                    {t('ui.loginIssue2')}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={1}>
                                                <Typography level="body-xs" sx={{ fontWeight: 'md' }}>3.</Typography>
                                                <Typography level="body-xs">
                                                    {t('ui.loginIssue3')}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={1}>
                                                <Typography level="body-xs" sx={{ fontWeight: 'md' }}>4.</Typography>
                                                <Typography level="body-xs" component="span">
                                                    {t('ui.loginIssue4Part1')}&nbsp;
                                                    <Link href="https://github.com/ij369/ipa-harbor/blob/main/README.md#quick-start" target="_blank" rel="noopener noreferrer">
                                                        {t('ui.githubReadme')}&nbsp;
                                                    </Link>
                                                    {t('ui.loginIssue4Part2')}
                                                </Typography>
                                            </Stack>
                                        </Stack>
                                    </Box>
                                </Box>
                            </Accordion>
                        </CardContent>
                    </Card>
                )}

            </Stack>

            <Sheet
                variant="outlined"
                className="safe-area-footer"
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderTop: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.surface',
                    zIndex: 1,
                }}
            >
                <Stack
                    direction="row"
                    justifyContent="center"
                    alignItems="center"
                    spacing={1}
                    sx={{ width: '100%', px: 2 }}
                >
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        IPA Harbor{appVersion ? ` v${appVersion}` : ''}
                    </Typography>
                    <Typography
                        level="body-xs"
                        component="button"
                        type="button"
                        disabled={checkingUpdate}
                        onClick={handleCheckUpdate}
                        sx={{
                            fontSize: '0.625rem',
                            fontWeight: 'normal',
                            background: 'none',
                            border: 'none',
                            p: 0,
                            color: 'primary.500',
                            cursor: checkingUpdate ? 'wait' : 'pointer',
                            opacity: checkingUpdate ? 0.6 : 1,
                            ':hover': {
                                opacity: checkingUpdate ? 0.6 : 0.8,
                            },
                            transition: 'opacity 0.2s ease-in-out',
                        }}
                    >
                        {checkingUpdate ? t('ui.checkingUpdates') : t('ui.checkForUpdates')}
                    </Typography>
                </Stack>
            </Sheet>
        </Box>
    );
};

export default React.memo(AppleIdLogin);
