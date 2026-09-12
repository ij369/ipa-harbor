import React, { useEffect, useState } from 'react';
import {
    Box,
    Stack,
    Typography,
    Sheet,
    Button,
    Badge,
    IconButton,
} from '@mui/joy';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    AddToHomeScreen as AddToHomeScreenIcon,
} from '@mui/icons-material';
import UserStatus from './UserStatus';
import AdminStatus from './AdminStatus';
import LanguageSwitcher from './LanguageSwitcher';
import MobileNavMenu from './MobileNavMenu';
import MenuToggleIcon from './MenuToggleIcon';
import PageTransition from './PageTransition';
import StandaloneAppHeader from './StandaloneAppHeader';
import StandaloneAppFooter from './StandaloneAppFooter';
import { AppDownloadProvider, useAppSession, useAppDownload } from '../contexts/AppContext';
import { useJoyUp, useStandaloneDisplay } from '../hooks/useJoyMedia';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useTranslation } from 'react-i18next';

function useDownloadNavBadge() {
    const { taskList } = useAppDownload();

    if (!taskList) {
        return { count: 0, color: 'neutral' };
    }

    const runningCount = taskList.running?.length || 0;
    const completedCount = taskList.completed?.length || 0;

    if (runningCount > 0) {
        return { count: runningCount, color: 'primary' };
    }
    if (completedCount > 0) {
        return { count: completedCount, color: 'neutral' };
    }

    return { count: 0, color: 'neutral' };
}

function AppShellNavigation({
    menuOpen,
    menuMounted,
    onMenuOpenChange,
    onMenuMountedChange,
    onNavigate,
    locationPathname,
}) {
    const { t } = useTranslation();
    const { isAuthenticated } = useAppSession();
    const badgeInfo = useDownloadNavBadge();

    const navItems = [
        { path: '/', label: t('ui.search') },
        { path: '/purchases', label: t('ui.purchasedApps') },
        { path: '/dl', label: t('ui.downloadManager'), badge: badgeInfo },
        { path: '/settings', label: t('ui.settings') },
    ];

    const visibleNavItems = isAuthenticated
        ? navItems
        : navItems.filter((item) => item.path !== '/purchases');

    const renderNavButton = (item) => {
        const isActive = locationPathname === item.path;
        const button = (
            <Button
                variant={isActive ? 'soft' : 'plain'}
                size="sm"
                onClick={() => onNavigate(item.path)}
                color={isActive ? 'primary' : 'neutral'}
            >
                {item.label}
            </Button>
        );

        if (item.badge?.count > 0) {
            return (
                <Badge badgeContent={item.badge.count} color={item.badge.color} size="sm" key={item.path}>
                    {button}
                </Badge>
            );
        }

        return <Box key={item.path}>{button}</Box>;
    };

    return (
        <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                {visibleNavItems.map(renderNavButton)}

                {isAuthenticated ? (
                    <UserStatus />
                ) : (
                    <Badge color="danger" size="md">
                        <Button
                            variant="outlined"
                            size="sm"
                            onClick={() => onNavigate('/apple-id')}
                            color="danger"
                        >
                            {t('ui.needAppleIdLogin')}
                        </Button>
                    </Badge>
                )}
                <LanguageSwitcher />
            </Stack>

            <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{
                    display: { xs: 'flex', sm: 'none' },
                    position: 'relative',
                }}
            >
                {isAuthenticated ? (
                    !menuMounted && <UserStatus />
                ) : (
                    <Badge color="danger" size="md">
                        <Button
                            variant="outlined"
                            size="sm"
                            onClick={() => onNavigate('/apple-id')}
                            color="danger"
                        >
                            {t('ui.needAppleIdLogin')}
                        </Button>
                    </Badge>
                )}
                <IconButton
                    variant="plain"
                    color="neutral"
                    onClick={() => onMenuOpenChange((prev) => !prev)}
                    aria-label={menuOpen ? t('ui.closeMenu') : t('ui.openMenu')}
                    aria-expanded={menuOpen}
                >
                    <MenuToggleIcon open={menuOpen} />
                </IconButton>
            </Stack>

        </>
    );
}

function AppShellMobileMenu({
    open,
    onClose,
    onMountedChange,
    onNavigate,
}) {
    const { t } = useTranslation();
    const { isAuthenticated } = useAppSession();
    const badgeInfo = useDownloadNavBadge();

    const navItems = [
        { path: '/', label: t('ui.search') },
        { path: '/purchases', label: t('ui.purchasedApps') },
        { path: '/dl', label: t('ui.downloadManager'), badge: badgeInfo },
        { path: '/settings', label: t('ui.settings') },
    ];

    return (
        <MobileNavMenu
            open={open}
            onClose={onClose}
            onMountedChange={onMountedChange}
            navItems={navItems}
            onNavigate={onNavigate}
            isAuthenticated={isAuthenticated}
        />
    );
}

function AppShell() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const standalone = useStandaloneDisplay();
    const aboveSm = useJoyUp('sm');
    const aboveMd = useJoyUp('md');
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuMounted, setMenuMounted] = useState(false);

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    // 屏幕展开到 sm 及以上时自动折叠菜单
    useEffect(() => {
        if (aboveSm) {
            setMenuOpen(false);
        }
    }, [aboveSm]);

    const handleNavigate = (path) => {
        navigate(path);
        setMenuOpen(false);
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {standalone ? (
                <StandaloneAppHeader onNavigate={handleNavigate}>
                    <AppShellNavigation
                        menuOpen={menuOpen}
                        menuMounted={menuMounted}
                        onMenuOpenChange={setMenuOpen}
                        onMenuMountedChange={setMenuMounted}
                        onNavigate={handleNavigate}
                        locationPathname={location.pathname}
                    />
                </StandaloneAppHeader>
            ) : (
                <Sheet
                    component="header"
                    className="safe-area-x app-shell-header"
                    sx={{
                        flexShrink: 0,
                        position: 'relative',
                        border: 'none',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 0,
                        pb: 2,
                        bgcolor: 'background.surface',
                        zIndex: menuOpen || menuMounted ? 'var(--z-app-shell-header)' : 2,
                        '--safe-area-pad-x': '16px',
                    }}
                >
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ maxWidth: '1200px', mx: 'auto', width: '100%' }}
                    >
                        <Stack direction="row" alignItems="center" gap={1}>
                            <IconButton color="primary" onClick={() => handleNavigate('/')}>
                                <AddToHomeScreenIcon />
                            </IconButton>
                            <Typography
                                level="h3"
                                sx={{
                                    fontWeight: 'bold',
                                    color: 'primary.500',
                                    fontSize: { xs: '1.1rem', sm: undefined },
                                }}
                            >
                                IPA Harbor
                            </Typography>
                        </Stack>

                        <AppShellNavigation
                            menuOpen={menuOpen}
                            menuMounted={menuMounted}
                            onMenuOpenChange={setMenuOpen}
                            onMenuMountedChange={setMenuMounted}
                            onNavigate={handleNavigate}
                            locationPathname={location.pathname}
                        />
                    </Stack>
                </Sheet>
            )}

            <AppShellMobileMenu
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                onMountedChange={setMenuMounted}
                onNavigate={handleNavigate}
            />

            {/* 主要内容区域 */}
            <Box
                component="main"
                className={standalone ? 'safe-area-x app-shell-main--standalone' : 'safe-area-x'}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: '1200px',
                    mx: 'auto',
                    width: '100%',
                    '--safe-area-pad-x': '21px',
                }}
            >
                <PageTransition />
            </Box>

            {standalone ? (
                <StandaloneAppFooter
                    currentPath={location.pathname}
                    onNavigate={handleNavigate}
                />
            ) : (
                <Sheet
                    component="footer"
                    className="safe-area-footer"
                    sx={{
                        flexShrink: 0,
                        border: 'none',
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 0,
                        bgcolor: 'background.surface',
                    }}
                >
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ maxWidth: '1200px', mx: 'auto', width: '100%' }}
                    >
                        {/* 左侧：开源信息 */}
                        <Stack direction="column" alignItems="flex-start" gap={0.2} sx={{ pl: 1 }}>
                            <Typography level="body-xs">IPA Harbor ©2025</Typography>
                            <Stack
                                direction="row"
                                gap={0.2}
                                sx={{
                                    cursor: 'pointer',
                                    ':hover': { opacity: 0.8 },
                                    transition: 'opacity 0.2s ease-in-out',
                                }}
                            >
                                <Typography
                                    level="body-xs"
                                    sx={{ fontSize: '0.625rem', fontWeight: 'normal' }}
                                    onClick={() => window.open('https://github.com/ij369/ipa-harbor', '_blank')}
                                    startDecorator={<GitHubIcon sx={{ fontSize: '0.75rem' }} />}
                                >
                                    {t('ui.footer')}
                                </Typography>
                                <Typography
                                    level="body-xs"
                                    sx={{
                                        fontSize: '0.625rem',
                                        fontWeight: 'normal',
                                        display: { xs: 'none', sm: 'none', md: 'block' },
                                    }}
                                    onClick={() => window.open('https://github.com/ij369/ipa-harbor', '_blank')}
                                >
                                    {t('ui.footerSuffix')}
                                </Typography>
                            </Stack>
                        </Stack>

                        {/* 右侧：操作按钮 */}
                        <Stack direction="row" alignItems="center" gap={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
                            <AdminStatus />
                        </Stack>
                    </Stack>
                </Sheet>
            )}
        </Box>
    );
}

export default AppShell;

// 主应用 shell：在此层挂载 WS，避免 admin 登录页等无关路由被 download 更新牵连
export function AppShellWithDownload() {
    return (
        <AppDownloadProvider>
            <AppShell />
        </AppDownloadProvider>
    );
}
