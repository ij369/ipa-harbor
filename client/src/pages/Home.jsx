import React, { useState, useEffect } from 'react';
import {
    Box,
    Stack,
    Typography,
    Input,
    Button,
    Table,
    Sheet,
    Chip,
    CircularProgress,
    Avatar,
    IconButton
} from '@mui/joy';
import { Search, Download, Public } from '@mui/icons-material';
import { searchApps, getAppDetails, getAppIconUrl } from '../utils/api';
import Dialog from '../components/Dialog';
import AppDetail from '../components/AppDetail';
import RegionSelector from '../components/RegionSelector';
import Swal from 'sweetalert2';
import { isMobile as isMobile } from 'react-device-detect';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../contexts/AppContext';

export default function Home() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, setUser } = useApp();
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [showDetailDialog, setShowDetailDialog] = useState(false);
    const [appDetails, setAppDetails] = useState([]);
    const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);
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
                            text: response.message || 'Failed to get app details',
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
            console.error('搜索失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.searchFailed'),
                text: error.message,
                confirmButtonText: t('ui.confirm')
            }).then(() => {
                if (error.message.includes('认证') || error.message.includes('登录') || error.message.includes('token')) {
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
            console.error('获取应用详情失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.getDetailsFailed'),// 获取详情失败
                text: error.message,
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
    };


    return (
        <Box>
            <Typography level="h2" sx={{ mb: 3 }}>
                {/* 应用搜索 */}
                {t('ui.appSearch')}
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
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
                <Box>
                    <Typography level="h4" sx={{ mb: 2 }}>
                        {/* 搜索结果 - "{searchResults.keyword}" */}
                        {t('ui.searchResults')} - "{searchResults.keyword}"
                    </Typography>

                    {searchResults.data?.apps?.length > 0 ? (
                        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'hidden' }}>
                            <Table stickyHeader>
                                <thead>
                                    <tr>
                                        <th style={{ minWidth: '200px' }}>{t('ui.appName_label')}</th>
                                        <th style={{ width: '100px', display: isMobile ? 'none' : 'table-cell' }}>{t('ui.appId')}</th>
                                        <th style={{ display: isMobile ? 'none' : 'table-cell' }}>{t('ui.bundleId')}</th>
                                        <th style={{ width: '100px' }}>{t('ui.appVersion')}</th>
                                        <th style={{ width: '80px' }}>{t('ui.appPrice')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchResults.data.apps.map((app) => (
                                        <tr
                                            key={app.id}
                                            onClick={() => handleRowClick(app)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td>
                                                <Stack direction="row" spacing={2} alignItems="center">
                                                    <Avatar
                                                        src={getAppIconUrl(app.id, 40)}
                                                        alt={app.name}
                                                        size="sm"
                                                        sx={{
                                                            borderRadius: '22%',
                                                            width: 40,
                                                            height: 40
                                                        }}
                                                    />
                                                    <Typography fontWeight="md">
                                                        {app.name}
                                                    </Typography>
                                                </Stack>
                                            </td>
                                            <td style={{ display: isMobile ? 'none' : 'table-cell' }}>{app.id}</td>
                                            <td style={{ display: isMobile ? 'none' : 'table-cell' }}>
                                                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                                    {app.bundleID}
                                                </Typography>
                                            </td>
                                            <td>
                                                <Chip size="sm" variant="soft">
                                                    {app.version}
                                                </Chip>
                                            </td>
                                            <td>
                                                <Chip
                                                    size="sm"
                                                    color={app.price === 0 ? 'success' : 'primary'}
                                                    variant="soft"
                                                >
                                                    {formatPrice(app.price)}
                                                </Chip>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </Sheet>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                                {/* 没有找到相关应用 */}
                                {t('ui.noResults')}
                            </Typography>
                        </Box>
                    )}

                    {searchResults.data?.count && (
                        <Typography level="body-sm" sx={{ mt: 2, color: 'text.secondary' }}>
                            {/* 找到 {searchResults.data.count} 个结果 */}
                            {t('ui.resultsCount', { count: searchResults.data.count })}
                        </Typography>
                    )}
                </Box>
            )}

            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                </Box>
            )}

            <Dialog
                isOpen={showDetailDialog}
                onClose={handleCloseDetail}
                title={`
                    ${appDetails[currentDetailIndex]?.trackId ? 'ID: ' + appDetails[currentDetailIndex].trackId : ''}${appDetails[currentDetailIndex]?.trackName ? ' - ' + appDetails[currentDetailIndex].trackName : ''}`}

                size="large"
                onPrevious={handlePrevious}
                onNext={handleNext}
                hasPrevious={currentDetailIndex > 0}
                hasNext={currentDetailIndex < appDetails.length - 1}
            >
                <AppDetail
                    app={detailLoading ? null : appDetails[currentDetailIndex]}
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
            />
        </Box>
    );
}
