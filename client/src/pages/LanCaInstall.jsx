import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    LinearProgress,
    Stack,
    Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { normalizeLanguageCode } from '../i18n';
import { getApiBaseUrl, getLanHttpsStatus, isRateLimitError } from '../utils/api';
import DomainVerificationIcon from '@mui/icons-material/DomainVerification';

const pageShellSx = {
    width: '100%',
    minHeight: '100dvh',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    py: 2,
    px: 2,
};

const pageCardSx = {
    width: '100%',
    maxWidth: 480,
    my: 'auto',
    flexShrink: 0,
};

const stepListSx = {
    m: 0,
    mt: 2,
    pl: 2,
    typography: 'body-sm',
    color: 'text.secondary',
    '& > li': {
        mb: 0.75,
        '&:last-child': { mb: 0 },
    },
};

function LanCaInstall() {
    const { t, i18n } = useTranslation();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        const langParam = searchParams.get('lang');
        if (langParam) {
            i18n.changeLanguage(normalizeLanguageCode(langParam));
        }
    }, [searchParams, i18n]);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setLoadFailed(false);
        try {
            const response = await getLanHttpsStatus();
            setStatus(response.data || null);
        } catch (error) {
            if (!isRateLimitError(error)) {
                console.error('加载局域网 HTTPS 状态失败:', error);
            }
            setStatus(null);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const downloadUrl = `${getApiBaseUrl().replace(/\/$/, '')}/lan-ca/download`;
    const caReady = Boolean(status?.caReady);
    const httpsUrl = status?.httpsUrl || '';

    if (loading) {
        return (
            <Box sx={{ ...pageShellSx, justifyContent: 'center' }}>
                <LinearProgress sx={{ width: '100%', maxWidth: 480 }} />
            </Box>
        );
    }

    if (!status?.enableAutoCert) {
        return (
            <Box sx={pageShellSx}>
                <Card sx={pageCardSx}>
                    <CardContent>
                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                            {t('lanCaInstall.featureDisabled')}
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={pageShellSx}>
            <Stack direction="row" justifyContent="flex-end" sx={{ width: '100%', maxWidth: 480, mb: 1 }}>
                <LanguageSwitcher size="sm" variant="select" />
            </Stack>

            <Card sx={pageCardSx}>
                <CardContent>
                    <DomainVerificationIcon sx={{ fontSize: 'x-large', mb: 2 }} />
                    <Typography level="title-md" sx={{ mb: 2 }}>
                        {t('lanCaInstall.title')}
                    </Typography>

                    {loadFailed && (
                        <Alert color="danger" variant="soft" sx={{ mb: 2 }}>
                            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                                <Typography level="body-sm" sx={{ flex: 1, minWidth: 0 }}>
                                    {t('ui.serverUnavailableHint')}
                                </Typography>
                                <Button size="sm" variant="soft" onClick={loadStatus}>
                                    {t('ui.retry')}
                                </Button>
                            </Stack>
                        </Alert>
                    )}

                    <Button
                        component="a"
                        href={downloadUrl}
                        fullWidth
                        disabled={!caReady}
                    >
                        {t('lanCaInstall.downloadButton')}
                    </Button>

                    {!caReady && (
                        <Alert color="warning" variant="soft" sx={{ mt: 1.5 }}>
                            {t('lanCaInstall.caNotReady')}
                        </Alert>
                    )}

                    <Box component="ol" sx={stepListSx}>
                        <Box component="li">{t('lanCaInstall.step1')}</Box>
                        <Box component="li">{t('lanCaInstall.step2')}</Box>
                    </Box>

                    {httpsUrl && (
                        <Button
                            component="a"
                            href={httpsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            variant="outlined"
                            color="neutral"
                            sx={{ mt: 2 }}
                        >
                            {t('lanCaInstall.openHttps')}
                        </Button>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}

export default LanCaInstall;
