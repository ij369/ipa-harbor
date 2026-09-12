import React, { useState, useMemo } from 'react';
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
import { searchApps, getAppIconUrl, isRateLimitError, resolveClientErrorMessage } from '../utils/api';
import RegionSelector from '../components/RegionSelector';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppSession } from '../contexts/AppContext';
import { useAppDetailDialog } from '../hooks/useAppDetailDialog';
import { useJoyUp } from '../hooks/useJoyMedia';
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

function Home() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, setUser } = useAppSession();
    const appDetail = useAppDetailDialog({ syncQuery: true });
    const aboveSm = useJoyUp('sm');
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
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
                    await appDetail.openByAppId(appId, {
                        onSuccess: () => setSearchResults(null),
                    });
                    setLoading(false);
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
        } finally {
            setLoading(false);
        }
    };

    const handleSearchKeyDown = (e) => {
        if (e.key !== 'Enter') {
            return;
        }
        e.preventDefault();
        handleSearch();
    };

    const formatPrice = (price) => {
        return price === 0 ? t('ui.free') : `¥${price}`;
    };

    const handleRowClick = async (clickedApp) => {
        if (!searchResults?.data?.apps) return;

        const allIds = searchResults.data.apps.map((app) => app.id);
        await appDetail.openByListApp(clickedApp, allIds);
    };

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
        }} className="app-shell-page-content">
            <Typography level="h2" className="app-shell-page-title" sx={{ mb: 3, flexShrink: 0 }}>
                {/* 应用搜索 */}
                {t('ui.appSearch')}
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: searchResults ? 2 : 4, flexShrink: 0 }}>
                <Input
                    type="search"
                    name="appSearch"
                    autoComplete="off"
                    placeholder={t('ui.searchPlaceholder')}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    disabled={loading}
                    sx={{ flex: 1 }}
                    slotProps={{ input: { onKeyDown: handleSearchKeyDown, enterKeyHint: 'search' } }}
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
                    startDecorator={!loading && aboveSm ? <Search /> : undefined}
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

            {appDetail.dialog}

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

export default React.memo(Home);
