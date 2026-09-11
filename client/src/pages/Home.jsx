import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Box,
    Stack,
    Typography,
    Input,
    Button,
    Sheet,
    Chip,
    CircularProgress,
    Avatar,
    IconButton
} from '@mui/joy';
import { TableVirtuoso } from 'react-virtuoso';
import { Search, Download, Public } from '@mui/icons-material';
import { searchApps, getAppDetails, getAppIconUrl, isRateLimitError, resolveApiMessage, resolveClientErrorMessage } from '../utils/api';
import Dialog from '../components/Dialog';
import AppDetail, { toAppDetailPreview, toAppDetailPreviewFromId } from '../components/AppDetail';
import RegionSelector from '../components/RegionSelector';
import Swal from 'sweetalert2';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

export default function Home() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, setUser } = useApp();
    const openAppIdHandledRef = useRef(null);
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [showDetailDialog, setShowDetailDialog] = useState(false);
    const [appDetails, setAppDetails] = useState([]);
    const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailPreview, setDetailPreview] = useState(null);
    const [regionDialogOpen, setRegionDialogOpen] = useState(false);

    /**
     * 从 App Store 链接中提取应用ID
     * 支持格式：https://apps.apple.com/cn/app/.../id6755630162
     */
    const extractAppId = (input) => {
        const trimmed = input.trim();
        const urlMatch = trimmed.match(/\/id(\d+)(?:\?|$|\/)/i);
        if (urlMatch) {
            return urlMatch[1];
        }

        return null;
    };

    const handleSearch = async () => {
        if (!keyword.trim()) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.searchPlaceholder'),
                confirmButtonText: t('ui.confirm')
            });
            return;
        }

        setLoading(true);

        try {
            // 检查是否是 https:// 开头的链接
            if (keyword.trim().startsWith('https://')) {
                const appId = extractAppId(keyword);

                if (appId) {
                    // 直接打开详情页
                    setDetailPreview(toAppDetailPreviewFromId(appId));
                    setDetailLoading(true);
                    setShowDetailDialog(true);

                    const response = await getAppDetails([appId]);

                    if (response.success && response.data && response.data.length > 0) {
                        setAppDetails(response.data);
                        setCurrentDetailIndex(0);
                        setSearchResults(null);
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: t('ui.getDetailsFailed'),
                            text: resolveApiMessage(response) || t('ui.getDetailsFailed'),
                            confirmButtonText: t('ui.confirm')
                        });
                        setShowDetailDialog(false);
                    }
                    setDetailLoading(false);
                    return;
                }
            }

            // 关键词搜索
            const response = await searchApps(keyword.trim());
            if (response.success) {
                setSearchResults(response);
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('搜索失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.searchFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm')
            }).then(() => {
                if (error.errorMessageCode === 'AUTH_NOT_LOGGED_IN' || error.errorType === 'TOKEN_EXPIRED') {
                    navigate('/apple-id');
                }
            });
            setShowDetailDialog(false);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const formatPrice = (price) => {
        return price === 0 ? t('ui.free') : `¥${price}`;
    };

    const handleRowClick = async (clickedApp) => {
        if (!searchResults?.data?.apps) return;

        setDetailPreview(toAppDetailPreview(clickedApp));
        setDetailLoading(true);
        setShowDetailDialog(true);

        try {
            const allIds = searchResults.data.apps.map(app => app.id);

            const response = await getAppDetails(allIds);

            if (response.success && response.data) {
                setAppDetails(response.data);

                const clickedIndex = response.data.findIndex(detail => detail.trackId === clickedApp.id);
                setCurrentDetailIndex(clickedIndex >= 0 ? clickedIndex : 0);
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('获取应用详情失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.getDetailsFailed'),// 获取详情失败
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm')
            });
            setShowDetailDialog(false);
        } finally {
            setDetailLoading(false);
        }
    };

    const handlePrevious = () => {
        if (currentDetailIndex > 0) {
            setCurrentDetailIndex(currentDetailIndex - 1);
        }
    };

    const handleNext = () => {
        if (currentDetailIndex < appDetails.length - 1) {
            setCurrentDetailIndex(currentDetailIndex + 1);
        }
    };

    const handleCloseDetail = () => {
        setShowDetailDialog(false);
        setAppDetails([]);
        setCurrentDetailIndex(0);
        setDetailPreview(null);
    };

    const openAppDetailById = useCallback(async (appId) => {
        if (!appId) {
            return;
        }

        setDetailPreview(toAppDetailPreviewFromId(appId));
        setDetailLoading(true);
        setShowDetailDialog(true);

        try {
            const response = await getAppDetails([appId]);

            if (response.success && response.data?.length > 0) {
                setAppDetails(response.data);
                setCurrentDetailIndex(0);
                setSearchResults(null);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: t('ui.getDetailsFailed'),
                    text: resolveApiMessage(response) || t('ui.getDetailsFailed'),
                    confirmButtonText: t('ui.confirm'),
                });
                setShowDetailDialog(false);
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('获取应用详情失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.getDetailsFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
            setShowDetailDialog(false);
        } finally {
            setDetailLoading(false);
        }
    }, [t]);

    useEffect(() => {
        const openAppId = searchParams.get('openAppId');
        if (!openAppId) {
            openAppIdHandledRef.current = null;
            return;
        }
        if (openAppIdHandledRef.current === openAppId) {
            return;
        }
        openAppIdHandledRef.current = openAppId;

        openAppDetailById(openAppId);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('openAppId');
            return next;
        }, { replace: true });
    }, [searchParams, openAppDetailById, setSearchParams]);

    const detailApp = appDetails[currentDetailIndex] ?? detailPreview;


    const searchAppsList = searchResults?.data?.apps || [];

    const tableComponents = useMemo(() => createTableComponents((props) => {
        const app = props.item;
        if (!app) return {};
        return {
            style: { cursor: 'pointer' },
            onClick: () => handleRowClick(app),
        };
    }), [searchAppsList]);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            py: 3,
        }}>
            <Typography level="h2" sx={{ mb: 3, flexShrink: 0 }}>
                {/* 应用搜索 */}
                {t('ui.appSearch')}
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: searchResults ? 2 : 4, flexShrink: 0 }}>
                <Input
                    placeholder={t('ui.searchPlaceholder')}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    sx={{ flex: 1 }}
                    startDecorator={<Search />}
                    endDecorator={
                        <IconButton
                            variant="plain"
                            size="sm"
                            onClick={() => setRegionDialogOpen(true)}
                            sx={{
                                minHeight: 'auto',
                                '&:hover': {
                                    bgcolor: 'background.level1',
                                    '& .MuiChip-root': {
                                        bgcolor: 'primary.softBg'
                                    }
                                }
                            }}
                        >
                            {user?.region ? (
                                <Chip
                                    size="sm"
                                    variant="soft"
                                    color="primary"
                                    sx={{
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        minHeight: '20px',
                                        height: '20px',
                                        px: 0.75,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {user.region.toUpperCase()}
                                </Chip>
                            ) : (
                                <Public sx={{ fontSize: '1.2rem', color: 'text.tertiary' }} />
                            )}
                        </IconButton>
                    }
                />
                <Button
                    onClick={handleSearch}
                    loading={loading}
                    disabled={loading || !keyword.trim()}
                    startDecorator={!loading && <Search />}
                >
                    {/*  {loading ? '搜索中...' : '搜索'} */}
                    {loading ? t('ui.searching') : t('ui.search')}
                </Button>
            </Stack>

            {searchResults && (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <Typography level="h4" sx={{ mb: 2, flexShrink: 0 }}>
                        {t('ui.searchResults')} - "{searchResults.keyword}"
                    </Typography>

                    {searchAppsList.length > 0 ? (
                        <Sheet variant="outlined" sx={{ flex: 1, minHeight: 0, borderRadius: 'md', overflow: 'hidden', position: 'relative' }}>
                            <Box sx={{ position: 'absolute', inset: 0 }}>
                                <TableVirtuoso
                                    style={{ height: '100%' }}
                                    data={searchAppsList}
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
                                            <Box component="th" sx={{ ...headerColStyle(COL_WIDTH.price), ...wideColSx }}>
                                                {t('ui.appPrice')}
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
                                                    {app.bundleID}
                                                </Typography>
                                            </Box>
                                            <Box component="td" sx={wideColSx}>
                                                <Chip size="sm" variant="soft" sx={monoFontSx}>
                                                    {app.version}
                                                </Chip>
                                            </Box>
                                            <Box component="td" sx={wideColSx}>
                                                <Chip
                                                    size="sm"
                                                    color={app.price === 0 ? 'success' : 'primary'}
                                                    variant="soft"
                                                >
                                                    {formatPrice(app.price)}
                                                </Chip>
                                            </Box>
                                        </>
                                    )}
                                    components={tableComponents}
                                />
                            </Box>
                        </Sheet>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                                {t('ui.noResults')}
                            </Typography>
                        </Box>
                    )}

                    {searchResults.data?.count > 0 && (
                        <Typography level="body-sm" sx={{ mt: 2, flexShrink: 0, color: 'text.secondary' }}>
                            {t('ui.resultsCount', { count: searchResults.data.count })}
                        </Typography>
                    )}
                </Box>
            )}

            {loading && !searchResults && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4, flexShrink: 0 }}>
                    <CircularProgress />
                </Box>
            )}

            <Dialog
                isOpen={showDetailDialog}
                onClose={handleCloseDetail}
                title={`${detailApp?.trackId ? `ID: ${detailApp.trackId}` : ''}${detailApp?.trackName ? ` - ${detailApp.trackName}` : ''}`}
                size="large"
                onPrevious={handlePrevious}
                onNext={handleNext}
                hasPrevious={currentDetailIndex > 0}
                hasNext={currentDetailIndex < appDetails.length - 1}
            >
                <AppDetail
                    app={detailApp}
                    loading={detailLoading}
                />
            </Dialog>

            <RegionSelector
                open={regionDialogOpen}
                onClose={(updatedUserData) => {
                    setRegionDialogOpen(false);
                    if (updatedUserData) {
                        setUser(updatedUserData);
                    }
                }}
                currentRegion={user?.region}
                storeRegion={user?.storeRegion}
                regionSource={user?.regionSource}
            />
        </Box>
    );
}
