import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Chip, IconButton, Input, Modal, Stack, Typography,
} from '@mui/joy';
import { ArrowBack, Close, Search } from '@mui/icons-material';
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
import { useFullscreenDialog } from '../hooks/useJoyMedia';

const EASE_IN = [0.4, 0, 1, 1];

function extractSidecarFileBase(name) {
    const base = name?.replace(/\.ipa$/i, '') ?? '';
    return /^\d+_\d+$/.test(base) ? base : undefined;
}

function AppSearchResultRow({ appGroup, country, onSelect }) {
    const { t } = useTranslation();
    const newest = appGroup.versions[0];
    const sidecarFileBase = extractSidecarFileBase(newest?.name);
    const versionCount = appGroup.versions.length;
    const sublineParts = [appGroup.artistName];

    if (versionCount === 1 && newest?.bundleShortVersionString) {
        sublineParts.push(newest.bundleShortVersionString);
    } else if (versionCount > 1) {
        sublineParts.push(t('ui.downloadManagerSearchVersionCount', { count: versionCount }));
    }

    const subline = sublineParts.filter(Boolean).join(' · ');

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
                {subline ? (
                    <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.25 }}>
                        {subline}
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

function VersionSelectRow({ item, onSelect }) {
    const { t } = useTranslation();
    const versionLabel = getVersionLabel(item);
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
                <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap>
                    <Typography level="title-sm">{versionLabel}</Typography>
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
}) {
    const { t } = useTranslation();

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
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
                {appGroup.versions.map((item) => (
                    <VersionSelectRow
                        key={item.name}
                        item={item}
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
        if (appGroup.versions.length === 1) {
            handleOpenItem(appGroup.versions[0]);
            return;
        }
        setSelectedAppGroup(appGroup);
    }, [handleOpenItem]);

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
                            />
                        ) : null}
                    </AnimatePresence>
                </Box>
            </ResponsiveModalDialog>
        </Modal>
    );
}
