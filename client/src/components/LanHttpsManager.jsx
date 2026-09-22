import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    FormControl,
    FormLabel,
    IconButton,
    Input,
    Sheet,
    Stack,
    ToggleButtonGroup,
    Typography,
} from '@mui/joy';
import {
    ContentCopy,
    Download,
    Refresh,
    Save,
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import Swal from 'sweetalert2';
import Dialog from './Dialog';
import { AddToHomeScreenGuideDialog } from './AddToHomeScreenGuide';
import { normalizeLanguageCode } from '../i18n';
import {
    downloadLanCaCert,
    getLanHttpsStatus,
    renewLanHttpsCert,
    updateLanHttpsConfig,
    resolveLanCaInstallHttpPort,
    resolveQuickDeployHttpsPortFromBrowser,
    resolveClientErrorMessage,
    isRateLimitError,
} from '../utils/api';
import { formatLanUrl } from '../utils/quickDeployPorts';

const sectionSx = {
    p: 2,
    borderRadius: 'md',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const QR_SIZE = 168;

function LanHttpsManager() {
    const { t, i18n } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [renewing, setRenewing] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [status, setStatus] = useState(null);
    const [lanHostname, setLanHostname] = useState('');
    const [lanIp, setLanIp] = useState('');
    const [advancedMode, setAdvancedMode] = useState(false);
    const [addToHomeGuideOpen, setAddToHomeGuideOpen] = useState(false);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getLanHttpsStatus();
            const data = response.data || {};
            setEnabled(Boolean(data.enableAutoCert));
            setStatus(data);
            setLanHostname(data.lanHostname || '');
            setLanIp(data.lanIp || '');
        } catch (error) {
            if (!isRateLimitError(error)) {
                console.error('加载局域网 HTTPS 状态失败:', error);
            }
            setEnabled(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const handleOpen = () => {
        setOpen(true);
        loadStatus();
    };

    const handleClose = () => {
        setOpen(false);
        setAdvancedMode(false);
    };

    const handleModeChange = (_event, value) => {
        if (value) {
            setAdvancedMode(value === 'advanced');
        }
    };

    const caInstallHttpPort = useMemo(() => resolveLanCaInstallHttpPort({
        allowLanAccess: status?.allowLanAccess,
        serverHttpPort: status?.httpPort,
    }), [status?.allowLanAccess, status?.httpPort]);

    const resolvedHttpsPort = useMemo(() => {
        if (status?.allowLanAccess) {
            const quickHttpsPort = resolveQuickDeployHttpsPortFromBrowser();
            if (quickHttpsPort != null) {
                return quickHttpsPort;
            }
        }
        if (status?.httpsPort != null) {
            return Number(status.httpsPort);
        }
        return null;
    }, [status?.allowLanAccess, status?.httpsPort]);

    const caInstallUrl = useMemo(() => {
        if (!lanIp || caInstallHttpPort == null) {
            return '';
        }
        return `${formatLanUrl('http', lanIp, caInstallHttpPort)}/lan-ca`;
    }, [lanIp, caInstallHttpPort]);

    const lanHelpUrl = useMemo(() => {
        if (!lanIp || resolvedHttpsPort == null) {
            return '';
        }
        return formatLanUrl('https', lanIp, resolvedHttpsPort);
    }, [lanIp, resolvedHttpsPort]);

    const lanHostnameHelpUrl = useMemo(() => {
        if (!lanHostname || lanHostname === 'localhost' || resolvedHttpsPort == null) {
            return '';
        }
        return formatLanUrl('https', lanHostname, resolvedHttpsPort);
    }, [lanHostname, resolvedHttpsPort]);

    const mdnsExampleHostnameUrl = useMemo(() => {
        if (resolvedHttpsPort == null) {
            return '';
        }
        return formatLanUrl('https', 'Johns-MacBook-Air.local', resolvedHttpsPort);
    }, [resolvedHttpsPort]);

    const handleCopy = async (text) => {
        if (!text) {
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            Swal.fire({
                icon: 'success',
                title: t('ui.lanHttpsCopied'),
                timer: 1200,
                toast: true,
                position: 'top',
                showConfirmButton: false,
            });
        } catch {
            Swal.fire({
                icon: 'error',
                title: t('ui.lanHttpsCopyFailed'),
                confirmButtonText: t('ui.confirm'),
            });
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await updateLanHttpsConfig({
                lanHostname,
                lanIp,
            });
            const data = response.data || {};
            setStatus(data);
            setLanHostname(data.lanHostname || '');
            setLanIp(data.lanIp || '');
            Swal.fire({
                icon: 'success',
                title: t('ui.lanHttpsSaveSuccess'),
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
                title: t('ui.lanHttpsSaveFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setSaving(false);
        }
    };

    const handleRenew = async () => {
        setRenewing(true);
        try {
            const response = await renewLanHttpsCert();
            setStatus(response.data || null);
            Swal.fire({
                icon: 'success',
                title: t('ui.lanHttpsRenewSuccess'),
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
                title: t('ui.lanHttpsRenewFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setRenewing(false);
        }
    };

    const handleDownloadCa = async () => {
        setDownloading(true);
        try {
            await downloadLanCaCert();
        } catch (error) {
            if (isRateLimitError(error)) {
                return;
            }
            Swal.fire({
                icon: 'error',
                title: t('ui.lanHttpsCaDownloadFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setDownloading(false);
        }
    };

    if (loading && !open) {
        return null;
    }

    if (!enabled) {
        return null;
    }

    const certInfo = status?.certInfo;
    const isConfigured = Boolean(status?.lanIp);
    const collapsedStatusText = isConfigured
        ? t('ui.lanInstallConfiguredSummary', {
            ip: status.lanIp,
            state: status?.httpsRunning ? t('ui.lanHttpsRunning') : t('ui.lanHttpsStopped'),
        })
        : t('ui.lanInstallNotConfigured');

    return (
        <>
            <Sheet variant="outlined" sx={sectionSx}>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    gap={1.5}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography level="title-md">
                            {t('ui.lanInstallTitle')}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                            {t('ui.lanInstallHint')}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.75 }}>
                            {collapsedStatusText}
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        color="neutral"
                        size="sm"
                        onClick={handleOpen}
                        sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                    >
                        {t('ui.lanInstallConfigure')}
                    </Button>
                </Stack>
            </Sheet>

            <Dialog
                isOpen={open}
                onClose={handleClose}
                title={t('ui.lanInstallDialogTitle')}
                size="large"
                actions={(
                    <Stack
                        direction="row"
                        gap={1}
                        sx={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                        <ToggleButtonGroup
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            value={advancedMode ? 'advanced' : 'beginner'}
                            onChange={handleModeChange}
                        >
                            <Button value="beginner">{t('ui.lanInstallModeBeginner')}</Button>
                            <Button value="advanced">{t('ui.lanInstallModeAdvanced')}</Button>
                        </ToggleButtonGroup>
                        <Stack direction="row" gap={1} sx={{ ml: 'auto' }}>
                            <Button
                                variant="outlined"
                                color="neutral"
                                size="sm"
                                onClick={() => setAddToHomeGuideOpen(true)}
                            >
                                {t('ui.addToHomeScreen')}
                            </Button>
                            <Button variant="plain" color="neutral" onClick={handleClose}>
                                {t('ui.close')}
                            </Button>
                        </Stack>
                    </Stack>
                )}
            >
                <Stack gap={2.5}>
                    <Stack gap={1.5}>

                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                            {t('ui.lanInstallHostSectionHint')}
                        </Typography>

                        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                            <FormControl required sx={{ flex: 1 }}>
                                <FormLabel>{t('ui.lanHttpsIp')}</FormLabel>
                                <Input
                                    value={lanIp}
                                    onChange={(event) => setLanIp(event.target.value)}
                                    placeholder="192.168.1.101"
                                />
                            </FormControl>
                            {advancedMode && (
                                <FormControl sx={{ flex: 1 }}>
                                    <FormLabel>{t('ui.lanInstallHostnameOptional')}</FormLabel>
                                    <Input
                                        value={lanHostname}
                                        onChange={(event) => setLanHostname(event.target.value)}
                                        placeholder="localhost"
                                    />
                                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5, ml: 0.5 }}>{t('ui.lanHttpsHostnameHint')}</Typography>
                                </FormControl>
                            )}
                        </Stack>

                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            gap={1}
                            flexWrap="wrap"
                            alignItems={{ xs: 'stretch', sm: 'center' }}
                        >
                            <Button
                                size="sm"
                                loading={saving}
                                disabled={saving || !lanIp.trim()}
                                onClick={handleSave}
                                startDecorator={<Save />}
                                sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                            >
                                {t('ui.lanHttpsSaveAndGenerateCert')}
                            </Button>
                            {advancedMode && (
                                <Stack direction="row" gap={1} sx={{ ml: 'auto' }}>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        color="neutral"
                                        loading={renewing}
                                        disabled={renewing || !status?.serverCertReady}
                                        onClick={handleRenew}
                                        startDecorator={<Refresh />}
                                    >
                                        {t('ui.lanHttpsRenewCert')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        color="neutral"
                                        loading={downloading}
                                        disabled={downloading || !status?.caReady}
                                        onClick={handleDownloadCa}
                                        startDecorator={<Download />}
                                    >
                                        {t('ui.lanHttpsDownloadCa')}
                                    </Button>
                                </Stack>
                            )}
                        </Stack>
                    </Stack>

                    {!isConfigured && (
                        <Alert color="warning" variant="soft">
                            {t('ui.lanHttpsLanIpRequired')}
                        </Alert>
                    )}

                    {isConfigured && (
                        <Stack gap={2}>
                            <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
                                <Chip size="sm" variant="soft" color={status?.httpsRunning ? 'success' : 'neutral'}>
                                    {status?.httpsRunning ? t('ui.lanHttpsRunning') : t('ui.lanHttpsStopped')}
                                </Chip>
                                {advancedMode && certInfo && (
                                    <><Divider orientation="vertical" />
                                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                            {t('ui.lanHttpsCertExpiry', {
                                                date: certInfo.validTo,
                                                days: certInfo.daysRemaining,
                                            })}
                                        </Typography>
                                    </>
                                )}
                                {advancedMode && status?.needsRenew && (
                                    <Chip size="sm" color="warning" variant="soft">
                                        {t('ui.lanHttpsNeedsRenew')}
                                    </Chip>
                                )}
                            </Stack>

                            {advancedMode && status?.caFingerprint && (
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', wordBreak: 'break-all' }}>
                                    {t('ui.lanHttpsCaFingerprint')}: {status.caFingerprint}
                                </Typography>
                            )}
                            <Divider />

                            <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                gap={2.5}
                                alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                            >
                                {caInstallUrl && (
                                    <Stack
                                        alignItems="center"
                                        sx={{
                                            flexShrink: 0,
                                            width: { xs: '100%', sm: QR_SIZE + 30 },
                                            bgcolor: 'background.level1',
                                            borderRadius: 'sm',
                                        }}
                                        gap={1}
                                    >
                                        <Stack
                                            sx={{
                                                py: 1.8,
                                                borderRadius: 'sm',
                                                lineHeight: 0,
                                            }}
                                            alignItems="center"
                                        >
                                            <QRCodeSVG
                                                value={caInstallUrl}
                                                size={QR_SIZE}
                                                level="M"
                                                includeMargin
                                                role="img"
                                                aria-label={t('ui.lanHttpsCopyUrl')}
                                            />
                                            {advancedMode && (
                                                <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5} sx={{ mt: 0.5 }}>
                                                    <Typography
                                                        sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.625rem', color: 'text.tertiary', }}
                                                    >
                                                        {caInstallUrl}
                                                    </Typography>
                                                    <IconButton
                                                        variant="plain"
                                                        size="xs"
                                                        sx={{ p: 0.5 }}
                                                        aria-label={t('ui.lanHttpsCopyUrl')}
                                                        onClick={() => handleCopy(caInstallUrl)}
                                                    >
                                                        <ContentCopy sx={{ fontSize: '0.625rem' }} />
                                                    </IconButton>
                                                </Stack>
                                            )}
                                        </Stack>
                                    </Stack>
                                )}

                                <Stack gap={2} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>{t('ui.lanHelpText', { lanIPUrl: lanHelpUrl })}</Typography>
                                    {advancedMode && lanHostname && (
                                        lanHostname !== 'localhost' ? (
                                            lanHostnameHelpUrl && (
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                    {t('ui.lanHttpsMdnsHint', { lanHostnameUrl: lanHostnameHelpUrl })}
                                                </Typography>
                                            )
                                        ) : (
                                            mdnsExampleHostnameUrl && (
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                    {t('ui.lanHttpsLocalhostHint', { exampleHostnameUrl: mdnsExampleHostnameUrl })}
                                                </Typography>
                                            )
                                        )
                                    )}
                                </Stack>
                            </Stack>
                        </Stack>
                    )}
                </Stack>
            </Dialog>

            <AddToHomeScreenGuideDialog
                isOpen={addToHomeGuideOpen}
                onClose={() => setAddToHomeGuideOpen(false)}
            />
        </>
    );
}

export default React.memo(LanHttpsManager);
