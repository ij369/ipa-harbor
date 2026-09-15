import React, { memo, useMemo, useCallback } from 'react';
import {
    Box, Stack, Typography, Divider, Link,
} from '@mui/joy';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import Person from '@mui/icons-material/Person';
import MouseTooltip from './MouseTooltip';
import IpaAppIcon from './IpaAppIcon';
import { downloadApp, deleteTask, isRateLimitError, resolveClientErrorMessage } from '../utils/api';
import Swal from 'sweetalert2';
import formatFileSize from '../utils/formatFileSize.js';
import { useTranslation } from 'react-i18next';
import { getIntlLocale } from '../i18n';

function extractAppInfo(fileName) {
    if (!fileName) return { appId: null, versionId: null };
    const match = fileName.match(/^(\d+)_(.+)\.ipa$/);
    return match ? { appId: match[1], versionId: match[2] } : { appId: null, versionId: null };
}

function formatTooltipDate(dateString, t) {
    if (!dateString) return t('ui.unknown');
    try {
        const lng = localStorage.getItem('language') || 'en';
        return new Date(dateString).toLocaleString(getIntlLocale(lng));
    } catch {
        return t('ui.dateFormatError');
    }
}

function normalizeAppleId(value) {
    return value?.trim().toLowerCase() ?? '';
}

function buildTooltipLines(fields) {
    const details = fields
        .filter((field) => field.value != null && field.value !== '')
        .map((field) => `${field.label}: ${field.value}`);

    return details.length ? details.join('\n') : null;
}

function areIpaIconPropsEqual(prev, next) {
    if (
        prev.size !== next.size
        || prev.subLabelMode !== next.subLabelMode
        || prev.isDragging !== next.isDragging
        || prev.country !== next.country
        || prev.onOpenDetail !== next.onOpenDetail
        || prev.showTooltipAppleId !== next.showTooltipAppleId
        || prev.loggedInAppleId !== next.loggedInAppleId
    ) {
        return false;
    }

    const a = prev.item;
    const b = next.item;
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.name !== b.name || a.status !== b.status) return false;

    if (a.status === 'pending' || a.status === 'running') {
        return (
            a.progress === b.progress
            && a.sizeProgress === b.sizeProgress
            && a.downloadSpeed === b.downloadSpeed
        );
    }

    if (a.status === 'failed') {
        return a.taskId === b.taskId && a.bundleId === b.bundleId;
    }

    if (a.status === 'completed' || a.status === 'downloaded') {
        return (
            a.bundleDisplayName === b.bundleDisplayName
            && a.bundleShortVersionString === b.bundleShortVersionString
            && a.appleId === b.appleId
            && a.size === b.size
        );
    }

    return a.name === b.name;
}

function IpaIcon({
    item,
    size = 128,
    isDragging = false,
    onOpenDetail,
    subLabelMode = 'version',
    country,
    showTooltipAppleId = false,
    loggedInAppleId = null,
}) {
    const { t } = useTranslation();
    const {
        id: appId,
        name,
        status,
        progress = 0,
        sizeProgress,
        downloadSpeed,
        taskId,
        bundleId,
        itemId,
        bundleDisplayName,
        artistName,
        appleId,
        bundleShortVersionString,
        bundleVersion,
        productType,
        softwareVersionBundleId,
        softwareVersionExternalIdentifier,
        releaseDate,
        firstReleaseDate,
        size: fileSize,
        createdAt,
    } = item;

    const REF_ICON_SIZE = 96;
    const scale = size / REF_ICON_SIZE;
    const labelFontSize = `${0.9 * scale}rem`;
    const subLabelFontSize = `${0.75 * scale}rem`;
    const progressBarHeight = Math.max(6, Math.round(15 * scale));
    const progressBarBottom = Math.max(3, Math.round(9 * scale));
    const labelStackSpacing = `${0.4 * scale}rem`;
    const hoverPadding = `${8 * scale}px`;
    const sizeTransition = 'width 0.12s ease-out, height 0.12s ease-out, font-size 0.12s ease-out, padding 0.12s ease-out, bottom 0.12s ease-out, border-radius 0.12s ease-out, gap 0.12s ease-out';
    const labelSx = {
        fontSize: labelFontSize,
        transition: sizeTransition,
    };
    const subLabelSx = {
        fontSize: subLabelFontSize,
        transition: sizeTransition,
    };

    const { appId: extractedAppId, versionId } = extractAppInfo(name);
    const sidecarFileBase = useMemo(() => {
        const base = name?.replace(/\.ipa$/i, '') ?? '';
        return /^\d+_\d+$/.test(base) ? base : undefined;
    }, [name]);
    const finalAppId = appId || extractedAppId;
    const displayAppId = finalAppId || (itemId != null ? String(itemId) : null);
    const displayVersionId = softwareVersionExternalIdentifier || versionId;
    const isMetadataPending = ['completed', 'downloaded'].includes(status) && !bundleDisplayName;

    const getCompletedSubLabel = () => {
        if (subLabelMode === 'size') {
            return formatFileSize(fileSize) || t('ui.unknown');
        }
        if (bundleShortVersionString) {
            return bundleShortVersionString;
        }
        return formatFileSize(fileSize) || t('ui.unknown');
    };

    const tooltipContent = useMemo(() => {
        if (status === 'pending' || status === 'running') {
            return buildTooltipLines([
                { label: t('ui.transferredSize'), value: sizeProgress },
                { label: t('ui.bundleId'), value: bundleId },
                { label: t('ui.appId'), value: displayAppId },
                { label: t('ui.versionId'), value: displayVersionId },
                { label: t('ui.taskId'), value: taskId },
                { label: t('ui.fileName'), value: name },
            ]);
        }

        if (status === 'failed') {
            return buildTooltipLines([
                { label: t('ui.bundleId'), value: bundleId },
                { label: t('ui.appId'), value: displayAppId },
                { label: t('ui.versionId'), value: displayVersionId },
                { label: t('ui.taskId'), value: taskId },
                { label: t('ui.fileName'), value: name },
            ]);
        }

        return buildTooltipLines([
            { label: t('ui.appName_label'), value: bundleDisplayName },
            { label: t('ui.developer'), value: artistName },
            { label: t('ui.appVersion'), value: bundleShortVersionString },
            { label: t('ui.buildVersion'), value: bundleVersion },
            { label: t('ui.bundleId'), value: softwareVersionBundleId },
            { label: t('ui.appId'), value: displayAppId },
            { label: t('ui.versionId'), value: displayVersionId },
            { label: t('ui.productType'), value: productType },
            { label: t('ui.fileSize'), value: fileSize ? formatFileSize(fileSize) : null },
            { label: t('ui.releaseDate'), value: releaseDate ? formatTooltipDate(releaseDate, t) : null },
            { label: t('ui.firstReleaseDate'), value: firstReleaseDate ? formatTooltipDate(firstReleaseDate, t) : null },
            { label: t('ui.downloadTime'), value: createdAt ? formatTooltipDate(createdAt, t) : null },
            { label: t('ui.fileName'), value: name },
        ]);
    }, [
        t,
        status,
        sizeProgress,
        bundleId,
        displayAppId,
        displayVersionId,
        taskId,
        name,
        bundleDisplayName,
        artistName,
        appleId,
        bundleShortVersionString,
        bundleVersion,
        softwareVersionBundleId,
        productType,
        fileSize,
        releaseDate,
        firstReleaseDate,
        createdAt,
    ]);

    const tooltipAppleIdLine = useMemo(() => {
        if (
            !appleId
            || status === 'pending'
            || status === 'running'
            || status === 'failed'
        ) {
            return null;
        }

        const differsFromLoggedIn = loggedInAppleId
            && normalizeAppleId(appleId) !== normalizeAppleId(loggedInAppleId);
        if (!showTooltipAppleId && !differsFromLoggedIn) {
            return null;
        }

        return appleId;
    }, [showTooltipAppleId, loggedInAppleId, appleId, status]);

    const tooltipHeaderPrimary = useMemo(() => {
        if (bundleDisplayName) {
            return bundleDisplayName;
        }
        if (status === 'running') {
            return t('ui.downloading');
        }
        if (status === 'pending') {
            return t('ui.waiting');
        }
        if (status === 'failed') {
            return t('ui.failed');
        }
        return null;
    }, [bundleDisplayName, status, t]);

    const tooltipHeaderSecondary = useMemo(() => {
        if (bundleShortVersionString) {
            return bundleShortVersionString;
        }
        if (status === 'pending' || status === 'running') {
            if (downloadSpeed) {
                return downloadSpeed;
            }
            if (progress > 0) {
                return `${progress}%`;
            }
        }
        return null;
    }, [bundleShortVersionString, status, downloadSpeed, progress]);

    const handleRetryDownload = useCallback(async (e) => {
        e.stopPropagation();
        if (!finalAppId || !bundleId) {
            Swal.fire({
                icon: 'error',
                title: t('ui.retryFailed'),
                text: t('ui.cannotGetAppId'),
                confirmButtonText: t('ui.confirm'),
            });
            return;
        }

        try {
            const response = await downloadApp(finalAppId, versionId || 'latest', bundleId);
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: t('ui.retryTaskCreated'),
                    text: `${t('ui.taskId')}: ${response.taskId}`,
                    position: 'top',
                    toast: true,
                    timer: 1500,
                    showConfirmButton: false,
                });
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('重试下载失败:', error.message);
            Swal.fire({
                icon: 'error',
                title: t('ui.retryFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        }
    }, [finalAppId, versionId, bundleId, t]);

    const handleDeleteTask = useCallback(async (e) => {
        e.stopPropagation();

        const result = await Swal.fire({
            title: t('ui.confirmDelete'),
            text: `${t('ui.confirmDeleteTask')} ${name}`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('ui.delete'),
            cancelButtonText: t('ui.cancel'),
            confirmButtonColor: '#d33',
        });

        if (!result.isConfirmed) {
            return;
        }

        try {
            const response = name
                ? await deleteTask(null, name)
                : await deleteTask(taskId);

            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: t('ui.taskDeleted'),
                    timer: 1500,
                    showConfirmButton: false,
                });
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('删除任务失败:', error);
            Swal.fire({
                icon: 'error',
                title: t('ui.deleteFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
        }
    }, [name, taskId, t]);

    const tooltipTitle = (tooltipContent || tooltipAppleIdLine) && (
        <Box sx={{ whiteSpace: 'pre-line', maxWidth: 300 }}>
            {(tooltipHeaderPrimary || tooltipHeaderSecondary) && (
                <>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                        {tooltipHeaderPrimary && (
                            <Typography level="body-xs">{tooltipHeaderPrimary}</Typography>
                        )}
                        {tooltipHeaderSecondary && (
                            <Typography level="body-xs" sx={{ flexShrink: 0 }}>
                                {tooltipHeaderSecondary}
                            </Typography>
                        )}
                    </Stack>
                    <Divider sx={{ my: 0.5 }} />
                </>
            )}
            {tooltipContent ? (
                <Typography level="body-xs">{tooltipContent}</Typography>
            ) : null}
            {tooltipAppleIdLine ? (
                <>
                    <Divider sx={{ my: 0.5 }} />
                    <Typography
                        level="body-xs"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                        <Person sx={{ fontSize: '1em', color: 'text.tertiary', flexShrink: 0 }} />
                        {tooltipAppleIdLine}
                    </Typography>
                </>
            ) : null}
        </Box>
    );

    const itemHoverSx = {
        borderRadius: '12px',
        p: hoverPadding,
        boxSizing: 'border-box',
        maxWidth: '100%',
        transition: `background-color 0.22s ease, box-shadow 0.22s ease, ${sizeTransition}`,
        '@media (hover: hover)': {
            '&:hover': {
                backgroundColor: 'primary.softBg',
                boxShadow: 'inset 0 0 0 1px rgba(var(--joy-palette-primary-mainChannel) / 0.18)',
                position: 'relative',
                zIndex: 1,
            },
        },
    };

    const wrapLabelTooltip = (labels) => {
        if (!tooltipContent && !tooltipAppleIdLine) return labels;
        return (
            <MouseTooltip title={isDragging ? null : tooltipTitle} disabled={isDragging}>
                {labels}
            </MouseTooltip>
        );
    };

    const renderAppIcon = (iconProps) => (
        <IpaAppIcon {...iconProps} file={iconProps.file ?? sidecarFileBase} />
    );

    const renderContent = () => {
        switch (status) {
            case 'pending':
            case 'running':
                return (
                    <>
                        {/* 图标 + 进度条 */}
                        <Box sx={{ position: 'relative' }}>
                            {renderAppIcon({ appId: finalAppId, size, disabled: true, country })}
                            <Box
                                sx={{
                                    position: 'absolute',
                                    bottom: progressBarBottom,
                                    left: '9%',
                                    right: '9%',
                                    height: progressBarHeight,
                                    padding: scale < 0.85 ? '1px' : '2px',
                                    border: `${Math.max(0.8, 1.2 * scale)}px solid rgba(0,0,0,0.2)`,
                                    borderRadius: `${Math.max(8, Math.round(16 * scale))}px`,
                                    backgroundColor: 'rgba(255,255,255,0.3)', // 轨道底色
                                    overflow: 'hidden',
                                    boxSizing: 'border-box',
                                    transition: sizeTransition,
                                }}
                            >
                                {/* 进度条 */}
                                <Box
                                    sx={{
                                        height: '100%',
                                        width: `${progress}%`,
                                        backgroundColor: '#007aff',
                                        borderRadius: '6px',
                                        transition: 'width 0.12s ease-out',
                                    }}
                                />
                            </Box>
                        </Box>

                        {/* 描述部分 */}
                        {wrapLabelTooltip(
                            <Stack spacing={labelStackSpacing} alignItems="center" sx={{ width: size, transition: sizeTransition }}>
                                <Typography
                                    sx={{
                                        ...labelSx,
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                    }}
                                >
                                    {/* {status === 'running' ? '下载中' : '等待中'} {progress && progress + '%'} */}
                                    {status === 'running' ? t('ui.downloading') : t('ui.waiting')} {progress && progress + '%'}
                                </Typography>
                                <Typography
                                    sx={{
                                        ...subLabelSx,
                                        textAlign: 'center',
                                        color: '#666',
                                        wordBreak: 'break-all',
                                    }}
                                >
                                    {sizeProgress || downloadSpeed || `${progress}%`}
                                </Typography>
                            </Stack>
                        )}
                    </>
                );

            case 'failed':
                return (
                    <>
                        <Box
                            sx={{
                                position: 'relative',
                                cursor: 'pointer',
                            }}
                            onClick={handleDeleteTask}
                        >
                            {renderAppIcon({ appId: finalAppId, size, disabled: true, country })}
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
                                {/* 删除 */}
                                {t('ui.delete')}
                            </Box>
                        </Box>

                        {wrapLabelTooltip(
                            <Stack
                                spacing="0.1rem"
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
                                <Typography sx={{ ...labelSx, textAlign: 'center' }}>{t('ui.failed')}</Typography>
                                <Link sx={{ ...subLabelSx, textAlign: 'center', color: '#666' }}>
                                    {/* 点击这里重试 */}
                                    {t('ui.clickToRetry')}
                                </Link>
                            </Stack>
                        )}
                    </>
                );

            case 'completed':
            case 'downloaded':
                return (
                    <>
                        {renderAppIcon({ appId: finalAppId, size, country })}
                        {wrapLabelTooltip(
                            <Stack spacing={labelStackSpacing} alignItems="center" sx={{ width: size, transition: sizeTransition }}>
                                <Typography
                                    sx={{
                                        ...labelSx,
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                    }}
                                >
                                    {bundleDisplayName || name}
                                </Typography>
                                {isMetadataPending ? (
                                    <Stack
                                        direction="row"
                                        spacing={0.25}
                                        alignItems="center"
                                        justifyContent="center"
                                        sx={{ width: '100%', color: '#666' }}
                                    >
                                        <HourglassTopIcon sx={{ fontSize: subLabelFontSize }} />
                                        <Typography sx={{ ...subLabelSx, textAlign: 'center', color: 'inherit' }}>
                                            {t('ui.parsingMetadata')}
                                        </Typography>
                                    </Stack>
                                ) : (
                                    <Typography sx={{ ...subLabelSx, textAlign: 'center', color: '#666' }}>
                                        {getCompletedSubLabel()}
                                    </Typography>
                                )}
                            </Stack>
                        )}
                    </>
                );

            default:
                return (
                    <>
                        {renderAppIcon({ appId: finalAppId, size, country })}
                        {wrapLabelTooltip(
                            <Stack spacing={labelStackSpacing} alignItems="center" sx={{ width: size, transition: sizeTransition }}>
                                <Typography
                                    sx={{
                                        ...labelSx,
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                    }}
                                >
                                    {/* {name || '未知应用'} */}
                                    {name || t('ui.unknown')}
                                </Typography>
                                <Typography sx={{ ...subLabelSx, textAlign: 'center', color: '#666' }}>
                                    —
                                </Typography>
                            </Stack>
                        )}
                    </>
                );
        }
    };

    const handleClick = useCallback(() => {
        if (['completed', 'downloaded'].includes(status)) {
            onOpenDetail?.(item);
        }
    }, [status, onOpenDetail, item]);

    return (
        <Stack
            alignItems="center"
            spacing={labelStackSpacing}
            sx={{
                width: `calc(${size}px + ${hoverPadding} * 2)`,
                userSelect: 'none',
                position: 'relative',
                display: 'inline-block',
                transition: sizeTransition,
                ...itemHoverSx,
            }}
            onClick={handleClick}
        >
            {renderContent()}
        </Stack>
    );
}

export default memo(IpaIcon, areIpaIconPropsEqual);
