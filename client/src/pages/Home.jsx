import React, { useState } from 'react';
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
    Avatar
} from '@mui/joy';
import { Search, Download } from '@mui/icons-material';
import { searchApps, getAppDetails, getAppIconUrl } from '../utils/api';
import Dialog from '../components/Dialog';
import AppDetail from '../components/AppDetail';
import Swal from 'sweetalert2';
import { isMobile as isMobile } from 'react-device-detect';
import { useNavigate } from 'react-router-dom';
export default function Home() {
    const navigate = useNavigate();
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState(null);
    const [showDetailDialog, setShowDetailDialog] = useState(false);
    const [appDetails, setAppDetails] = useState([]);
    const [currentDetailIndex, setCurrentDetailIndex] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);

    const handleSearch = async () => {
        if (!keyword.trim()) {
            Swal.fire({
                icon: 'warning',
                title: '请输入搜索关键词',
                confirmButtonText: '确定'
            });
            return;
        }

        setLoading(true);
        try {
            const response = await searchApps(keyword.trim());
            if (response.success) {
                setSearchResults(response);
            }
        } catch (error) {
            console.error('搜索失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: '搜索失败',
                text: error.message,
                confirmButtonText: '确定'
            }).then(() => {
                if (error.message.includes('认证') || error.message.includes('登录') || error.message.includes('token')) {
                    // window.location.href = '/apple-id';
                    navigate('/apple-id');
                }
            });
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
        return price === 0 ? '免费' : `¥${price}`;
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
                title: '获取详情失败',
                text: error.message,
                confirmButtonText: '确定'
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
                应用搜索
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
                <Input
                    placeholder="输入应用名称进行搜索..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    sx={{ flex: 1 }}
                    startDecorator={<Search />}
                />
                <Button
                    onClick={handleSearch}
                    loading={loading}
                    disabled={loading || !keyword.trim()}
                    startDecorator={!loading && <Search />}
                >
                    {loading ? '搜索中...' : '搜索'}
                </Button>
            </Stack>

            {searchResults && (
                <Box>
                    <Typography level="h4" sx={{ mb: 2 }}>
                        搜索结果 - "{searchResults.keyword}"
                    </Typography>

                    {searchResults.data?.apps?.length > 0 ? (
                        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'hidden' }}>
                            <Table stickyHeader>
                                <thead>
                                    <tr>
                                        <th style={{ minWidth: '200px' }}>应用名称</th>
                                        <th style={{ width: '100px', display: isMobile ? 'none' : 'table-cell' }}>ID</th>
                                        <th style={{ display: isMobile ? 'none' : 'table-cell' }}>Bundle ID</th>
                                        <th style={{ width: '100px' }}>版本</th>
                                        <th style={{ width: '80px' }}>价格</th>
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
                                没有找到相关应用
                            </Typography>
                        </Box>
                    )}

                    {searchResults.data?.count && (
                        <Typography level="body-sm" sx={{ mt: 2, color: 'text.secondary' }}>
                            找到 {searchResults.data.count} 个结果
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
        </Box>
    );
}
