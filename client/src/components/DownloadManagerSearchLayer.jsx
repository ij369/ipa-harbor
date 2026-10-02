import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, IconButton, Input, Modal, Stack, Typography,
} from '@mui/joy';
import { ArrowBack, AutoMode, Close, Search } from '@mui/icons-material';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GroupedVirtuoso } from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import IpaAppIcon from './IpaAppIcon';
import ResponsiveModalDialog from './ResponsiveModalDialog';
import AlphabetIndexBar, {
    SEARCH_GROUP_HEADER_HEIGHT,
    SEARCH_RESULT_ROW_HEIGHT,
} from './AlphabetIndexBar';
import {
    buildAlphabetGroups,
    createLocaleSearchContext,
} from '../utils/localeSearch';
import {
    getAppGroupIndexLetter,
    groupDownloadItemsByApp,
    searchAppGroups,
} from '../utils/localeSearch/downloadAppGroups';
import formatFileSize from '../utils/formatFileSize.js';
import {
    deleteTask,
    downloadApp,
    getAppDetailsBatched,
    isRateLimitError,
    resolveClientErrorMessage,
} from '../utils/api';
import { AppDetailLatestDownloadControls } from './AppDetailDownloadControls';
import { useFullscreenDialog } from '../hooks/useJoyMedia';
import Swal from 'sweetalert2';

const EASE_IN = [0.4, 0, 1, 1];

function extractSidecarFileBase(name) {
    const base = name?.replace(/\.ipa$/i, '') ?? '';
    return /^\d+_\d+$/.test(base) ? base : undefined;
}

/** 从下载条目提取 App Store trackId，去重 */
function extractNumericAppIds(items) {
    const ids = new Set();

    for (const item of items ?? []) {
        for (const candidate of [item.id, item.itemId]) {
            const numeric = Number(candidate);
            if (Number.isFinite(numeric) && numeric > 0) {
                ids.add(numeric);
            }
        }

        const match = item.name?.match(/^(\d+)_/);
        if (match) {
            const numeric = Number(match[1]);
            if (Number.isFinite(numeric) && numeric > 0) {
                ids.add(numeric);
            }
        }
    }

    return [...ids];
}

function normalizeVersionString(value) {
    return String(value ?? '').trim();
}

function versionStringsMatch(localVersion, storeVersion) {
    const local = normalizeVersionString(localVersion);
    const store = normalizeVersionString(storeVersion);
    if (!local || !store) {
        return false;
    }
    return local === store;
}

function getVersionLabel(item) {
    if (item.bundleShortVersionString) {
        return item.bundleShortVersionString;
    }
    if (item.bundleVersion) {
        return String(item.bundleVersion);
    }
    const match = item.name?.match(/^\d+_(.+)\.ipa$/i);
    if (match?.[1]) {
        return match[1];
    }
    return item.name?.replace(/\.ipa$/i, '') || '—';
}

function getItemVersionForCompare(item) {
    if (item.bundleShortVersionString) {
        return item.bundleShortVersionString;
    }
    return getVersionLabel(item);
}

function getStoreVersionForApp(storeVersionByAppId, appId) {
    if (appId == null || !storeVersionByAppId) {
        return null;
    }
    return storeVersionByAppId.get(String(appId)) ?? null;
}

function hasLocalStoreVersion(localItems, storeVersion) {
    if (!storeVersion) {
        return false;
    }
    return localItems.some((item) => versionStringsMatch(getItemVersionForCompare(item), storeVersion));
}

function resolveAppGroupBundleId(appGroup) {
    for (const item of appGroup?.versions ?? []) {
        if (item.bundleId) {
            return item.bundleId;
        }
        if (item.softwareVersionBundleId) {
            return item.softwareVersionBundleId;
        }
    }
    return null;
}

/** 从本地条目推断最大 versionId，供 getLatestTaskInfo 匹配已下载文件 */
function resolveStoreLatestVersionId(appGroup) {
    let maxId = null;
    for (const item of appGroup?.versions ?? []) {
        const raw = item.softwareVersionExternalIdentifier ?? item.versionId;
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
            continue;
        }
        if (maxId === null || numeric > maxId) {
            maxId = numeric;
        }
    }
    return maxId != null ? String(maxId) : null;
}

function getStoreVersionTextSx(isLatest) {
    return {
        color: isLatest ? 'success.plainColor' : 'warning.plainColor',
    };
}

function AppSearchResultRow({
    appGroup,
    country,
    onSelect,
    storeVersionByAppId,
    showStoreVersion,
    storeVersionLoading,
}) {
    const { t } = useTranslation();
    const storeVersion = getStoreVersionForApp(storeVersionByAppId, appGroup.appId);
    const isLatest = hasLocalStoreVersion(appGroup.versions, storeVersion);
    const newest = appGroup.versions[0];
    const sidecarFileBase = extractSidecarFileBase(newest?.name);
    const versionCount = appGroup.versions.length;
    const artistSubline = appGroup.artistName ?? '';

    return (
        <Box
            role="button"
            tabIndex={0}
            onClick={() => onSelect(appGroup)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(appGroup);
                }
            }}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.25,
                minHeight: SEARCH_RESULT_ROW_HEIGHT,
                boxSizing: 'border-box',
                cursor: 'pointer',
                borderRadius: 'sm',
                '&:hover': {
                    bgcolor: 'background.level1',
                },
            }}
        >
            <IpaAppIcon
                appId={appGroup.appId}
                size={48}
                country={country}
                file={sidecarFileBase}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm" sx={{ wordBreak: 'break-word' }}>
                    {appGroup.displayName}
                </Typography>
                {showStoreVersion ? (
                    storeVersionLoading && !storeVersion ? (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                            …
                        </Typography>
                    ) : storeVersion ? (
                        <Typography
                            level="body-xs"
                            sx={{ mt: 0.25, ...getStoreVersionTextSx(isLatest) }}
                            title={isLatest
                                ? t('ui.downloadManagerSearchStoreVersionLatest')
                                : t('ui.downloadManagerSearchStoreVersionNewer')}
                        >
                            {storeVersion}
                        </Typography>
                    ) : (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                            {t('ui.downloadManagerSearchStoreVersionUnknown')}
                        </Typography>
                    )
                ) : artistSubline ? (
                    <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.25 }}>
                        {artistSubline}
                    </Typography>
                ) : null}
            </Box>
            {versionCount > 1 ? (
                <Chip size="sm" variant="soft" color="neutral" sx={{ flexShrink: 0 }}>
                    {versionCount}
                </Chip>
            ) : null}
        </Box>
    );
}

function VersionSelectRow({ item, onSelect, storeVersion, showStoreVersion }) {
    const { t } = useTranslation();
    const versionLabel = getVersionLabel(item);
    const isLatest = versionStringsMatch(getItemVersionForCompare(item), storeVersion);
    const metaParts = [
        item.size ? formatFileSize(item.size) : null,
        item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null,
        item.status ? t(`ui.${item.status}`, { defaultValue: item.status }) : null,
    ].filter(Boolean);

    return (
        <Box
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(item);
                }
            }}
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                px: 2,
                py: 1.5,
                boxSizing: 'border-box',
                cursor: 'pointer',
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                    bgcolor: 'background.level1',
                },
            }}
        >
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography
                        level="title-sm"
                        sx={showStoreVersion && storeVersion
                            ? getStoreVersionTextSx(isLatest)
                            : undefined}
                    >
                        {versionLabel}
                    </Typography>
                    {item.bundleShortVersionString && item.bundleVersion ? (
                        <Chip size="sm" variant="plain" color="neutral">
                            ({item.bundleVersion})
                        </Chip>
                    ) : null}
                </Stack>
                {metaParts.length > 0 ? (
                    <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.25 }}>
                        {metaParts.join(' · ')}
                    </Typography>
                ) : (
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                        {item.name}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

function VersionPickerPanel({
    appGroup,
    onBack,
    onSelect,
    prefersReducedMotion,
    storeVersionByAppId,
    showStoreVersion,
    downloadingLatest,
    onDownload,
    onDeleteTask,
}) {
    const { t } = useTranslation();
    const storeVersion = getStoreVersionForApp(storeVersionByAppId, appGroup.appId);
    const bundleId = resolveAppGroupBundleId(appGroup);
    const preferRedownload = hasLocalStoreVersion(appGroup.versions, storeVersion);
    const storeLatestVersionId = resolveStoreLatestVersionId(appGroup);

    return (
        <Box
            component={motion.div}
            initial={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
            animate={prefersReducedMotion
                ? { opacity: 1, transition: { duration: 0 } }
                : { x: 0, transition: { type: 'spring', duration: 0.26, bounce: 0.02 } }}
            exit={prefersReducedMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { x: '100%', transition: { x: { duration: 0.18, ease: EASE_IN } } }}
            className="download-manager-search-safe-x"
            sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.surface',
                boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.08)',
                boxSizing: 'border-box',
            }}
        >
            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                    px: 2,
                    py: 1.5,
                    flexShrink: 0,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <IconButton
                    variant="plain"
                    color="neutral"
                    aria-label={t('ui.downloadManagerSearchBack')}
                    onClick={onBack}
                    sx={{ flexShrink: 0 }}
                >
                    <ArrowBack />
                </IconButton>
                <Typography
                    id="download-manager-search-version-title"
                    level="title-md"
                    sx={{ flex: 1, minWidth: 0 }}
                    noWrap
                >
                    {appGroup.displayName}
                </Typography>
                {showStoreVersion && appGroup.appId && bundleId ? (
                    <Box sx={{ flexShrink: 0, maxWidth: '46%', minWidth: 0 }}>
                        <AppDetailLatestDownloadControls
                            compact
                            preferRedownload={preferRedownload}
                            app={{ trackId: appGroup.appId, bundleId }}
                            storeLatestVersionId={storeLatestVersionId}
                            downloadingLatest={downloadingLatest}
                            showOtaInstall={false}
                            onDownload={(versionId, id) => onDownload(appGroup, versionId, id)}
                            onDeleteTask={onDeleteTask}
                        />
                    </Box>
                ) : null}
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
                {appGroup.versions.map((item) => (
                    <VersionSelectRow
                        key={item.name}
                        item={item}
                        storeVersion={storeVersion}
                        showStoreVersion={showStoreVersion}
                        onSelect={onSelect}
                    />
                ))}
            </Box>
        </Box>
    );
}

function SearchGroupHeader({ letter }) {
    return (
        <Box
            sx={{
                px: 2,
                py: 0.5,
                minHeight: SEARCH_GROUP_HEADER_HEIGHT,
                boxSizing: 'border-box',
                bgcolor: 'background.level1',
                borderBottom: '1px solid',
                borderColor: 'divider',
                position: 'sticky',
                top: 0,
                zIndex: 1,
            }}
        >
            <Typography level="body-xs" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                {letter}
            </Typography>
        </Box>
    );
}

export default function DownloadManagerSearchLayer({
    open,
    onClose,
    items,
    country,
    onSelectItem,
}) {
    const { t, i18n } = useTranslation();
    const fullscreen = useFullscreenDialog();
    const prefersReducedMotion = useReducedMotion();
    const dialogRef = useRef(null);
    const inputRef = useRef(null);
    const virtuosoRef = useRef(null);
    const [query, setQuery] = useState('');
    const [selectedAppGroup, setSelectedAppGroup] = useState(null);
    const [searchInputFocused, setSearchInputFocused] = useState(false);
    const [showStoreVersion, setShowStoreVersion] = useState(false);
    const [storeVersionByAppId, setStoreVersionByAppId] = useState(() => new Map());
    const [storeVersionCheckLoading, setStoreVersionCheckLoading] = useState(false);
    const [downloadingLatestKeys, setDownloadingLatestKeys] = useState(() => new Set());
    const storeVersionFetchSeqRef = useRef(0);
    const lastFetchedAppIdsKeyRef = useRef('');

    const appIds = useMemo(() => extractNumericAppIds(items), [items]);
    const appIdsKey = useMemo(
        () => [...appIds].sort((a, b) => a - b).join(','),
        [appIds],
    );

    useEffect(() => {
        if (!open || !window.visualViewport) {
            return undefined;
        }

        const vv = window.visualViewport;
        const update = () => {
            const el = dialogRef.current;
            if (!el) {
                return;
            }
            el.style.setProperty('--visual-viewport-height', `${vv.height}px`);
        };

        update();
        requestAnimationFrame(update);
        vv.addEventListener('resize', update);

        return () => {
            vv.removeEventListener('resize', update);
            dialogRef.current?.style.removeProperty('--visual-viewport-height');
        };
    }, [open]);

    const searchContext = useMemo(
        () => createLocaleSearchContext(i18n.language),
        [i18n.language],
    );

    const appGroups = useMemo(
        () => groupDownloadItemsByApp(items),
        [items],
    );

    const appResults = useMemo(
        () => searchAppGroups(appGroups, query, searchContext),
        [appGroups, query, searchContext],
    );

    const {
        groups,
        groupCounts,
        flatItems: flatAppGroups,
        letterToGroupIndex,
        availableLetters,
    } = useMemo(
        () => buildAlphabetGroups(
            appResults,
            (appGroup) => getAppGroupIndexLetter(appGroup, searchContext),
        ),
        [appResults, searchContext],
    );

    useEffect(() => {
        if (!open) {
            setQuery('');
            setSelectedAppGroup(null);
            setSearchInputFocused(false);
            setShowStoreVersion(false);
            setStoreVersionByAppId(new Map());
            setStoreVersionCheckLoading(false);
            setDownloadingLatestKeys(new Set());
            lastFetchedAppIdsKeyRef.current = '';
            storeVersionFetchSeqRef.current += 1;
            return undefined;
        }

        const frameId = requestAnimationFrame(() => {
            if (!selectedAppGroup) {
                inputRef.current?.focus();
            }
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                if (selectedAppGroup) {
                    setSelectedAppGroup(null);
                } else {
                    onClose?.();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            cancelAnimationFrame(frameId);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onClose, selectedAppGroup]);

    const handleOpenItem = useCallback((item) => {
        onSelectItem?.(item);
        onClose?.();
    }, [onClose, onSelectItem]);

    const handleAppClick = useCallback((appGroup) => {
        if (showStoreVersion) {
            setSelectedAppGroup(appGroup);
            return;
        }
        if (appGroup.versions.length === 1) {
            handleOpenItem(appGroup.versions[0]);
            return;
        }
        setSelectedAppGroup(appGroup);
    }, [handleOpenItem, showStoreVersion]);

    const handleDownload = useCallback(async (appGroup, versionId, bundleId) => {
        const appId = appGroup?.appId;
        if (!appId || !bundleId) {
            Swal.fire({
                icon: 'error',
                title: t('ui.retryFailed'),
                text: t('ui.cannotGetAppId'),
                confirmButtonText: t('ui.confirm'),
            });
            return;
        }

        const downloadKey = `${appId}:${versionId}`;
        setDownloadingLatestKeys((prev) => new Set(prev).add(downloadKey));
        try {
            const response = await downloadApp(appId, versionId, bundleId);
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: t('ui.taskCreated'),
                    text: `${t('ui.taskId')}: ${response.taskId}`,
                    position: 'top',
                    toast: true,
                    timer: 1500,
                    showConfirmButton: false,
                });
            }
        } catch (error) {
            if (isRateLimitError(error)) {
                return;
            }
            Swal.fire({
                icon: 'error',
                title: t('ui.failedToDownload'),
                text: resolveClientErrorMessage(error, t('ui.downloadFailed')),
                confirmButtonText: t('ui.confirm'),
            });
        } finally {
            setDownloadingLatestKeys((prev) => {
                const next = new Set(prev);
                next.delete(downloadKey);
                return next;
            });
        }
    }, [t]);

    const handleDeleteTask = useCallback(async (taskId, fileName) => {
        const result = await Swal.fire({
            title: t('ui.confirmDelete'),
            text: t('ui.confirmDeleteTask'),
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
            const response = taskId
                ? await deleteTask(taskId)
                : await deleteTask(null, fileName);
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: t('ui.taskDeleted'),
                    timer: 1500,
                    showConfirmButton: false,
                });
            }
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: t('ui.deleteFailed'),
                text: resolveClientErrorMessage(error, t('ui.deleteFailed')),
                confirmButtonText: t('ui.confirm'),
            });
        }
    }, [t]);

    const versionPanelDownloadingLatest = useMemo(() => {
        if (!selectedAppGroup?.appId) {
            return false;
        }
        const key = `${selectedAppGroup.appId}:latest`;
        return downloadingLatestKeys.has(key);
    }, [downloadingLatestKeys, selectedAppGroup?.appId]);

    const handleJumpToLetter = useCallback((letter) => {
        const groupIndex = letterToGroupIndex.get(letter);
        if (groupIndex == null) {
            return;
        }

        virtuosoRef.current?.scrollToIndex({
            groupIndex,
            align: 'start',
            behavior: 'auto',
        });
    }, [letterToGroupIndex]);

    const fetchStoreVersions = useCallback(async (ids, idsKey) => {
        if (ids.length === 0) {
            return false;
        }

        const seq = storeVersionFetchSeqRef.current + 1;
        storeVersionFetchSeqRef.current = seq;
        setStoreVersionCheckLoading(true);

        try {
            const response = await getAppDetailsBatched(ids);
            if (storeVersionFetchSeqRef.current !== seq) {
                return false;
            }

            if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
                throw new Error(t('ui.downloadManagerSearchStoreVersionCheckFailed'));
            }

            const nextMap = new Map();
            for (const app of response.data) {
                if (app.trackId != null && app.version) {
                    nextMap.set(String(app.trackId), String(app.version));
                }
            }
            setStoreVersionByAppId(nextMap);
            lastFetchedAppIdsKeyRef.current = idsKey;
            return true;
        } catch (error) {
            if (storeVersionFetchSeqRef.current === seq) {
                Swal.fire({
                    icon: 'error',
                    title: resolveClientErrorMessage(error, t('ui.downloadManagerSearchStoreVersionCheckFailed')),
                    confirmButtonText: t('ui.confirm'),
                });
            }
            return false;
        } finally {
            if (storeVersionFetchSeqRef.current === seq) {
                setStoreVersionCheckLoading(false);
            }
        }
    }, [t]);

    useEffect(() => {
        if (!open || !showStoreVersion || appIds.length === 0) {
            return;
        }
        if (lastFetchedAppIdsKeyRef.current === appIdsKey) {
            return;
        }
        void fetchStoreVersions(appIds, appIdsKey);
    }, [open, showStoreVersion, appIds, appIdsKey, fetchStoreVersions]);

    const handleToggleStoreVersion = useCallback(() => {
        if (storeVersionCheckLoading) {
            return;
        }

        if (showStoreVersion) {
            setShowStoreVersion(false);
            return;
        }

        if (appIds.length === 0) {
            Swal.fire({
                icon: 'info',
                text: t('ui.downloadManagerSearchNoAppIds'),
                confirmButtonText: t('ui.confirm'),
            });
            return;
        }

        setShowStoreVersion(true);
    }, [appIds.length, showStoreVersion, storeVersionCheckLoading, t]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            slotProps={{
                backdrop: { className: 'download-manager-search-modal-backdrop' },
            }}
        >
            <ResponsiveModalDialog
                layout="center"
                safeAreaBottom={fullscreen && !searchInputFocused}
                slotProps={{ root: { ref: dialogRef } }}
                className={['download-manager-search-dialog', fullscreen ? 'safe-area-top' : ''].filter(Boolean).join(' ')}
                aria-label={t('ui.downloadManagerSearchPlaceholder')}
                sx={{
                    pt: 0,
                    px: 0,
                    gap: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    ...(fullscreen
                        ? {
                            width: '100%',
                            maxWidth: '100%',
                            minHeight: 0,
                            borderRadius: 0,
                            ...(searchInputFocused
                                ? { pb: 0 }
                                : { '--safe-area-pad-bottom': '16px' }),
                            '--safe-area-pad-x': '16px',
                        }
                        : {
                            pb: 0,
                            width: 'min(560px, calc(100vw - 32px))',
                            height: 'min(80vh, 640px)',
                        }),
                }}
            >
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                        px: 2,
                        py: 1.5,
                        flexShrink: 0,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        ...(fullscreen
                            ? {
                                pt: 'max(12px, var(--safe-area-inset-top))',
                                '@media (orientation: landscape)': {
                                    pl: 'max(var(--safe-area-pad-x, 16px), var(--safe-area-inset-left))',
                                    pr: 'max(var(--safe-area-pad-x, 16px), var(--safe-area-inset-right))',
                                },
                            }
                            : {}),
                    }}
                >
                    <Search sx={{ color: 'text.secondary', fontSize: 22, flexShrink: 0 }} />
                    <Input
                        ref={inputRef}
                        type="search"
                        name="downloadRecordSearch"
                        autoComplete="off"
                        value={query}
                        autoFocus
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setSearchInputFocused(true)}
                        onBlur={() => setSearchInputFocused(false)}
                        placeholder={t('ui.downloadManagerSearchPlaceholder')}
                        slotProps={{
                            input: {
                                'aria-label': t('ui.downloadManagerSearchPlaceholder'),
                                enterKeyHint: 'search',
                                autoComplete: 'off',
                                autoCorrect: 'off',
                                autoCapitalize: 'off',
                                spellCheck: 'false',
                            },
                        }}
                        sx={{ flex: 1, '--Input-focusedThickness': '1px' }}
                    />
                    <IconButton
                        variant={showStoreVersion ? 'soft' : 'plain'}
                        color={showStoreVersion ? 'primary' : 'neutral'}
                        aria-label={showStoreVersion
                            ? t('ui.downloadManagerSearchHideStoreVersions')
                            : t('ui.downloadManagerSearchCheckStoreVersions')}
                        aria-pressed={showStoreVersion}
                        title={showStoreVersion
                            ? t('ui.downloadManagerSearchHideStoreVersions')
                            : t('ui.downloadManagerSearchCheckStoreVersions')}
                        disabled={storeVersionCheckLoading}
                        onClick={handleToggleStoreVersion}
                        sx={{
                            flexShrink: 0,
                            position: 'relative',
                            overflow: 'visible',
                        }}
                    >
                        {storeVersionCheckLoading ? (
                            <CircularProgress size="sm" />
                        ) : (
                            <AutoMode />
                        )}
                        {!storeVersionCheckLoading ? (
                            <Box
                                component="span"
                                aria-hidden
                                sx={{
                                    position: 'absolute',
                                    bottom: 1,
                                    right: 0,
                                    px: 0.25,
                                    py: '1px',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    letterSpacing: '-0.02em',
                                    color: 'neutral.plainColor',
                                    bgcolor: 'background.surface',
                                    borderRadius: '3px',
                                    border: '1px solid',
                                    borderColor: 'neutral.outlinedBorder',
                                    pointerEvents: 'none',
                                    opacity: 0.96,
                                    transform: 'translate(30%, 24%)',
                                }}
                            >
                                Beta
                            </Box>
                        ) : null}
                    </IconButton>
                    <IconButton
                        variant="plain"
                        color="neutral"
                        aria-label={t('ui.close')}
                        onClick={onClose}
                        sx={{ flexShrink: 0 }}
                    >
                        <Close />
                    </IconButton>
                </Stack>

                <Box
                    className={fullscreen ? 'download-manager-search-safe-x' : undefined}
                    sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex', boxSizing: 'border-box' }}
                >
                    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
                        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                            {appResults.length > 0 ? (
                                <GroupedVirtuoso
                                    ref={virtuosoRef}
                                    style={{ height: '100%', overscrollBehavior: 'contain' }}
                                    groupCounts={groupCounts}
                                    fixedItemHeight={SEARCH_RESULT_ROW_HEIGHT}
                                    fixedGroupHeight={SEARCH_GROUP_HEADER_HEIGHT}
                                    groupContent={(groupIndex) => (
                                        <SearchGroupHeader letter={groups[groupIndex]?.letter ?? '#'} />
                                    )}
                                    itemContent={(index) => {
                                        const appGroup = flatAppGroups[index];
                                        if (!appGroup) {
                                            return null;
                                        }
                                        return (
                                            <AppSearchResultRow
                                                appGroup={appGroup}
                                                country={country}
                                                onSelect={handleAppClick}
                                                storeVersionByAppId={storeVersionByAppId}
                                                showStoreVersion={showStoreVersion}
                                                storeVersionLoading={storeVersionCheckLoading}
                                            />
                                        );
                                    }}
                                />
                            ) : (
                                <Box
                                    sx={{
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        px: 3,
                                        py: 4,
                                    }}
                                >
                                    <Typography level="body-sm" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                                        {query.trim()
                                            ? t('ui.downloadManagerSearchNoResults')
                                            : t('ui.downloadManagerSearchHint')}
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        {appResults.length > 0 ? (
                            <AlphabetIndexBar
                                letterToGroupIndex={letterToGroupIndex}
                                availableLetters={availableLetters}
                                onJumpToLetter={handleJumpToLetter}
                            />
                        ) : null}
                    </Box>

                    <AnimatePresence>
                        {selectedAppGroup ? (
                            <VersionPickerPanel
                                key={selectedAppGroup.groupKey}
                                appGroup={selectedAppGroup}
                                onBack={() => setSelectedAppGroup(null)}
                                onSelect={handleOpenItem}
                                prefersReducedMotion={prefersReducedMotion}
                                storeVersionByAppId={storeVersionByAppId}
                                showStoreVersion={showStoreVersion}
                                downloadingLatest={versionPanelDownloadingLatest}
                                onDownload={handleDownload}
                                onDeleteTask={handleDeleteTask}
                            />
                        ) : null}
                    </AnimatePresence>
                </Box>
            </ResponsiveModalDialog>
        </Modal>
    );
}
