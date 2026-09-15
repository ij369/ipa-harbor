import React, {
    createContext, useMemo, useState, useEffect, useRef, useCallback, useContext, lazy, Suspense, forwardRef,
} from 'react';
import { Box, Typography, Chip, Stack, CircularProgress, Sheet, Badge, IconButton, ToggleButtonGroup } from '@mui/joy';
import { VirtuosoGrid } from 'react-virtuoso';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAppSession, useAppDownload } from '../contexts/AppContext';
import IpaIcon from '../components/IpaIcon';
import IpaDetailDrawer from '../components/IpaDetailDrawer';
import { useAppDetailDialog } from '../hooks/useAppDetailDialog';
import {
    Check,
    Schedule,
    Download,
    ErrorOutline,
    CheckCircle,
    CloudDone,
    InfoOutlined,
    StorageOutlined,
    TagOutlined,
} from '@mui/icons-material';
import formatFileSize from '../utils/formatFileSize.js';
import { useTranslation } from 'react-i18next';
import { NewDownloadButton } from '../components/NewDownloadDialog';
import { useStableJoyDown } from '../hooks/useJoyMedia';

const NewDownloadDialog = lazy(() => import('../components/NewDownloadDialog'));

const STATUS_FILTERS = [
    { key: 'pending', color: 'warning', Icon: Schedule, labelKey: 'pending' },
    { key: 'running', color: 'primary', Icon: Download, labelKey: 'running' },
    { key: 'failed', color: 'danger', Icon: ErrorOutline, labelKey: 'failed' },
    { key: 'completed', color: 'success', Icon: CheckCircle, labelKey: 'completed' },
    { key: 'downloaded', color: 'neutral', Icon: CloudDone, labelKey: 'downloaded' },
];

const GRID_ICON_MIN = 64;
const GRID_ICON_MAX = 96;

function interpolateGridMetric(iconSize, minAt64, maxAt96) {
    const t = (iconSize - GRID_ICON_MIN) / (GRID_ICON_MAX - GRID_ICON_MIN);
    return minAt64 + t * (maxAt96 - minAt64);
}

// 根据 IpaIcon 实际尺寸推算单元格大小（含 hover padding 与双行标签）
function buildGridLayoutFromIconSize(iconSize) {
    const hoverPad = interpolateGridMetric(iconSize, 4, 8);
    const labelArea = interpolateGridMetric(iconSize, 40, 52);
    const cellMargin = interpolateGridMetric(iconSize, 8, 16);

    return {
        iconSize,
        cellWidth: iconSize + hoverPad * 2 + cellMargin,
        // 预留 hover 内边距，避免背景框被裁切
        cellHeight: iconSize + hoverPad * 2 + labelArea + 4,
        gap: interpolateGridMetric(iconSize, 4, 8),
        listPadding: interpolateGridMetric(iconSize, 4, 8),
    };
}

const DETAIL_QUERY_KEY = 'detail';
const DETAIL_OPEN_STATUSES = new Set(['completed', 'downloaded']);

function findDetailItem(items, detailParam) {
    if (!detailParam) {
        return null;
    }

    try {
        const fileName = decodeURIComponent(detailParam);
        return items.find((item) => item.name === fileName) ?? null;
    } catch {
        return null;
    }
}

// 尺寸切换：state 立即更新，仅 CSS 做短过渡；不动画 top/left，避免 Virtuoso 重排发黏
const GRID_SIZE_EASE = '0.12s ease-out';
const GRID_ITEM_TRANSITION = `width ${GRID_SIZE_EASE}, height ${GRID_SIZE_EASE}`;
const GRID_LIST_TRANSITION = `gap ${GRID_SIZE_EASE}, padding-top ${GRID_SIZE_EASE}, padding-right ${GRID_SIZE_EASE}, padding-bottom ${GRID_SIZE_EASE}, padding-left ${GRID_SIZE_EASE}`;

// Virtuoso 内联 style 可能带 padding 简写，与 paddingTop 等混用会触发 React 警告
function stripPaddingShorthand(style) {
    if (!style) {
        return {};
    }

    const {
        padding,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        ...rest
    } = style;

    return rest;
}

const DownloadGridMetricsContext = createContext(buildGridLayoutFromIconSize(GRID_ICON_MAX));

const downloadGridComponents = {
    List: forwardRef(function DownloadGridList({ style, children, ...props }, ref) {
        const { gap, listPadding } = useContext(DownloadGridMetricsContext);
        return (
            <div
                ref={ref}
                {...props}
                style={{
                    ...stripPaddingShorthand(style),
                    display: 'flex',
                    flexWrap: 'wrap',
                    width: '100%',
                    margin: 0,
                    paddingTop: listPadding,
                    paddingRight: listPadding,
                    paddingBottom: listPadding,
                    paddingLeft: listPadding,
                    gap,
                    overflowX: 'hidden',
                    boxSizing: 'border-box',
                    transition: GRID_LIST_TRANSITION,
                }}
            >
                {children}
            </div>
        );
    }),
    Item: ({ children, style, ...props }) => {
        const { cellWidth, cellHeight } = useContext(DownloadGridMetricsContext);
        return (
            <div
                {...props}
                style={{
                    ...stripPaddingShorthand(style),
                    width: cellWidth,
                    height: cellHeight,
                    flex: 'none',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    padding: 0,
                    boxSizing: 'border-box',
                    overflow: 'visible',
                    transition: GRID_ITEM_TRANSITION,
                }}
            >
                {children}
            </div>
        );
    },
};

export default function DownloadManager() {
    const { t } = useTranslation();
    const isCompact = useStableJoyDown('sm');
    const gridIconSize = isCompact ? GRID_ICON_MIN : GRID_ICON_MAX;
    const gridLayout = useMemo(
        () => buildGridLayoutFromIconSize(gridIconSize),
        [gridIconSize],
    );
    const { user, isAuthenticated } = useAppSession();
    const { taskList, fileList, downloadDataReady } = useAppDownload();
    const iconRegion = user?.region;
    const [searchParams, setSearchParams] = useSearchParams();
    const detailParam = searchParams.get(DETAIL_QUERY_KEY);
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [subLabelMode, setSubLabelMode] = useState('version');
    const [newDownloadDialogOpen, setNewDownloadDialogOpen] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [selectedDetailItem, setSelectedDetailItem] = useState(null);
    const detailRestoreAttemptedRef = useRef(null);
    const { openByAppId: openAppDetailById, dialog: appDetailDialog } = useAppDetailDialog({ syncQuery: true });

    const clearDetailParam = useCallback(() => {
        setSearchParams((prev) => {
            if (!prev.has(DETAIL_QUERY_KEY)) {
                return prev;
            }
            const next = new URLSearchParams(prev);
            next.delete(DETAIL_QUERY_KEY);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const closeDetailDrawer = useCallback(() => {
        setDetailDrawerOpen(false);
        clearDetailParam();
    }, [clearDetailParam]);

    const handleDetailExitComplete = useCallback(() => {
        setSelectedDetailItem(null);
    }, []);

    const handleViewAppDetail = useCallback(async (appId) => {
        closeDetailDrawer();
        await openAppDetailById(appId, { suppressQueryWrite: true });
    }, [closeDetailDrawer, openAppDetailById]);

    const openDetailDrawer = useCallback((item) => {
        setSelectedDetailItem(item);
        setDetailDrawerOpen(true);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set(DETAIL_QUERY_KEY, item.name);
            return next;
        }, { replace: false });
    }, [setSearchParams]);

    const { allItems, statusCounts } = useMemo(() => {
        const fileByName = new Map();
        if (fileList.files) {
            for (const file of fileList.files) {
                fileByName.set(file.name, file);
            }
        }

        const taskNames = new Set();
        const items = [];
        const counts = {
            pending: 0,
            running: 0,
            failed: 0,
            completed: 0,
            downloaded: 0,
        };

        ['pending', 'running', 'failed', 'completed'].forEach(status => {
            if (taskList[status]) {
                taskList[status].forEach(task => {
                    // 从任务中提取应用信息
                    const appId = task.appId || task.id;
                    const fileName = task.fileName || `${appId}_${task.actualVersionId || task.versionId || 'latest'}.ipa`;

                    // 提取进度信息
                    const progressInfo = task.progress || {};
                    const percentage = progressInfo.percentage || 0;
                    const sizeProgress = progressInfo.sizeProgress || progressInfo.description || task.progressText || '';

                    // 对于completed状态的任务，尝试从fileList中获取完整的metadata信息
                    let itemData = {
                        id: appId,
                        name: fileName,
                        status: status,
                        progress: percentage,
                        sizeProgress: sizeProgress,
                        downloadSpeed: progressInfo.downloadSpeed || '',
                        taskId: task.taskId || task.id,
                        type: 'task',
                        bundleId: task.bundleId
                    };

                    // 如果是completed状态，尝试从fileList中获取metadata
                    if (status === 'completed') {
                        const matchingFile = fileByName.get(fileName);
                        if (matchingFile) {
                            itemData = {
                                ...itemData,
                                size: matchingFile.size,
                                itemId: matchingFile.itemId,
                                bundleDisplayName: matchingFile.bundleDisplayName,
                                artistName: matchingFile.artistName,
                                appleId: matchingFile.appleId,
                                bundleShortVersionString: matchingFile.bundleShortVersionString,
                                bundleVersion: matchingFile.bundleVersion,
                                productType: matchingFile.productType,
                                softwareVersionBundleId: matchingFile.softwareVersionBundleId,
                                softwareVersionExternalIdentifier: matchingFile.softwareVersionExternalIdentifier,
                                releaseDate: matchingFile.releaseDate,
                                firstReleaseDate: matchingFile.firstReleaseDate,
                                createdAt: matchingFile.createdAt,
                                modifiedAt: matchingFile.modifiedAt
                            };
                        }
                    }

                    taskNames.add(fileName);
                    counts[status] += 1;
                    items.push(itemData);
                });
            }
        });

        // 已下载的文件（不在任务列表中的）
        if (fileList.files) {
            for (const file of fileList.files) {
                if (taskNames.has(file.name)) {
                    continue;
                }

                // 优先使用 metadata 中的 itemId，兼容自定义文件名模板
                const appId = file.itemId || file.name.match(/^(\d+)_/)?.[1];

                counts.downloaded += 1;
                items.push({
                    id: appId || file.name,
                    name: file.name,
                    status: 'downloaded',
                    progress: 100,
                    size: file.size,
                    type: 'file',
                    itemId: file.itemId,
                    bundleDisplayName: file.bundleDisplayName,
                    artistName: file.artistName,
                    appleId: file.appleId,
                    bundleShortVersionString: file.bundleShortVersionString,
                    bundleVersion: file.bundleVersion,
                    productType: file.productType,
                    softwareVersionBundleId: file.softwareVersionBundleId,
                    softwareVersionExternalIdentifier: file.softwareVersionExternalIdentifier,
                    releaseDate: file.releaseDate,
                    firstReleaseDate: file.firstReleaseDate,
                    createdAt: file.createdAt,
                    modifiedAt: file.modifiedAt
                });
            }
        }

        return { allItems: items, statusCounts: counts };
    }, [taskList, fileList]);

    const filteredItems = useMemo(() => {
        if (selectedFilter === 'all') {
            return allItems;
        }
        return allItems.filter(item => item.status === selectedFilter);
    }, [allItems, selectedFilter]);

    const showTooltipAppleId = useMemo(() => {
        const appleIds = allItems
            .filter((item) => DETAIL_OPEN_STATUSES.has(item.status) && item.appleId)
            .map((item) => item.appleId);
        if (appleIds.length === 0) {
            return false;
        }
        return new Set(appleIds).size > 1;
    }, [allItems]);

    const loggedInAppleId = isAuthenticated ? user?.email ?? null : null;

    const renderGridItem = useCallback((index, item) => {
        if (!item) {
            return null;
        }
        return (
            <IpaIcon
                item={item}
                size={gridIconSize}
                country={iconRegion}
                onOpenDetail={openDetailDrawer}
                subLabelMode={subLabelMode}
                showTooltipAppleId={showTooltipAppleId}
                loggedInAppleId={loggedInAppleId}
            />
        );
    }, [gridIconSize, iconRegion, openDetailDrawer, subLabelMode, showTooltipAppleId, loggedInAppleId]);

    const computeGridItemKey = useCallback(
        (index, item) => item?.name ?? index,
        [],
    );

    useEffect(() => {
        if (!detailParam) {
            detailRestoreAttemptedRef.current = null;
            return;
        }

        if (!downloadDataReady) {
            return;
        }

        if (detailRestoreAttemptedRef.current === detailParam) {
            return;
        }
        detailRestoreAttemptedRef.current = detailParam;

        const item = findDetailItem(allItems, detailParam);
        if (item && DETAIL_OPEN_STATUSES.has(item.status)) {
            if (selectedFilter !== 'all' && item.status !== selectedFilter) {
                setSelectedFilter('all');
            }
            setSelectedDetailItem(item);
            setDetailDrawerOpen(true);
            return;
        }

        Swal.fire({
            icon: 'error',
            text: t('ui.recordNotFound'),
            confirmButtonText: t('ui.confirm'),
        });
        setDetailDrawerOpen(false);
        setSelectedDetailItem(null);
        clearDetailParam();
    }, [detailParam, downloadDataReady, allItems, selectedFilter, clearDetailParam, t]);

    const openNewDownload = (e) => {
        e?.stopPropagation?.();
        setNewDownloadDialogOpen(true);
    };

    const filterChips = STATUS_FILTERS.map(({ key, color, Icon, labelKey }) => {
        const isSelected = selectedFilter === key;
        const count = statusCounts[key];
        const label = t(`ui.${labelKey}`);

        if (isCompact) {
            return (
                <Badge
                    key={key}
                    badgeContent={count}
                    color={color}
                    size="sm"
                    invisible={count === 0}
                    anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                    sx={{
                        '& .MuiBadge-badge': {
                            top: 4,
                            right: 4,
                            minWidth: 16,
                            height: 16,
                            fontSize: '0.65rem',
                        },
                    }}
                >
                    <IconButton
                        size="sm"
                        variant={isSelected ? 'solid' : 'soft'}
                        color={color}
                        onClick={() => setSelectedFilter(isSelected ? 'all' : key)}
                        title={`${label}: ${count}`}
                        sx={{
                            '--IconButton-size': '36px',
                            p: 0.75,
                        }}
                    >
                        <Icon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Badge>
            );
        }

        return (
            <Chip
                key={key}
                color={color}
                variant={isSelected ? 'solid' : 'soft'}
                onClick={() => setSelectedFilter(isSelected ? 'all' : key)}
                sx={{ cursor: 'pointer' }}
                startDecorator={isSelected ? <Check /> : null}
            >
                {`${label}: ${count}`}
            </Chip>
        );
    });

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            py: 3,
        }} className="app-shell-page-content">
            <Stack
                direction="row"
                gap={2}
                sx={{ flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}
                justifyContent="space-between"
            >
                <Typography
                    level="h2"
                    className="app-shell-page-title"
                    sx={{ mb: 3, flexShrink: 0, cursor: 'pointer' }}
                    onClick={() => { setSelectedFilter('all'); }}
                >
                    {t('ui.downloadManagerTitle')}
                </Typography>
                <NewDownloadButton compact={isCompact} onClick={openNewDownload} />
            </Stack>

            <Suspense fallback={null}>
                <NewDownloadDialog
                    isOpen={newDownloadDialogOpen}
                    onClose={() => setNewDownloadDialogOpen(false)}
                />
            </Suspense>

            <Stack
                direction="row"
                gap={isCompact ? 1 : 2}
                sx={{ mb: 2, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}
            >
                {filterChips}
            </Stack>

            {!downloadDataReady ? (
                <Box sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <CircularProgress />
                </Box>
            ) : filteredItems.length > 0 ? (
                <Sheet
                    variant="outlined"
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        borderRadius: 'md',
                        overflow: 'hidden',
                        position: 'relative',
                    }}
                >
                    <Box sx={{ position: 'absolute', inset: 0 }}>
                        <DownloadGridMetricsContext.Provider value={gridLayout}>
                            <VirtuosoGrid
                                style={{ height: '100%', width: '100%' }}
                                data={filteredItems}
                                components={downloadGridComponents}
                                computeItemKey={computeGridItemKey}
                                itemContent={renderGridItem}
                                increaseViewportBy={{ top: 200, bottom: 200 }}
                            />
                        </DownloadGridMetricsContext.Provider>
                    </Box>
                </Sheet>
            ) : (
                <Box sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                }}>
                    <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                        {t('ui.noRecords')}
                    </Typography>
                    <Typography
                        level="body-sm"
                        sx={{ color: 'text.tertiary', mt: 1, cursor: selectedFilter === 'all' ? 'auto' : 'pointer' }}
                        onClick={() => { setSelectedFilter('all'); }}
                    >
                        {selectedFilter === 'all' ? t('ui.goToHomeSearch') : t('ui.clearFilter')}
                    </Typography>
                </Box>
            )}

            <IpaDetailDrawer
                item={selectedDetailItem}
                open={detailDrawerOpen}
                onClose={closeDetailDrawer}
                onExitComplete={handleDetailExitComplete}
                onViewAppDetail={handleViewAppDetail}
            />

            {appDetailDialog}

            {fileList.totalSize > 0 && (
                <Box
                    role="button"
                    tabIndex={0}
                    aria-label={subLabelMode === 'version' ? t('ui.subLabelModeVersion') : t('ui.subLabelModeSize')}
                    onClick={() => setSubLabelMode((prev) => (prev === 'version' ? 'size' : 'version'))}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSubLabelMode((prev) => (prev === 'version' ? 'size' : 'version'));
                        }
                    }}
                    sx={{
                        flexShrink: 0,
                        mt: 1,
                        p: 1,
                        px: 1.8,
                        backgroundColor: 'background.level1',
                        borderRadius: 'md',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        cursor: 'pointer',
                        userSelect: 'none',
                    }}
                >
                    <Typography
                        level="body-xs"
                        startDecorator={<InfoOutlined sx={{ fontSize: 14, opacity: 0.7 }} />}
                        sx={{ color: 'text.secondary', minWidth: 0, pointerEvents: 'none' }}
                    >
                        {t('ui.totalFiles', { count: fileList.total, size: formatFileSize(fileList.totalSize) })}
                    </Typography>
                    <ToggleButtonGroup
                        size="sm"
                        variant="soft"
                        value={subLabelMode}
                        aria-hidden
                        sx={{ pointerEvents: 'none', flexShrink: 0 }}
                    >
                        <IconButton value="version" sx={{ '--IconButton-size': '24px' }}>
                            <TagOutlined sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton value="size" sx={{ '--IconButton-size': '24px' }}>
                            <StorageOutlined sx={{ fontSize: 14 }} />
                        </IconButton>
                    </ToggleButtonGroup>
                </Box>
            )}
        </Box>
    );
}

