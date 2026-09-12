import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Sheet,
    Chip,
    Stack,
    CircularProgress,
    Avatar,
    Button,
    Skeleton,
    Table,
} from '@mui/joy';
import { Refresh } from '@mui/icons-material';
import { TableVirtuoso } from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAppSession } from '../contexts/AppContext';
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
import { listPurchases, getAppIconUrl, isRateLimitError, resolveClientErrorMessage } from '../utils/api';
import { useAppDetailDialog } from '../hooks/useAppDetailDialog';

const PAGE_SIZE = 50;
const SKELETON_ROW_COUNT = 10;

const purchasesTableSx = {
    '& thead th:first-of-type, & tbody td:first-of-type': {
        pl: 1.5,
    },
};

function PurchasesTableSkeleton() {
    const { t } = useTranslation();

    return (
        <Sheet variant="outlined" sx={{ flex: 1, minHeight: 0, borderRadius: 'md', overflow: 'auto' }}>
            <Table stickyHeader component="table" sx={purchasesTableSx}>
                <thead>
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
                </thead>
                <tbody>
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                        <tr key={index}>
                            <td>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Skeleton variant="rectangular" sx={appIconSx} />
                                    <Skeleton variant="text" level="body-md" sx={{ flex: 1, maxWidth: 160 }} />
                                </Stack>
                            </td>
                            <td>
                                <Skeleton variant="text" level="body-sm" sx={{ width: 72, ...monoFontSx }} />
                            </td>
                            <Box component="td" sx={{ ...wideColSx, ...monoFontSx }}>
                                <Skeleton variant="text" level="body-sm" sx={{ width: '80%', maxWidth: 220 }} />
                            </Box>
                            <Box component="td" sx={wideColSx}>
                                <Skeleton variant="rectangular" height={24} sx={{ width: 56, borderRadius: 'sm' }} />
                            </Box>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </Sheet>
    );
}

function Purchases() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAppSession();
    const appDetail = useAppDetailDialog({ syncQuery: true });
    const [apps, setApps] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [initialLoaded, setInitialLoaded] = useState(false);

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
        await appDetail.openByListApp(clickedApp, [clickedApp.id]);
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
        }} className="app-shell-page-content">
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexShrink: 0 }}>
                <Typography level="h2" className="app-shell-page-title" sx={{ mb: 3, flexShrink: 0 }}>
                    {t('ui.purchasedAppsTitle')}
                </Typography>
                {totalCount > 0 && (
                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                        {t('ui.totalPurchased', { count: totalCount })}
                    </Typography>
                )}
            </Stack>

            {loading && !loadingMore ? (
                <PurchasesTableSkeleton />
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
                        disabled={loading}
                        startDecorator={<Refresh />}
                    >
                        {t('ui.refresh')}
                    </Button>
                </Box>
            ) : null}

            {appDetail.dialog}
        </Box>
    );
}

export default React.memo(Purchases);
