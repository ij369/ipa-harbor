import React, { useState } from 'react';
import {
    Box, Stack, Typography, Skeleton, Tooltip, Divider, IconButton, Chip, Link,
    Drawer, Button, DialogTitle, DialogContent, ModalClose, Sheet
} from '@mui/joy';
import { getAppIconUrl, getAppDownloadPackageUrl, deleteTask, downloadApp } from '../utils/api';
import Swal from 'sweetalert2';
import formatFileSize from '../utils/formatFileSize.js';
import { Close as CloseIcon, Download as DownloadIcon } from '@mui/icons-material';

function AppIcon({ appId, size = 128, disabled = false }) {
    const [loaded, setLoaded] = useState(false);
    const iconUrl = appId ? getAppIconUrl(appId) : null;

    return (
        <Box
            sx={{
                position: 'relative',
                width: size,
                height: size,
                borderRadius: '22%',
                overflow: 'hidden',
                backgroundColor: 'background.level1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: disabled ? 'grayscale(100%)' : 'none',
                opacity: disabled ? 0.5 : 1,
            }}
            boxShadow='md'
        >
            {!loaded && (
                <Skeleton
                    variant="rectangular"
                    width="100%"
                    height="100%"
                    sx={{ borderRadius: '22%' }}
                />
            )}

            {iconUrl && (
                <img
                    src={iconUrl}
                    alt={`App Icon - ${appId}`}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '22%',
                        display: loaded ? 'block' : 'none',
                    }}
                    onLoad={() => setLoaded(true)}
                    onError={() => setLoaded(true)}
                />
            )}

            {!iconUrl && !loaded && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: size / 3,
                        color: 'text.tertiary',
                    }}
                >
                    .
                </Box>
            )}
        </Box>
    );
}

export default function IpaIcon({ item, size = 128, isDragging = false }) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const {
        id: appId,
        name,
        status,
        progress = 0,
        sizeProgress,
        taskId,
        bundleId,
        itemId,
        bundleDisplayName,
        artistName,
        bundleShortVersionString,
        bundleVersion,
        productType,
        softwareVersionBundleId,
        softwareVersionExternalIdentifier,
        releaseDate,
        size: fileSize,
        createdAt,
    } = item;

    const extractAppInfo = (fileName) => {
        if (!fileName) return { appId: null, versionId: null };
        const match = fileName.match(/^(\d+)_(.+)\.ipa$/);
        return match ? { appId: match[1], versionId: match[2] } : { appId: null, versionId: null };
    };

    const { appId: extractedAppId, versionId } = extractAppInfo(name);
    const finalAppId = appId || extractedAppId;

    const formatDate = (dateString) => {
        if (!dateString) return '未知';
        try {
            return new Date(dateString).toLocaleString('zh-CN');
        } catch {
            return '日期格式错误';
        }
    };

    const getTooltipContent = () => {
        const fields = [
            { label: '应用名称', value: bundleDisplayName },
            { label: '开发者', value: artistName },
            { label: '版本号', value: bundleShortVersionString },
            { label: '构建版本', value: bundleVersion },
            { label: 'Bundle ID', value: softwareVersionBundleId },
            { label: '应用ID', value: itemId },
            { label: '版本 ID', value: softwareVersionExternalIdentifier },
            { label: '产品类型', value: productType },
            { label: '文件大小', value: fileSize ? formatFileSize(fileSize) : null },
            { label: '发布日期', value: releaseDate ? formatDate(releaseDate) : null },
            { label: '下载时间', value: createdAt ? formatDate(createdAt) : null },
            { label: '文件名', value: name },
        ];

        const details = fields
            .filter(field => field.value)
            .map(field => `${field.label}: ${field.value}`);

        return details.length ? details.join('\n') : null;
    };


    const tooltipContent = getTooltipContent();
    const handleDeleteTask = async (e) => {
        e.stopPropagation();

        setDrawerOpen(false);
        const result = await Swal.fire({
            title: '确认删除',
            text: `确定要删除这个任务和对应的 ipa 文件吗？ ${name}`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            confirmButtonColor: '#d33'
        });

        if (result.isConfirmed) {
            try {
                const response = name
                    ? await deleteTask(null, name) // 按文件名删除
                    : await deleteTask(taskId); // 按任务ID删除

                if (response.success) {
                    Swal.fire({
                        icon: 'success',
                        title: '任务已删除',
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
            } catch (error) {
                console.error('删除任务失败:', error);
                Swal.fire({
                    icon: 'error',
                    title: '删除失败',
                    text: error.message,
                    confirmButtonText: '确定'
                });
            }
        }
    };

    const handleRetryDownload = async (e) => {
        e.stopPropagation();
        console.log(item);
        if (!finalAppId || !bundleId) {
            Swal.fire({
                icon: 'error',
                title: '重试失败',
                text: '无法获取应用ID',
                confirmButtonText: '确定'
            });
            return;
        }

        try {
            const response = await downloadApp(finalAppId, versionId || 'latest', bundleId);
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: '重试任务已创建',
                    text: `任务ID: ${response.taskId}`,
                    position: 'top',
                    toast: true,
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        } catch (error) {
            console.error('重试下载失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: '重试失败',
                text: error.message,
                confirmButtonText: '确定'
            });
        }
    };

    const renderContent = () => {
        switch (status) {
            case 'pending':
            case 'running':
                return (
                    <>
                        {/* 图标 + 进度条 */}
                        <Box sx={{ position: 'relative' }}>
                            <AppIcon appId={finalAppId} size={size} disabled />
                            <Box
                                sx={{
                                    position: 'absolute',
                                    bottom: 9,
                                    left: '9%',
                                    right: '9%',
                                    height: '15px',
                                    padding: '2px',
                                    border: '1.2px solid rgba(0,0,0,0.2)',
                                    borderRadius: '16px',
                                    backgroundColor: 'rgba(255,255,255,0.3)', // 轨道底色
                                    overflow: 'hidden',
                                    boxSizing: 'border-box',
                                }}
                            >
                                {/* 进度条 */}
                                <Box
                                    sx={{
                                        height: '100%',
                                        width: `${progress}%`,
                                        backgroundColor: '#007aff',
                                        borderRadius: '6px',
                                        transition: 'width 0.2s ease',
                                    }}
                                />
                            </Box>
                        </Box>

                        {/* 描述部分 */}
                        <Stack spacing="0.2rem" alignItems="center" sx={{ width: size }}>
                            <Typography
                                sx={{
                                    fontSize: '0.9rem',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    width: '100%',
                                }}
                            >
                                {status === 'running' ? '下载中' : '等待中'} {progress && progress + '%'}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: '0.75rem',
                                    textAlign: 'center',
                                    color: '#666',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {sizeProgress || `${progress}%`}
                            </Typography>
                        </Stack>
                    </>
                );

            case 'failed':
                return (
                    <>
                        <Box
                            sx={{
                                position: 'relative',
                                cursor: 'pointer',
                                '&:hover': {
                                    opacity: 0.8
                                }
                            }}
                            onClick={handleDeleteTask}
                        >
                            <AppIcon appId={finalAppId} size={size} disabled />
                            <Box
                                sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    // backgroundColor: 'rgba(255,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: size / 6,
                                    opacity: '0.6',
                                    ":hover": {
                                        opacity: 1
                                    },
                                    color: 'white',
                                    textShadow: '1px 2px 2px black'
                                }}
                            >
                                删除
                            </Box>
                        </Box>

                        <Stack
                            spacing="0.2rem"
                            alignItems="center"
                            sx={{
                                width: size,
                                cursor: 'pointer',
                                '&:hover': {
                                    opacity: 0.8
                                }
                            }}
                            onClick={handleRetryDownload}
                        >
                            <Typography sx={{ fontSize: '0.9rem', textAlign: 'center' }}>失败</Typography>
                            <Link sx={{ fontSize: '0.75rem', textAlign: 'center', color: '#666' }}>
                                点击这里重试
                            </Link>
                        </Stack>
                    </>
                );

            case 'completed':
            case 'downloaded':
                return (
                    <>
                        <AppIcon appId={finalAppId} size={size} />
                        <Stack spacing="0.2rem" alignItems="center" sx={{ width: size }}>
                            <Typography
                                sx={{
                                    fontSize: '0.9rem',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    width: '100%',
                                }}
                            >
                                {bundleDisplayName || name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.75rem', textAlign: 'center', color: '#666' }}>
                                {formatFileSize(fileSize) || '下载完成'}
                            </Typography>
                        </Stack>
                    </>
                );

            default:
                return (
                    <>
                        <AppIcon appId={finalAppId} size={size} />
                        <Stack spacing="0.2rem" alignItems="center" sx={{ width: size }}>
                            <Typography
                                sx={{
                                    fontSize: '0.9rem',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    width: '100%',
                                }}
                            >
                                {name || '未知应用'}
                            </Typography>
                            <Typography sx={{ fontSize: '0.8rem', textAlign: 'center', color: '#666' }}>
                                —
                            </Typography>
                        </Stack>
                    </>
                );
        }
    };

    const handleClick = () => {
        if (['completed', 'downloaded'].includes(status)) {
            setDrawerOpen(true);
        }
    };

    const handleDownload = (e) => {
        e.stopPropagation();
        const [appId, version] = name.replace(/\.ipa$/, '').split('_');
        window.open(getAppDownloadPackageUrl(appId, version), '_blank');
    };

    const tooltipTitle = tooltipContent && (
        <Box sx={{ whiteSpace: 'pre-line', maxWidth: 300 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography level="body-xs">{bundleDisplayName}</Typography>
                <Typography level="body-xs">{bundleShortVersionString}</Typography>
            </Stack>
            {bundleDisplayName && <Divider sx={{ my: 0.5 }} />}
            <Typography level="body-xs">{tooltipContent}</Typography>
        </Box>
    );

    const content = (
        <Stack
            alignItems="center"
            spacing="0.4rem"
            sx={{ width: size, userSelect: 'none', position: 'relative', display: 'inline-block' }}
            onClick={handleClick}
        >
            {renderContent()}
        </Stack>
    );

    const detailDrawer = (
        <Drawer
            size="md"
            anchor="right"
            variant="plain"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            slotProps={{
                backdrop: {
                    sx: {
                        backdropFilter: 'none', // 禁用模糊效果
                    },
                },
                content: {
                    sx: {
                        bgcolor: 'transparent',
                        p: { md: 3, sm: 0 },
                        boxShadow: 'none',
                    },
                },
            }}
        >
            <Sheet
                sx={{
                    borderRadius: 'md',
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    height: '100%',
                    overflow: 'auto',
                }}
            >
                <DialogTitle>{bundleDisplayName || name}</DialogTitle>
                <ModalClose />
                <Divider sx={{ mt: 'auto' }} />
                <DialogContent sx={{ gap: 2 }}>
                    <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                            <AppIcon appId={finalAppId} size={120} />
                        </Box>

                        <Stack spacing={1}>
                            {bundleDisplayName && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>应用名称</Typography>
                                    <Typography level="body-md">{bundleDisplayName}</Typography>
                                </Box>
                            )}
                            {artistName && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>开发者</Typography>
                                    <Typography level="body-md">{artistName}</Typography>
                                </Box>
                            )}
                            {bundleShortVersionString && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>版本号</Typography>
                                    <Typography level="body-md">{bundleShortVersionString}</Typography>
                                </Box>
                            )}
                            {bundleVersion && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>构建版本</Typography>
                                    <Typography level="body-md">{bundleVersion}</Typography>
                                </Box>
                            )}
                            {softwareVersionBundleId && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>Bundle ID</Typography>
                                    <Typography level="body-md">{softwareVersionBundleId}</Typography>
                                </Box>
                            )}
                            {itemId && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>应用ID</Typography>
                                    <Typography level="body-md">{itemId}</Typography>
                                </Box>
                            )}
                            {softwareVersionExternalIdentifier && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>版本 ID</Typography>
                                    <Typography level="body-md">{softwareVersionExternalIdentifier}</Typography>
                                </Box>
                            )}
                            {productType && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>产品类型</Typography>
                                    <Typography level="body-md">{productType}</Typography>
                                </Box>
                            )}
                            {fileSize && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>文件大小</Typography>
                                    <Typography level="body-md">{formatFileSize(fileSize)}</Typography>
                                </Box>
                            )}
                            {releaseDate && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>发布日期</Typography>
                                    <Typography level="body-md">{formatDate(releaseDate)}</Typography>
                                </Box>
                            )}
                            {createdAt && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>下载时间</Typography>
                                    <Typography level="body-md">{formatDate(createdAt)}</Typography>
                                </Box>
                            )}
                            <Box>
                                <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>文件名</Typography>
                                <Typography level="body-md">{name}</Typography>
                            </Box>
                        </Stack>
                    </Stack>
                </DialogContent>

                <Divider sx={{ mt: 'auto' }} />
                <Stack
                    direction="row"
                    useFlexGap
                    spacing={1}
                    sx={{ justifyContent: 'space-between' }}
                >
                    <Button
                        variant="outlined"
                        color="danger"
                        onClick={handleDeleteTask}
                    >
                        删除
                    </Button>
                    <Button
                        startDecorator={<DownloadIcon />}
                        onClick={handleDownload}
                    >
                        下载
                    </Button>
                </Stack>
            </Sheet>
        </Drawer>
    );

    return (
        <>
            {tooltipContent ? (
                <Tooltip
                    color="neutral"
                    variant="outlined"
                    title={isDragging ? null : tooltipTitle}
                    placement="top"
                    disableHoverListener={isDragging}
                    arrow={!isDragging}
                >
                    {content}
                </Tooltip>
            ) : (
                content
            )}
            {detailDrawer}
        </>
    );

}
