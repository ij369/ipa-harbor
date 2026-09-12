import React, { useEffect, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionGroup,
    AccordionSummary,
    Avatar,
    Box,
    Button,
    Chip,
    FormControl,
    FormLabel,
    IconButton,
    Input,
    Sheet,
    Stack,
    Switch,
    Tooltip,
    Typography,
    Alert,
} from '@mui/joy';
import {
    AdminPanelSettings as AdminPanelSettingsIcon,
    Check,
    ExitToApp,
    ExpandMore,
    InfoOutlined,
    Logout,
    SystemUpdateAlt,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';
import AdminChangePassword from '../components/AdminChangePassword';
import PasskeyManager from '../components/PasskeyManager';
import AddToHomeScreenGuide from '../components/AddToHomeScreenGuide';
import Dialog from '../components/Dialog';
import FilenameTemplateEditor from '../components/FilenameTemplateEditor';
import { useJoyDown } from '../hooks/useJoyMedia';
import { useAppSession } from '../contexts/AppContext';
import { useAdmin } from '../contexts/AdminContext';
import { updateAdminSettings, isRateLimitError, checkAppUpdate, revokeAuth, resolveClientErrorMessage } from '../utils/api';
import {
    cloneTemplate,
    DEFAULT_DOWNLOAD_FILENAME_TEMPLATE,
    normalizeTemplate,
    templateHasVariable,
} from '../utils/filenameTemplate';
import { normalizeLanguageCode } from '../i18n';
import { isOtaSecureContext, useOtaInstallPreference } from '../utils/otaInstallPreference';
import { useLoadAppScreenshotsPreference } from '../utils/appScreenshotsPreference';
import Swal from 'sweetalert2';

const scrollSx = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    pr: 3,
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(var(--joy-palette-neutral-500Channel, 99 107 116) / 0.55) transparent',
    scrollbarGutter: 'stable',
    '&::-webkit-scrollbar': {
        width: 8,
    },
    '&::-webkit-scrollbar-thumb': {
        borderRadius: '999px',
        bgcolor: 'rgba(var(--joy-palette-neutral-500Channel, 99 107 116) / 0.45)',
    },
    '&::-webkit-scrollbar-thumb:hover': {
        bgcolor: 'rgba(var(--joy-palette-neutral-500Channel, 99 107 116) / 0.65)',
    },
};

const sectionSx = {
    p: 2,
    borderRadius: 'md',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const settingsInfoTooltipSlotProps = {
    root: {
        sx: {
            maxWidth: 260,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
        },
    },
};

// 清除 Joy 默认 content padding，避免折叠占位；展开间距由内部 Stack 按状态控制
const accountAccordionDetailsSx = {
    px: 0,
    marginInline: 0,
    '& .MuiAccordionDetails-content': {
        p: 0,
        minHeight: 0,
    },
};

const HARBOR_GITHUB_URL = 'https://github.com/ij369/ipa-harbor';
const HARBOR_LOCALE_EN_JSON_URL = `${HARBOR_GITHUB_URL}/blob/main/client/locales/en.json`;
const HARBOR_DOCKER_HUB_URL = 'https://hub.docker.com/r/uuphy/ipa-harbor/tags';
const SWAL_GITHUB_ICON_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;margin-right:6px" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"/></svg>';

const tablerIconSx = {
    width: 20,
    height: 20,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
};

function TablerGitHubIcon({ sx }) {
    return (
        <Box
            component="svg"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden
            sx={{ ...tablerIconSx, ...sx }}
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
        </Box>
    );
}

function TablerDockerIcon({ sx }) {
    return (
        <Box
            component="svg"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden
            sx={{ ...tablerIconSx, ...sx }}
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M22 12.54c-1.804 -.345 -2.701 -1.08 -3.523 -2.94c-.487 .696 -1.102 1.568 -.92 2.4c.028 .238 -.32 1 -.557 1h-14c0 5.208 3.164 7 6.196 7c4.124 .022 7.828 -1.376 9.854 -5c1.146 -.101 2.296 -1.505 2.95 -2.46" />
            <path d="M5 10h3v3h-3l0 -3" />
            <path d="M8 10h3v3h-3l0 -3" />
            <path d="M11 10h3v3h-3l0 -3" />
            <path d="M8 7h3v3h-3l0 -3" />
            <path d="M11 7h3v3h-3l0 -3" />
            <path d="M11 4h3v3h-3l0 -3" />
            <path d="M4.571 18c1.5 0 2.047 -.074 2.958 -.78" />
            <path d="M10 16l0 .01" />
        </Box>
    );
}

function Settings() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { user, isAuthenticated, loading, logout, settings, setSettings, settingsLoaded } = useAppSession();
    const {
        updateAppSettings,
        user: adminUser,
        logout: adminLogout,
        getFormattedExpiresAt,
        isExpiringSoon,
        appVersion: harborAppVersion,
    } = useAdmin();
    const [language, setLanguage] = useState(normalizeLanguageCode(i18n.language));
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [appleIdLogoutLoading, setAppleIdLogoutLoading] = useState(false);
    const [adminAccountExpanded, setAdminAccountExpanded] = useState(false);
    const [appleIdExpanded, setAppleIdExpanded] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [otaInstallEnabled, setOtaInstallEnabled] = useOtaInstallPreference();
    const [loadAppScreenshotsEnabled, setLoadAppScreenshotsEnabled] = useLoadAppScreenshotsPreference();
    const otaSecureContext = isOtaSecureContext();
    const otaInstallInfoTooltip = !otaSecureContext
        ? `${t('ui.enableOtaInstallHint')}\n${t('ui.enableOtaInstallInsecureContext')}`
        : t('ui.enableOtaInstallHint');

    const handleOtaInstallInfoClick = () => {
        const hintHtml = `<p style="margin:0 0 12px;white-space:pre-line">${t('ui.enableOtaInstallHint')}</p>`;
        const insecureHtml = !otaSecureContext
            ? `<p style="margin:0;color:var(--joy-palette-warning-500,#ed6c02)">${t('ui.enableOtaInstallInsecureContext')}</p>`
            : '';

        Swal.fire({
            icon: !otaSecureContext ? 'warning' : 'info',
            title: t('ui.enableOtaInstall'),
            html: `${hintHtml}${insecureHtml}`,
            confirmButtonText: t('ui.confirm'),
        });
    };

    const handleLanguageLocalizationInfoClick = () => {
        const githubButtonText = t('ui.languageLocalizationGithub');

        Swal.fire({
            icon: 'info',
            title: t('ui.languageLocalizationTitle'),
            html: `<p style="margin:0">${t('ui.languageLocalizationDescription')}</p>`,
            showCancelButton: true,
            confirmButtonText: githubButtonText,
            cancelButtonText: t('ui.close'),
            didOpen: () => {
                const confirmButton = Swal.getConfirmButton();
                if (confirmButton) {
                    confirmButton.innerHTML = `${SWAL_GITHUB_ICON_HTML}${githubButtonText}`;
                }
            },
        }).then((result) => {
            if (result.isConfirmed) {
                window.open(HARBOR_LOCALE_EN_JSON_URL, '_blank', 'noopener,noreferrer');
            }
        });
    };

    const [downloadFileNameTemplate, setDownloadFileNameTemplate] = useState(
        cloneTemplate(DEFAULT_DOWNLOAD_FILENAME_TEMPLATE)
    );
    const [showVersionMetadataRefresh, setShowVersionMetadataRefresh] = useState(false);
    const [versionMetadataRefreshSaving, setVersionMetadataRefreshSaving] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [filenameDialogOpen, setFilenameDialogOpen] = useState(false);
    const belowMd = useJoyDown('md');

    useEffect(() => {
        if (!settingsLoaded) {
            return;
        }

        setDownloadFileNameTemplate(cloneTemplate(settings.downloadFileNameTemplate));
        setShowVersionMetadataRefresh(settings.showVersionMetadataRefresh === true);
        setDirty(false);
    }, [settings, settingsLoaded]);

    useEffect(() => {
        if (harborAppVersion) {
            setAppVersion(harborAppVersion);
        }
    }, [harborAppVersion]);

    const markDirty = () => setDirty(true);

    const handleLanguageChange = (lng) => {
        setLanguage(lng);
        i18n.changeLanguage(lng);
        localStorage.setItem('language', lng);
    };

    const handleResetTemplate = () => {
        setDownloadFileNameTemplate(cloneTemplate(DEFAULT_DOWNLOAD_FILENAME_TEMPLATE));
        markDirty();
    };

    const handleShowVersionMetadataRefreshChange = async (checked) => {
        setShowVersionMetadataRefresh(checked);
        setVersionMetadataRefreshSaving(true);

        try {
            const response = await updateAdminSettings({ showVersionMetadataRefresh: checked });

            if (response.success && response.data?.settings) {
                setSettings(response.data.settings);
                updateAppSettings(response.data.settings);
            }
        } catch (error) {
            setShowVersionMetadataRefresh(!checked);

            if (isRateLimitError(error)) {
                return;
            }

            Swal.fire({
                icon: 'error',
                title: t('ui.settingsSaveFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setVersionMetadataRefreshSaving(false);
        }
    };

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

    const handleAdminLogout = async () => {
        setLogoutLoading(true);

        try {
            await adminLogout();
            navigate('/login');
        } catch (error) {
            console.error('退出系统失败:', error);
        } finally {
            setLogoutLoading(false);
        }
    };

    const handleAppleIdLogout = async () => {
        const result = await Swal.fire({
            title: t('ui.confirmRevokeLogin'),
            text: t('ui.confirmRevokeAppleId'),
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: t('ui.confirm'),
            cancelButtonText: t('ui.cancel'),
        });

        if (!result.isConfirmed) {
            return;
        }

        setAppleIdLogoutLoading(true);

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
            if (isRateLimitError(error)) {
                return;
            }

            Swal.fire({
                icon: 'error',
                title: t('ui.logoutFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
            logout();
        } finally {
            setAppleIdLogoutLoading(false);
        }
    };

    const handleSave = async () => {
        if (!templateHasVariable(downloadFileNameTemplate)) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.filenameNeedVariable'),
                confirmButtonText: t('ui.confirm'),
            });
            return;
        }

        setSaving(true);

        try {
            const payload = {
                downloadFileNameTemplate: normalizeTemplate(downloadFileNameTemplate),
            };

            const response = await updateAdminSettings(payload);

            if (response.success && response.data?.settings) {
                setSettings(response.data.settings);
                updateAppSettings(response.data.settings);
                setDirty(false);
                setFilenameDialogOpen(false);

                Swal.fire({
                    icon: 'success',
                    title: t('ui.settingsSaved'),
                    timer: 1500,
                    toast: true,
                    position: 'top',
                    showConfirmButton: false,
                });
            }
        } catch (error) {
            if (isRateLimitError(error)) {
                return;
            }

            Swal.fire({
                icon: 'error',
                title: t('ui.settingsSaveFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setSaving(false);
        }
    };

    const renderFilenameTemplateActions = (fullWidth = false) => (
        <Stack direction="row" gap={1} sx={{ flexShrink: 0, ...(fullWidth && { width: '100%' }) }}>
            <Button
                size="sm"
                variant="outlined"
                color="neutral"
                onClick={handleResetTemplate}
                sx={fullWidth ? { flex: 1 } : undefined}
            >
                {t('ui.resetToDefault')}
            </Button>
            <Button
                size="sm"
                loading={saving}
                disabled={saving || !dirty}
                onClick={handleSave}
                startDecorator={<Check />}
                sx={fullWidth ? { flex: 1 } : undefined}
            >
                {t('ui.save')}
            </Button>
        </Stack>
    );

    return (
        <Box
            sx={{
                flex: 1,
                minHeight: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                width: (theme) => `calc(100% + ${theme.spacing(3)})`,
                mr: -3,
                overflow: 'hidden',
            }}
        >
            <Box className="safe-area-scroll-bottom app-shell-page-scroll" sx={scrollSx}>
                <Box component="header" sx={{ pt: 3, flexShrink: 0 }}>
                    <Typography level="h2" className="app-shell-page-title" sx={{ mb: 3, flexShrink: 0 }}>
                        {t('ui.settings')}
                    </Typography>
                </Box>

                <Stack gap={3} sx={{ pb: 3 }}>
                    <Sheet variant="outlined" sx={sectionSx}>
                        <Typography level="title-md" sx={{ mb: 2 }}>
                            {t('ui.systemInfo')}
                        </Typography>

                        <Stack gap={0}>
                            <AccordionGroup
                                size="sm"
                                // disableDivider
                                transition="0.25s ease"
                                sx={{
                                    '--AccordionGroup-gap': '0px',
                                    '--ListItem-paddingY': '2px',
                                    '--ListItem-minHeight': '2rem',
                                    '& .MuiAccordion-root': {
                                        bgcolor: 'transparent',
                                        '&::before': { display: 'none' },
                                    },
                                    '& .MuiAccordion-root:not([data-last-child])': {
                                        pb: 1.25,
                                        borderBottom: '1px solid rgba(var(--joy-palette-neutral-500Channel, 99 107 116) / 0.2)',
                                    },
                                    '& .MuiAccordion-root:not([data-first-child])': {
                                        pt: 1.25,
                                    },
                                    '& .MuiAccordionDetails-root': {
                                        marginInline: 0,
                                    },
                                }}
                            >
                                <Accordion
                                    expanded={adminAccountExpanded}
                                    onChange={(_, expanded) => setAdminAccountExpanded(expanded)}
                                >
                                    <AccordionSummary
                                        indicator={<ExpandMore />}
                                        sx={{ px: 0, minHeight: 'unset', '& .MuiAccordionSummary-button': { py: 0.375, minHeight: 32 } }}
                                    >
                                        <Stack
                                            direction="row"
                                            alignItems="center"
                                            justifyContent="space-between"
                                            gap={1}
                                            sx={{ width: '100%', minWidth: 0, pr: 0.5 }}
                                        >
                                            <Typography level="body-sm" fontWeight="md">
                                                {t('ui.adminAccount')}
                                            </Typography>
                                            {!adminAccountExpanded && adminUser?.username && (
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }} noWrap>
                                                    {adminUser.username}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </AccordionSummary>
                                    <AccordionDetails sx={accountAccordionDetailsSx}>
                                        <Stack
                                            direction={{ xs: 'column', sm: 'row' }}
                                            justifyContent="space-between"
                                            alignItems={{ xs: 'stretch', sm: 'center' }}
                                            gap={1.25}
                                            sx={{
                                                minHeight: 0,
                                                pt: adminAccountExpanded ? 0.75 : 0,
                                                pb: adminAccountExpanded ? 1.25 : 0,
                                                transition: 'padding 0.25s ease',
                                            }}
                                        >
                                            {adminUser && (
                                                <Stack
                                                    direction="row"
                                                    spacing={1}
                                                    alignItems="center"
                                                    sx={{ flex: 1, minWidth: 0 }}
                                                >
                                                    <Avatar
                                                        variant="soft"
                                                        color="neutral"
                                                        size="sm"
                                                        sx={{
                                                            flexShrink: 0,
                                                            '--Avatar-size': '28px',
                                                        }}
                                                    >
                                                        <AdminPanelSettingsIcon sx={{ fontSize: 18 }} />
                                                    </Avatar>
                                                    <Stack spacing={0} sx={{ flex: 1, minWidth: 0 }}>
                                                        <Typography level="body-sm" fontWeight="md" noWrap sx={{ lineHeight: 1.4 }}>
                                                            {adminUser.username}
                                                        </Typography>
                                                        <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.125 }}>
                                                            <Typography level="body-xs" sx={{ color: 'text.tertiary', lineHeight: 1.3 }}>
                                                                {t('ui.expiryTime')}: {getFormattedExpiresAt()}
                                                            </Typography>
                                                            {isExpiringSoon() && (
                                                                <Chip color="warning" size="sm">
                                                                    {t('ui.expiringSoon')}
                                                                </Chip>
                                                            )}
                                                        </Stack>
                                                    </Stack>
                                                    <Stack
                                                        direction="row"
                                                        spacing={0.5}
                                                        alignItems="center"
                                                        sx={{ flexShrink: 0, ml: 'auto' }}
                                                    >
                                                        <PasskeyManager />
                                                        <AdminChangePassword />
                                                    </Stack>
                                                </Stack>
                                            )}
                                            <Button
                                                color="danger"
                                                variant="outlined"
                                                size="sm"
                                                loading={logoutLoading}
                                                disabled={logoutLoading}
                                                onClick={handleAdminLogout}
                                                startDecorator={<ExitToApp />}
                                                sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                                            >
                                                {logoutLoading ? t('ui.loggingOut') : t('ui.logoutSystem')}
                                            </Button>
                                        </Stack>
                                    </AccordionDetails>
                                </Accordion>

                                <Accordion
                                    expanded={appleIdExpanded}
                                    onChange={(_, expanded) => setAppleIdExpanded(expanded)}
                                >
                                    <AccordionSummary
                                        indicator={<ExpandMore />}
                                        sx={{ px: 0, minHeight: 'unset', '& .MuiAccordionSummary-button': { py: 0.375, minHeight: 32 } }}
                                    >
                                        <Stack
                                            direction="row"
                                            alignItems="center"
                                            justifyContent="space-between"
                                            gap={1}
                                            sx={{ width: '100%', minWidth: 0, pr: 0.5 }}
                                        >
                                            <Typography level="body-sm" fontWeight="md">
                                                {t('ui.appleId')}
                                            </Typography>
                                            {!appleIdExpanded && (
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }} noWrap>
                                                    {loading
                                                        ? t('ui.loading')
                                                        : !isAuthenticated || !user
                                                            ? t('ui.needAppleIdLogin')
                                                            : (user.name || user.email || t('ui.unknownUser'))}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </AccordionSummary>
                                    <AccordionDetails sx={accountAccordionDetailsSx}>
                                        <Stack
                                            direction={{ xs: 'column', sm: 'row' }}
                                            justifyContent="space-between"
                                            alignItems={{ xs: 'stretch', sm: 'center' }}
                                            gap={1.25}
                                            sx={{
                                                minHeight: 0,
                                                pt: appleIdExpanded ? 0.75 : 0,
                                                pb: appleIdExpanded ? 1.25 : 0,
                                                transition: 'padding 0.25s ease',
                                            }}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                {loading ? (
                                                    <Typography level="body-xs" sx={{ lineHeight: 1.4 }}>
                                                        {t('ui.loading')}
                                                    </Typography>
                                                ) : !isAuthenticated || !user ? (
                                                    <Typography level="body-xs" sx={{ color: 'text.tertiary', lineHeight: 1.4 }}>
                                                        {t('ui.needAppleIdLogin')}
                                                    </Typography>
                                                ) : (
                                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                                        <Avatar
                                                            variant="soft"
                                                            color="neutral"
                                                            size="sm"
                                                            sx={{
                                                                flexShrink: 0,
                                                                '--Avatar-size': '28px',
                                                            }}
                                                        >
                                                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                                                        </Avatar>
                                                        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                                            <Typography level="body-sm" fontWeight="md" noWrap sx={{ lineHeight: 1.4 }}>
                                                                {user.name || t('ui.unknownUser')}
                                                            </Typography>
                                                            <Typography level="body-xs" sx={{ color: 'text.tertiary', lineHeight: 1.4 }} noWrap>
                                                                {user.email || t('ui.unknownEmail')}
                                                            </Typography>
                                                        </Stack>
                                                    </Stack>
                                                )}
                                            </Box>
                                            {!loading && (
                                                isAuthenticated && user ? (
                                                    <Button
                                                        color="danger"
                                                        variant="outlined"
                                                        size="sm"
                                                        loading={appleIdLogoutLoading}
                                                        disabled={appleIdLogoutLoading}
                                                        onClick={handleAppleIdLogout}
                                                        startDecorator={<Logout />}
                                                        sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                                                    >
                                                        {appleIdLogoutLoading ? t('ui.loggingOut') : t('ui.revokeLogin')}
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="outlined"
                                                        size="sm"
                                                        onClick={() => navigate('/apple-id')}
                                                        sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                                                    >
                                                        {t('ui.appleIdLogin')}
                                                    </Button>
                                                )
                                            )}
                                        </Stack>
                                    </AccordionDetails>
                                </Accordion>
                            </AccordionGroup>

                            <Box
                                sx={{
                                    mt: 1.25,
                                    pt: 1.25,
                                    borderTop: '1px solid',
                                    borderColor: 'rgba(var(--joy-palette-neutral-500Channel, 99 107 116) / 0.2)',
                                }}
                            >
                                <Stack
                                    direction={{ xs: 'column', sm: 'row' }}
                                    justifyContent="space-between"
                                    alignItems={{ xs: 'stretch', sm: 'center' }}
                                    gap={1.5}
                                >
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="center"
                                        sx={{ flex: 1, minWidth: 0, width: '100%' }}
                                    >
                                        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                            <Typography level="body-sm" sx={{ fontWeight: 'md' }}>
                                                IPA Harbor
                                            </Typography>
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                {t('ui.currentVersion')}：{appVersion ? `v${appVersion}` : '—'}
                                            </Typography>
                                        </Stack>

                                        <Stack direction="row" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }}>
                                            <IconButton
                                                component="a"
                                                href={HARBOR_GITHUB_URL}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                variant="plain"
                                                color="neutral"
                                                size="sm"
                                                aria-label={t('ui.harborGithub')}
                                            >
                                                <TablerGitHubIcon />
                                            </IconButton>
                                            <IconButton
                                                component="a"
                                                href={HARBOR_DOCKER_HUB_URL}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                variant="plain"
                                                color="neutral"
                                                size="sm"
                                                aria-label={t('ui.viewDockerTags')}
                                            >
                                                <TablerDockerIcon />
                                            </IconButton>
                                        </Stack>
                                    </Stack>
                                    <Button
                                        variant="outlined"
                                        color="neutral"
                                        size="sm"
                                        loading={checkingUpdate}
                                        disabled={checkingUpdate}
                                        onClick={handleCheckUpdate}
                                        startDecorator={<SystemUpdateAlt />}
                                        sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                                    >
                                        {checkingUpdate ? t('ui.checkingUpdates') : t('ui.checkForUpdates')}
                                    </Button>
                                </Stack>
                            </Box>
                        </Stack>
                    </Sheet>

                    <Sheet variant="outlined" sx={sectionSx}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            gap={1.5}
                        >
                            <Stack direction="row" alignItems="center" gap={0.5}>
                                <Typography level="title-md">
                                    {t('ui.languageSettings')}
                                </Typography>
                                <Tooltip
                                    title={t('ui.languageLocalizationHint')}
                                    variant="outlined"
                                    placement="top"
                                    arrow
                                    slotProps={settingsInfoTooltipSlotProps}
                                >
                                    <IconButton
                                        variant="plain"
                                        color="neutral"
                                        size="sm"
                                        aria-label={t('ui.languageLocalizationHint')}
                                        onClick={handleLanguageLocalizationInfoClick}
                                        sx={{ '--IconButton-size': '24px', minWidth: 24, minHeight: 24 }}
                                    >
                                        <InfoOutlined sx={{ fontSize: 18 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <LanguageSwitcher
                                variant="select"
                                value={language}
                                onChange={handleLanguageChange}
                            />
                        </Stack>
                    </Sheet>

                    <Sheet variant="outlined" sx={sectionSx}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            gap={1.5}
                        >
                            <Stack direction="row" alignItems="center" gap={0.5}>
                                <Typography level="title-md">
                                    {t('ui.enableOtaInstall')}
                                </Typography>
                                <Tooltip
                                    title={otaInstallInfoTooltip}
                                    variant="outlined"
                                    color={otaSecureContext ? 'primary' : 'warning'}
                                    placement="top"
                                    arrow
                                    slotProps={settingsInfoTooltipSlotProps}
                                >
                                    <IconButton
                                        variant="plain"
                                        color={otaSecureContext ? 'neutral' : 'warning'}
                                        size="sm"
                                        aria-label={otaInstallInfoTooltip}
                                        onClick={handleOtaInstallInfoClick}
                                        sx={{ '--IconButton-size': '24px', minWidth: 24, minHeight: 24 }}
                                    >
                                        <InfoOutlined sx={{ fontSize: 18 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <Switch
                                checked={otaInstallEnabled}
                                onChange={(event) => setOtaInstallEnabled(event.target.checked)}
                            />
                        </Stack>
                    </Sheet>

                    <Sheet variant="outlined" sx={sectionSx}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            gap={1.5}
                            sx={{ mb: 1.5 }}
                        >
                            <Typography level="title-md">
                                {t('ui.downloadFileNameSettings')}
                            </Typography>
                            {belowMd ? (
                                <Button
                                    size="sm"
                                    variant="outlined"
                                    color={dirty ? 'primary' : 'neutral'}
                                    onClick={() => setFilenameDialogOpen(true)}
                                >
                                    {t('ui.editFilenameTemplate')}
                                </Button>
                            ) : (
                                renderFilenameTemplateActions()
                            )}
                        </Stack>

                        <FilenameTemplateEditor
                            value={downloadFileNameTemplate}
                            previewOnly={belowMd}
                            onChange={(nextValue) => {
                                setDownloadFileNameTemplate(nextValue);
                                markDirty();
                            }}
                        />
                    </Sheet>

                    <Dialog
                        isOpen={belowMd && filenameDialogOpen}
                        onClose={() => setFilenameDialogOpen(false)}
                        title={t('ui.downloadFileNameSettings')}
                        size="large"
                        fillBody
                        actions={renderFilenameTemplateActions(true)}
                    >
                        <FilenameTemplateEditor
                            value={downloadFileNameTemplate}
                            onChange={(nextValue) => {
                                setDownloadFileNameTemplate(nextValue);
                                markDirty();
                            }}
                        />
                    </Dialog>

                    <Sheet variant="outlined" sx={sectionSx}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            gap={1.5}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography level="title-md">
                                    {t('ui.showVersionMetadataRefresh')}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                                    {t('ui.showVersionMetadataRefreshHint')}
                                </Typography>
                            </Box>
                            <Switch
                                checked={showVersionMetadataRefresh}
                                disabled={versionMetadataRefreshSaving}
                                onChange={(event) => handleShowVersionMetadataRefreshChange(event.target.checked)}
                            />
                        </Stack>
                    </Sheet>

                    <Sheet variant="outlined" sx={sectionSx}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            gap={1.5}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography level="title-md">
                                    {t('ui.loadAppScreenshots')}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                                    {t('ui.loadAppScreenshotsHint')}
                                </Typography>
                            </Box>
                            <Switch
                                checked={loadAppScreenshotsEnabled}
                                onChange={(event) => setLoadAppScreenshotsEnabled(event.target.checked)}
                            />
                        </Stack>
                    </Sheet>

                    <AddToHomeScreenGuide />
                </Stack>
            </Box>
        </Box>
    );
}

export default React.memo(Settings);
