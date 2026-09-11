import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Sheet,
    Chip,
    Stack,
    CircularProgress,
    Avatar,
    Button
} from '@mui/joy';
import { Refresh } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useApp } from '../contexts/AppContext';
import {
    wideColSx,
    COL_WIDTH,
    headerColStyle,
    createTableComponents,
    APP_ICON_SIZE,
    appIconSx,
    monoFontSx,
    monoCellStyle,
} from '../styles/tableColumns';
import { listPurchases, getAppDetails, getAppIconUrl, isRateLimitError, resolveApiMessage, resolveClientErrorMessage } from '../utils/api';
import Dialog from '../components/Dialog';
import AppDetail, { toAppDetailPreview } from '../components/AppDetail';

const PAGE_SIZE = 50;

export default function Purchases() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated, user } = useApp();
    const [apps, setApps] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [initialLoaded, setInitialLoaded] = useState(false);

    const [showDetailDialog, setShowDetailDialog] = useState(false);
    const [appDetails, setAppDetails] = useState([]);
    const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailPreview, setDetailPreview] = useState(null);

    const loadingRef = useRef(false);

    const hasMore = apps.length < totalCount;

    const fetchPage = useCallback(async (pageNum, append = false) => {
        if (loadingRef.current) return;
        loadingRef.current = true;

        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            const response = await listPurchases(pageNum, PAGE_SIZE);
            const newApps = response.data?.apps || [];
            const total = response.data?.totalCount ?? newApps.length;

            setTotalCount(total);
            setPage(pageNum);
            setApps(prev => append ? [...prev, ...newApps] : newApps);
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('获取已购项目失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.loadPurchasesFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm')
            }).then(() => {
                if (error.errorMessageCode === 'AUTH_NOT_LOGGED_IN' || error.errorType === 'TOKEN_EXPIRED') {
                    navigate('/apple-id');
                }
            });
        } finally {
            loadingRef.current = false;
            setLoading(false);
            setLoadingMore(false);
            setInitialLoaded(true);
        }
    }, [navigate, t]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchPage(1, false);
        } else {
            setInitialLoaded(true);
        }
    }, [isAuthenticated, fetchPage]);

    const loadMore = useCallback(() => {
        if (!hasMore || loadingRef.current) return;
        fetchPage(page + 1, true);
    }, [fetchPage, hasMore, page]);

    const handleRowClick = async (clickedApp) => {
        setDetailPreview(toAppDetailPreview(clickedApp));
        setDetailLoading(true);
        setShowDetailDialog(true);

        try {
            const response = await getAppDetails([clickedApp.id]);

            if (response.success && response.data) {
                setAppDetails(response.data);
                setCurrentDetailIndex(0);
            } else {
                const detailsError = new Error(resolveApiMessage(response) || t('ui.getDetailsFailed'));
                detailsError.errorMessageCode = response.errorMessageCode;
                detailsError.errorCode = response.errorCode;
                detailsError.backendMessage = response.message;
                detailsError.backendError = response.error;
                throw detailsError;
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('获取应用详情失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.getDetailsFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm')
            });
            setShowDetailDialog(false);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleRefresh = () => {
        fetchPage(1, false);
    };

    const tableComponents = useMemo(() => createTableComponents((props) => {
        const app = props.item;
        if (!app) return {};
        return {
            style: { cursor: 'pointer' },
            onClick: () => handleRowClick(app),
        };
    }), [apps]);

    const handleCloseDetail = () => {
        setShowDetailDialog(false);
        setAppDetails([]);
        setCurrentDetailIndex(0);
        setDetailPreview(null);
    };

    const detailApp = appDetails[currentDetailIndex] ?? detailPreview;

    if (!isAuthenticated) {
        return (
            <Box sx={{ flex: 1, py: 3 }}>
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                        {t('ui.needAppleIdLogin')}
                    </Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            py: 3,
        }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3, flexShrink: 0 }}>
                <Typography level="h2">
                    {t('ui.purchasedAppsTitle')}
                </Typography>
                {totalCount > 0 && (
                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                        {t('ui.totalPurchased', { count: totalCount })}
                    </Typography>
                )}
            </Stack>

            {loading && !initialLoaded ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : apps.length > 0 ? (
                <Sheet variant="outlined" sx={{ flex: 1, minHeight: 0, borderRadius: 'md', overflow: 'hidden', position: 'relative' }}>
                    <Box sx={{ position: 'absolute', inset: 0 }}>
                        <TableVirtuoso
                            style={{ height: '100%' }}
                            data={apps}
                            endReached={loadMore}
                            fixedHeaderContent={() => (
                                <tr>
                                    <th style={{ minWidth: COL_WIDTH.nameMin }}>
                                        {t('ui.appName_label')}
                                    </th>
                                    <th style={{ ...headerColStyle(COL_WIDTH.appId), ...monoCellStyle }}>
                                        {t('ui.appId')}
                                    </th>
                                    <Box component="th" sx={{ ...wideColSx, ...monoFontSx }}>
                                        {t('ui.bundleId')}
                                    </Box>
                                    <Box component="th" sx={{ ...headerColStyle(COL_WIDTH.version), ...wideColSx, ...monoFontSx }}>
                                        {t('ui.appVersion')}
                                    </Box>
                                </tr>
                            )}
                            itemContent={(index, app) => (
                                <>
                                    <td>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Avatar
                                                src={getAppIconUrl(app.id, APP_ICON_SIZE, user?.region)}
                                                alt={app.name}
                                                size="sm"
                                                sx={appIconSx}
                                            />
                                            <Typography fontWeight="md">
                                                {app.name}
                                            </Typography>
                                        </Stack>
                                    </td>
                                    <td style={monoCellStyle}>{app.id}</td>
                                    <Box component="td" sx={{ ...wideColSx, ...monoFontSx }}>
                                        <Typography level="body-sm" sx={{ color: 'text.secondary', ...monoFontSx }}>
                                            {app.bundleID || app.bundleId}
                                        </Typography>
                                    </Box>
                                    <Box component="td" sx={wideColSx}>
                                        <Chip size="sm" variant="soft" sx={monoFontSx}>
                                            {app.version}
                                        </Chip>
                                    </Box>
                                </>
                            )}
                            components={tableComponents}
                        />
                    </Box>
                    {loadingMore && (
                        <Box sx={{
                            position: 'absolute',
                            bottom: 8,
                            left: 0,
                            right: 0,
                            display: 'flex',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                        }}>
                            <CircularProgress size="sm" />
                        </Box>
                    )}
                </Sheet>
            ) : initialLoaded ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography level="body-lg" sx={{ color: 'text.secondary', mb: 2 }}>
                        {t('ui.noPurchasedApps')}
                    </Typography>
                    <Button
                        variant="soft"
                        onClick={handleRefresh}
                        loading={loading}
                        startDecorator={!loading && <Refresh />}
                    >
                        {t('ui.refresh')}
                    </Button>
                </Box>
            ) : null}

            <Dialog
                isOpen={showDetailDialog}
                onClose={handleCloseDetail}
                title={`${detailApp?.trackId ? `ID: ${detailApp.trackId}` : ''}${detailApp?.trackName ? ` - ${detailApp.trackName}` : ''}`}
                size="large"
            >
                <AppDetail
                    app={detailApp}
                    loading={detailLoading}
                />
            </Dialog>
        </Box>
    );
}
