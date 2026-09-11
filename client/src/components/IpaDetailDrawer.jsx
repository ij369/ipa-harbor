import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Box, Stack, Typography, Link, Button, IconButton, DialogTitle, DialogContent, ModalClose, Sheet,
} from '@mui/joy';
import { Download as DownloadIcon, Search, InstallMobile } from '@mui/icons-material';
import DeleteIcon from '@mui/icons-material/Delete';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import IpaAppIcon from './IpaAppIcon';
import {
    getAppIconUrl,
    deleteTask,
    isRateLimitError,
    openPackageDownload,
    openManifestInstall,
    resolveClientErrorMessage,
} from '../utils/api';
import formatFileSize from '../utils/formatFileSize.js';
import { useApp } from '../contexts/AppContext';
import { useFullscreenDialog } from '../hooks/useJoyMedia';
import { isOtaSecureContext, useOtaInstallPreference } from '../utils/otaInstallPreference';
import { getIntlLocale } from '../i18n';

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN = [0.4, 0, 1, 1];

function mountShelfEffects(wrapper) {
    if (wrapper.querySelector('.shelf-wrapper__blur')) {
        return;
    }

    const content = wrapper.querySelector('.shelf-wrapper__content');
    if (!content) {
        return;
    }

    const blur = document.createElement('div');
    blur.className = 'shelf-wrapper__blur';
    blur.setAttribute('aria-hidden', 'true');

    const rotate = document.createElement('div');
    rotate.className = 'shelf-wrapper__rotate';
    rotate.setAttribute('aria-hidden', 'true');

    wrapper.insertBefore(rotate, content);
    wrapper.insertBefore(blur, rotate);
}

function unmountShelfEffects(wrapper) {
    wrapper.querySelector('.shelf-wrapper__blur')?.remove();
    wrapper.querySelector('.shelf-wrapper__rotate')?.remove();
}

function resetShelfMaterialDom(wrapper, divider) {
    if (!wrapper) {
        return;
    }

    wrapper.classList.remove('shelf-wrapper--active');
    wrapper.querySelector('.shelf-wrapper__rotate')?.classList.remove('shelf-wrapper__rotate--live');
    unmountShelfEffects(wrapper);
    divider?.classList.remove('ipa-drawer-header-divider--hidden');
}

function extractAppInfo(fileName) {
    if (!fileName) return { appId: null, versionId: null };
    const match = fileName.match(/^(\d+)_(.+)\.ipa$/);
    return match ? { appId: match[1], versionId: match[2] } : { appId: null, versionId: null };
}

export default function IpaDetailDrawer({ item, open, onClose, onExitComplete }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useApp();
    const [otaInstallEnabled] = useOtaInstallPreference();
    const prefersReducedMotion = useReducedMotion();
    const fullscreen = useFullscreenDialog();
    const drawerScrollRef = useRef(null);
    const drawerIconRef = useRef(null);
    const shelfWrapperRef = useRef(null);
    const shelfDividerRef = useRef(null);
    const shelfMaterialActiveRef = useRef(false);
    const shelfEffectsTimerRef = useRef(null);
    const [shelfScrollEffectsReady, setShelfScrollEffectsReady] = useState(false);

    const handlePanelAnimationStart = useCallback(() => {
        shelfWrapperRef.current?.classList.add('shelf-wrapper--drawer-animating');
        if (!open) {
            setShelfScrollEffectsReady(false);
        }
    }, [open]);

    const handlePanelAnimationComplete = useCallback(() => {
        shelfWrapperRef.current?.classList.remove('shelf-wrapper--drawer-animating');
        if (open) {
            setShelfScrollEffectsReady(true);
        }
    }, [open]);

    const {
        id: appId,
        name = '',
        status,
        taskId,
        itemId,
        bundleDisplayName,
        artistName,
        bundleShortVersionString,
        bundleVersion,
        productType,
        softwareVersionBundleId,
        softwareVersionExternalIdentifier,
        releaseDate,
        firstReleaseDate,
        size: fileSize,
        createdAt,
    } = item ?? {};

    const { appId: extractedAppId } = extractAppInfo(name);
    const finalAppId = appId || extractedAppId;
    const displayAppId = finalAppId || (itemId != null ? String(itemId) : null);
    const isMetadataPending = ['completed', 'downloaded'].includes(status) && !bundleDisplayName;
    const shelfIconSrc = finalAppId ? getAppIconUrl(finalAppId, 200, user?.region) : null;
    const drawerOpen = open && Boolean(item);
    const installBaseName = name.replace(/\.ipa$/i, '');
    const showInstall = otaInstallEnabled && isOtaSecureContext() && installBaseName.includes('_');

    const handleManifestInstall = async () => {
        try {
            await openManifestInstall(installBaseName);
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: resolveClientErrorMessage(error, t('ui.downloadFailed')),
            });
        }
    };

    const handlePackageDownload = async () => {
        try {
            await openPackageDownload(name);
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: resolveClientErrorMessage(error, t('ui.downloadFailed')),
            });
        }
    };

    const handleViewAppDetail = () => {
        if (!finalAppId) {
            return;
        }
        onClose?.();
        navigate(`/?openAppId=${encodeURIComponent(finalAppId)}`);
    };

    const formatDate = (dateString) => {
        if (!dateString) return t('ui.unknown');
        try {
            const lng = localStorage.getItem('language') || 'en';
            return new Date(dateString).toLocaleString(getIntlLocale(lng));
        } catch {
            return t('ui.dateFormatError');
        }
    };

    useEffect(() => {
        const syncShelfMaterialDom = (active, withEffects) => {
            if (active === shelfMaterialActiveRef.current) {
                return;
            }
            shelfMaterialActiveRef.current = active;

            const wrapper = shelfWrapperRef.current;
            const divider = shelfDividerRef.current;
            if (!wrapper) {
                return;
            }

            if (shelfEffectsTimerRef.current) {
                clearTimeout(shelfEffectsTimerRef.current);
                shelfEffectsTimerRef.current = null;
            }

            if (active) {
                if (withEffects) {
                    mountShelfEffects(wrapper);
                }
                requestAnimationFrame(() => {
                    wrapper.classList.add('shelf-wrapper--active');
                    wrapper.querySelector('.shelf-wrapper__rotate')?.classList.add('shelf-wrapper__rotate--live');
                });
                divider?.classList.add('ipa-drawer-header-divider--hidden');
                return;
            }

            wrapper.classList.remove('shelf-wrapper--active');
            wrapper.querySelector('.shelf-wrapper__rotate')?.classList.remove('shelf-wrapper__rotate--live');
            divider?.classList.remove('ipa-drawer-header-divider--hidden');
            shelfEffectsTimerRef.current = setTimeout(() => {
                if (!shelfMaterialActiveRef.current) {
                    unmountShelfEffects(wrapper);
                }
                shelfEffectsTimerRef.current = null;
            }, 180);
        };

        // 关闭时勿立刻 reset shelf DOM，否则会打断 AnimatePresence 退场动画
        if (!open || !item || !shelfScrollEffectsReady) {
            return () => {
                if (shelfEffectsTimerRef.current) {
                    clearTimeout(shelfEffectsTimerRef.current);
                    shelfEffectsTimerRef.current = null;
                }
            };
        }

        shelfMaterialActiveRef.current = false;
        resetShelfMaterialDom(shelfWrapperRef.current, shelfDividerRef.current);

        let observer;
        const frameId = requestAnimationFrame(() => {
            const scrollRoot = drawerScrollRef.current;
            const iconNode = drawerIconRef.current;
            if (!scrollRoot || !iconNode) {
                return;
            }

            observer = new IntersectionObserver(
                ([entry]) => {
                    if (shelfWrapperRef.current?.classList.contains('shelf-wrapper--drawer-animating')) {
                        return;
                    }
                    syncShelfMaterialDom(!entry.isIntersecting, Boolean(shelfIconSrc));
                },
                {
                    root: scrollRoot,
                    threshold: 0,
                    rootMargin: '1px 0px 0px 0px',
                },
            );

            observer.observe(iconNode);
        });

        return () => {
            cancelAnimationFrame(frameId);
            observer?.disconnect();
            if (shelfEffectsTimerRef.current) {
                clearTimeout(shelfEffectsTimerRef.current);
                shelfEffectsTimerRef.current = null;
            }
        };
    }, [open, item, finalAppId, shelfIconSrc, shelfScrollEffectsReady]);

    useEffect(() => {
        if (!open || !item) {
            setShelfScrollEffectsReady(false);
        }
    }, [open, item]);

    useEffect(() => {
        if (!drawerOpen) {
            return undefined;
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose?.();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [drawerOpen, onClose]);

    const handleDeleteTask = async (e) => {
        if (!item) {
            return;
        }
        e.stopPropagation();
        onClose?.();

        const result = await Swal.fire({
            title: t('ui.confirmDelete'),
            text: `${t('ui.confirmDeleteTask')} ${name}`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('ui.delete'),
            cancelButtonText: t('ui.cancel'),
            confirmButtonColor: '#d33',
        });

        if (result.isConfirmed) {
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
        }
    };

    const sheetContent = item ? (
        <Sheet
            className="ipa-drawer-sheet"
            sx={{
                borderRadius: { xs: 0, md: 'md' },
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                minWidth: 0,
                overflow: 'hidden',
                bgcolor: 'background.surface',
                boxShadow: { xs: 'none', md: 'lg' },
            }}
        >
            <Box sx={{ mx: 0, flexShrink: 0, overflow: 'hidden' }}>
                <div
                    ref={shelfWrapperRef}
                    className="shelf-wrapper"
                    style={{
                        '--shelf-background-color': '#fff',
                        ...(shelfIconSrc ? { '--shelf-background-image': `url("${shelfIconSrc}")` } : {}),
                    }}
                >
                    {shelfIconSrc ? (
                        <div className="shelf-wrapper__material" aria-hidden="true" />
                    ) : null}
                    <div className="shelf-wrapper__content">
                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            gap={1}
                            sx={{
                                px: 2,
                                pb: 2,
                                pt: 'var(--safe-area-pad-top)',
                                '@media (display-mode: standalone)': {
                                    pt: 'calc(var(--safe-area-pad-top) + var(--safe-area-inset-top))',
                                },
                            }}
                        >
                            <DialogTitle
                                className="shelf-drawer-title"
                                sx={{ flex: 1, minWidth: 0, p: 0, m: 0 }}
                            >
                                {bundleDisplayName || name}
                            </DialogTitle>
                            <ModalClose
                                className="shelf-drawer-close"
                                onClick={onClose}
                                sx={{
                                    position: 'static',
                                    top: 'auto',
                                    right: 'auto',
                                    m: 0,
                                    flexShrink: 0,
                                }}
                            />
                        </Stack>
                    </div>
                </div>
                <Box
                    ref={shelfDividerRef}
                    sx={{
                        flexShrink: 0,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        opacity: 1,
                        transition: 'opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                        '&.ipa-drawer-header-divider--hidden': {
                            opacity: 0,
                        },
                    }}
                />
            </Box>

            <DialogContent sx={{ flex: 1, minHeight: 0, overflow: 'hidden', p: 0 }}>
                <Box
                    ref={drawerScrollRef}
                    sx={{ height: '100%', overflow: 'auto', px: 2, pt: 2 }}
                >
                    <Stack spacing={2}>
                        <Box
                            ref={drawerIconRef}
                            sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}
                        >
                            <IpaAppIcon appId={finalAppId} size={120} country={user?.region} />
                        </Box>

                        <Stack spacing={1}>
                            <Stack direction="row" spacing={1} alignItems="flex-end">
                                <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>
                                        {t('ui.appName_label')}
                                    </Typography>
                                    <Typography level="body-md">{bundleDisplayName || name}</Typography>
                                </Stack>
                                <IconButton
                                    variant="plain"
                                    color="primary"
                                    aria-label={t('ui.viewAppDetail')}
                                    title={t('ui.viewAppDetail')}
                                    onClick={handleViewAppDetail}
                                    disabled={!finalAppId}
                                    sx={{ flexShrink: 0 }}
                                >
                                    <Search />
                                </IconButton>
                            </Stack>
                            {artistName && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.developer')}</Typography>
                                    <Typography level="body-md">{artistName}</Typography>
                                </Box>
                            )}
                            {bundleShortVersionString && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.appVersion')}</Typography>
                                    <Typography level="body-md">{bundleShortVersionString}</Typography>
                                </Box>
                            )}
                            {bundleVersion && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.buildVersion')}</Typography>
                                    <Typography level="body-md">{bundleVersion}</Typography>
                                </Box>
                            )}
                            {softwareVersionBundleId && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.bundleId')}</Typography>
                                    <Typography level="body-md">{softwareVersionBundleId}</Typography>
                                </Box>
                            )}
                            {isMetadataPending && (
                                <Box>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <HourglassTopIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                        <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                                            {t('ui.parsingMetadata')}
                                        </Typography>
                                    </Stack>
                                </Box>
                            )}
                            {displayAppId && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.appId')}</Typography>
                                    <Typography level="body-md">{displayAppId}</Typography>
                                </Box>
                            )}
                            {softwareVersionExternalIdentifier && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.versionId')}</Typography>
                                    <Typography level="body-md">{softwareVersionExternalIdentifier}</Typography>
                                </Box>
                            )}
                            {productType && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.productType')}</Typography>
                                    <Typography level="body-md">{productType}</Typography>
                                </Box>
                            )}
                            {fileSize && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.fileSize')}</Typography>
                                    <Typography level="body-md">{formatFileSize(fileSize)}</Typography>
                                </Box>
                            )}
                            {releaseDate && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.releaseDate')}</Typography>
                                    <Typography level="body-md">{formatDate(releaseDate)}</Typography>
                                </Box>
                            )}
                            {firstReleaseDate && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.firstReleaseDate')}</Typography>
                                    <Typography level="body-md">{formatDate(firstReleaseDate)}</Typography>
                                </Box>
                            )}
                            {createdAt && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.downloadTime')}</Typography>
                                    <Typography level="body-md">{formatDate(createdAt)}</Typography>
                                </Box>
                            )}
                            <Box>
                                <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>{t('ui.fileName')}</Typography>
                                <Typography level="body-md">{name}</Typography>
                            </Box>
                        </Stack>
                    </Stack>
                </Box>
            </DialogContent>

            <Box
                sx={{
                    bgcolor: 'background.surface',
                    flexShrink: 0,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    pt: 2,
                    pl: 'max(16px, env(safe-area-inset-left, 0px))',
                    pr: 'max(16px, env(safe-area-inset-right, 0px))',
                    pb: 'max(16px, env(safe-area-inset-bottom, 0px))',
                }}
            >
                <Stack direction="row" useFlexGap spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <IconButton
                        variant="soft"
                        color="danger"
                        aria-label={t('ui.delete')}
                        title={t('ui.delete')}
                        onClick={handleDeleteTask}
                    >
                        <DeleteIcon />
                    </IconButton>
                    <Stack direction="row" spacing={1} alignItems="center">
                        {showInstall ? (
                            <>
                                <IconButton
                                    variant="soft"
                                    aria-label={t('ui.download')}
                                    title={t('ui.download')}
                                    onClick={handlePackageDownload}
                                >
                                    <DownloadIcon />
                                </IconButton>
                                <Button
                                    color="success"
                                    startDecorator={<InstallMobile />}
                                    onClick={handleManifestInstall}
                                >
                                    {t('ui.install')}
                                </Button>
                            </>
                        ) : (
                            <Button startDecorator={<DownloadIcon />} onClick={handlePackageDownload}>
                                {t('ui.download')}
                            </Button>
                        )}
                    </Stack>
                </Stack>
            </Box>
        </Sheet>
    ) : null;

    if (!open && !item) {
        return null;
    }

    return createPortal(
        <AnimatePresence onExitComplete={onExitComplete}>
            {drawerOpen && item ? (
                <Box
                    key={item.name}
                    role="presentation"
                    sx={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1300,
                    }}
                >
                    <Box
                        component={motion.div}
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: 1,
                            transition: prefersReducedMotion
                                ? { duration: 0 }
                                : { opacity: { duration: 0.16, ease: EASE_OUT } },
                        }}
                        exit={{
                            opacity: 0,
                            transition: prefersReducedMotion
                                ? { duration: 0 }
                                : { opacity: { duration: 0.2, ease: EASE_OUT, delay: 0.03 } },
                        }}
                        aria-hidden="true"
                        onClick={onClose}
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 0,
                            bgcolor: 'rgba(0, 0, 0, 0.36)',
                            contain: 'strict',
                            pointerEvents: 'auto',
                        }}
                    />
                    <Box
                        className="ipa-drawer-panel layout-transition"
                        component={motion.div}
                        initial={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
                        animate={prefersReducedMotion
                            ? { opacity: 1, transition: { duration: 0 } }
                            : { x: 0, transition: { type: 'spring', duration: 0.26, bounce: 0.02 } }}
                        exit={prefersReducedMotion
                            ? { opacity: 0, transition: { duration: 0 } }
                            : { x: '100%', transition: { x: { duration: 0.18, ease: EASE_IN } } }}
                        onAnimationStart={handlePanelAnimationStart}
                        onAnimationComplete={handlePanelAnimationComplete}
                        role="dialog"
                        aria-modal="true"
                        aria-label={bundleDisplayName || name}
                        sx={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 'auto',
                            right: 0,
                            zIndex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            flexShrink: 0,
                            maxWidth: 'none',
                            contain: 'layout style paint',
                            py: { xs: 0, md: 3 },
                            boxSizing: 'border-box',
                            width: {
                                xs: 'min(450px, calc(100vw - 100px))',
                                md: 'min(450px, calc(100vw - 32px))',
                            },
                            ...(fullscreen
                                ? { m: 0 }
                                : {
                                    mr: {
                                        xs: 'env(safe-area-inset-right, 0px)',
                                        md: 'max(24px, env(safe-area-inset-right, 0px))',
                                    },
                                    ml: {
                                        md: 'max(24px, env(safe-area-inset-left, 0px))',
                                    },
                                }),
                        }}
                    >
                        {sheetContent}
                    </Box>
                </Box>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
