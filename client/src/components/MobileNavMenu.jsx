import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Box,
    Stack,
    Typography,
    Button,
    Avatar,
    Chip,
    Divider,
} from '@mui/joy';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../contexts/AppContext';
import { revokeAuth, isRateLimitError, resolveClientErrorMessage } from '../utils/api';
import LanguageSwitcher from './LanguageSwitcher';
import RegionSelector from './RegionSelector';
import Swal from 'sweetalert2';

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN = [0.4, 0, 1, 1];

// 入场 / 退场时长
const ENTER = 0.2;
const EXIT = 0.16;
const STAGGER_IN = 0.035;
const STAGGER_OUT = 0.028;

const backdropMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: ENTER, ease: EASE_OUT } },
    exit: { opacity: 0, transition: { duration: EXIT, ease: EASE_IN } },
};

const panelMotion = {
    initial: { opacity: 0, y: -14 },
    animate: {
        opacity: 1,
        y: 0,
        transition: { duration: ENTER, ease: EASE_OUT },
    },
    exit: {
        opacity: 0,
        y: -14,
        transition: { duration: EXIT, ease: EASE_IN },
    },
};

const navListMotion = {
    animate: {
        transition: { staggerChildren: STAGGER_IN, delayChildren: 0.05 },
    },
    exit: {
        transition: { staggerChildren: STAGGER_OUT, staggerDirection: -1 },
    },
};

const navItemMotion = {
    initial: { opacity: 0, x: -20 },
    animate: {
        opacity: 1,
        x: 0,
        transition: { duration: ENTER, ease: EASE_OUT },
    },
    exit: {
        opacity: 0,
        x: -20,
        transition: { duration: EXIT, ease: EASE_IN },
    },
};

const footerMotion = {
    initial: { y: 14 },
    animate: {
        y: 0,
        transition: { delay: 0.1, duration: ENTER, ease: EASE_OUT },
    },
    exit: {
        y: 14,
        transition: { duration: EXIT, ease: EASE_IN },
    },
};

/**
 * 移动端全屏导航
 */
export default function MobileNavMenu({
    open,
    onClose,
    navItems,
    onNavigate,
    isAuthenticated,
    onMountedChange,
}) {
    const { t } = useTranslation();
    const location = useLocation();
    const { user, logout, setUser } = useApp();
    const [regionDialogOpen, setRegionDialogOpen] = useState(false);

    useEffect(() => {
        if (open) {
            onMountedChange?.(true);
            document.body.style.overflow = 'hidden';
        }
    }, [open, onMountedChange]);

    const handleExitComplete = () => {
        document.body.style.overflow = '';
        onMountedChange?.(false);
    };

    const handleNavClick = (path) => {
        onClose();
        onNavigate(path);
    };

    const handleLogout = async () => {
        onClose();
        try {
            const result = await Swal.fire({
                title: t('ui.confirmRevokeLogin'),
                text: t('ui.confirmRevokeAppleId'),
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: t('ui.confirm'),
                cancelButtonText: t('ui.cancel'),
            });

            if (!result.isConfirmed) return;

            await revokeAuth();
            logout();
            Swal.fire({
                icon: 'success',
                title: t('ui.logoutSuccess'),
                timer: 1500,
                showConfirmButton: false,
            });
        } catch (error) {
            if (isRateLimitError(error)) return;
            Swal.fire({
                icon: 'error',
                title: t('ui.logoutFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.confirm'),
            });
            logout();
        }
    };

    return createPortal(
        <>
            <AnimatePresence onExitComplete={handleExitComplete}>
                {open && (
                    <Box
                        component={motion.div}
                        key="mobile-nav"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('ui.openMenu')}
                        className="app-shell-nav-overlay"
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        sx={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 1200,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {/* 背景遮罩 */}
                        <Box
                            component={motion.div}
                            variants={backdropMotion}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            onClick={onClose}
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                bgcolor: 'rgba(0, 0, 0, 0.18)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                            }}
                        />

                        {/* 菜单内容 */}
                        <Box
                            component={motion.div}
                            variants={panelMotion}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            sx={{
                                position: 'relative',
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                bgcolor: 'background.body',
                                boxShadow: '0 -1px 0 var(--joy-palette-divider)',
                                overflow: 'hidden',
                            }}
                        >
                            <Box
                                component={motion.nav}
                                variants={navListMotion}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="safe-area-x"
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    py: 2,
                                    '--safe-area-pad-x': '32px',
                                }}
                            >
                                {navItems.map((item) => {
                                    const isActive = location.pathname === item.path;
                                    const badgeCount = item.badge?.count || 0;

                                    return (
                                        <Box
                                            key={item.path}
                                            component={motion.button}
                                            type="button"
                                            variants={navItemMotion}
                                            onClick={() => handleNavClick(item.path)}
                                            whileTap={{ scale: 0.985, opacity: 0.7 }}
                                            transition={{ duration: 0.08 }}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'baseline',
                                                gap: 1.5,
                                                width: '100%',
                                                py: 1.75,
                                                border: 'none',
                                                bgcolor: 'transparent',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                font: 'inherit',
                                            }}
                                        >
                                            <Typography
                                                sx={{
                                                    fontSize: 'clamp(1.625rem, 5vw, 2rem)',
                                                    fontWeight: isActive ? 600 : 400,
                                                    letterSpacing: '-0.03em',
                                                    lineHeight: 1.2,
                                                    color: isActive ? 'primary.500' : 'text.primary',
                                                }}
                                            >
                                                {item.label}
                                            </Typography>

                                            {badgeCount > 0 && (
                                                <Typography
                                                    level="body-xs"
                                                    sx={{
                                                        px: 1,
                                                        py: 0.25,
                                                        borderRadius: '999px',
                                                        bgcolor: item.badge.color === 'primary' ? 'primary.500' : 'neutral.500',
                                                        color: '#fff',
                                                        fontWeight: 600,
                                                        fontSize: '0.7rem',
                                                        lineHeight: 1.4,
                                                        transform: 'translateY(-2px)',
                                                    }}
                                                >
                                                    {badgeCount}
                                                </Typography>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Box>

                            <Box
                                component={motion.div}
                                variants={footerMotion}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="safe-area-bottom safe-area-x"
                                sx={{
                                    position: 'relative',
                                    zIndex: 1,
                                    '--safe-area-pad-bottom': '24px',
                                    '--safe-area-pad-x': '24px',
                                }}
                            >
                                <Divider sx={{ mb: 2.5 }} />

                                {isAuthenticated && user && (
                                    <Stack spacing={2} sx={{ mb: 2 }}>
                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                            <Avatar size="md" variant="solid" color="primary">
                                                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                                            </Avatar>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography level="title-sm" noWrap>
                                                    {user.name || t('ui.unknownUser')}
                                                </Typography>
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 0.75,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    <Typography
                                                        level="body-xs"
                                                        sx={{
                                                            color: 'text.tertiary',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        {user.email || t('ui.unknownEmail')}
                                                    </Typography>
                                                    <Chip size="sm" variant="soft" color="neutral" sx={{ flexShrink: 0 }}>
                                                        {t('ui.appleId')}
                                                    </Chip>
                                                </Box>
                                            </Box>
                                        </Stack>

                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                variant="outlined"
                                                color="neutral"
                                                size="sm"
                                                onClick={() => setRegionDialogOpen(true)}
                                                sx={{ flex: 1, borderRadius: 'lg' }}
                                            >
                                                {user.region
                                                    ? t('ui.currentRegion', { region: user.region.toUpperCase() })
                                                    : t('ui.specifyRegion')}
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                color="danger"
                                                size="sm"
                                                onClick={handleLogout}
                                                sx={{ flex: 1, borderRadius: 'lg' }}
                                            >
                                                {t('ui.revokeLogin')}
                                            </Button>
                                        </Stack>
                                    </Stack>
                                )}

                                <LanguageSwitcher variant="select" fullWidth size="md" />
                            </Box>
                        </Box>
                    </Box>
                )}
            </AnimatePresence>

            {isAuthenticated && user && (
                <RegionSelector
                    open={regionDialogOpen}
                    onClose={(updatedUserData) => {
                        setRegionDialogOpen(false);
                        if (updatedUserData) setUser(updatedUserData);
                    }}
                    currentRegion={user?.region}
                    storeRegion={user?.storeRegion}
                    regionSource={user?.regionSource}
                />
            )}
        </>,
        document.body,
    );
}
