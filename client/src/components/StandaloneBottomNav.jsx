import React from 'react';
import { Box, useTheme } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';

const NAV_ICONS = {
    '/': SearchIcon,
    '/purchases': ShoppingBagOutlinedIcon,
    '/dl': DownloadRoundedIcon,
    '/settings': SettingsRoundedIcon,
};

const ICON_SIZE = 32;
const ICON_SIZE_LANDSCAPE = 20;

const noSelectSx = {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
};

const landscapeNavSx = {
    minHeight: 'auto',
    pb: 'max(2px, env(safe-area-inset-bottom, 0px))',
};

const landscapeTabSx = {
    flexDirection: 'row',
    gap: '3px',
    minHeight: 28,
    py: 0,
    px: 0.5,
    fontSize: '0.625rem',
};

export default function StandaloneBottomNav({ navItems, currentPath, onNavigate }) {
    const theme = useTheme();

    const getItemColor = (isSelected) => (
        isSelected
            ? theme.vars.palette.primary[500]
            : theme.vars.palette.text.tertiary
    );

    return (
        <Box
            component="nav"
            className="app-shell-footer-nav"
            aria-label="Bottom Navigation"
            sx={{
                ...noSelectSx,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minHeight: 49,
                pb: 'max(6px, env(safe-area-inset-bottom, 0px))',
                pl: 'max(0px, env(safe-area-inset-left, 0px))',
                pr: 'max(0px, env(safe-area-inset-right, 0px))',
                '& *': noSelectSx,
                '@media (orientation: landscape)': landscapeNavSx,
            }}
        >
            <Box
                component="div"
                role="tablist"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    minHeight: 49,
                    '@media (orientation: landscape)': {
                        minHeight: 28,
                    },
                }}
            >
                {navItems.map((item) => {
                    const Icon = NAV_ICONS[item.path];
                    const isSelected = currentPath === item.path;
                    const badge = item.badge;
                    const badgeCount = badge?.count || 0;
                    const showDotBadge = badge?.dot && badgeCount === 0;
                    const itemColor = getItemColor(isSelected);

                    return (
                        <Box
                            key={item.path}
                            component="button"
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            onClick={() => onNavigate(item.path)}
                            sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 0.5,
                                minHeight: 49,
                                py: 0.5,
                                px: 0.25,
                                m: 0,
                                border: 'none',
                                outline: 'none',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                bgcolor: 'transparent',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontWeight: 500,
                                fontSize: '0.625rem',
                                letterSpacing: '-0.01em',
                                textAlign: 'center',
                                color: itemColor,
                                transition: 'color 0.15s ease',
                                '@media (orientation: landscape)': landscapeTabSx,
                            }}
                        >
                            <Box
                                component="span"
                                sx={{
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: ICON_SIZE,
                                    height: ICON_SIZE,
                                    flexShrink: 0,
                                    '@media (orientation: landscape)': {
                                        width: ICON_SIZE_LANDSCAPE,
                                        height: ICON_SIZE_LANDSCAPE,
                                    },
                                }}
                            >
                                <Icon
                                    sx={{
                                        fontSize: ICON_SIZE,
                                        color: itemColor,
                                        '@media (orientation: landscape)': {
                                            fontSize: ICON_SIZE_LANDSCAPE,
                                        },
                                    }}
                                />
                                {showDotBadge && (
                                    <Box
                                        component="span"
                                        aria-hidden="true"
                                        sx={{
                                            position: 'absolute',
                                            top: 0,
                                            right: -2,
                                            width: 11,
                                            height: 11,
                                            borderRadius: '999px',
                                            bgcolor: badge.color === 'danger'
                                                ? theme.vars.palette.danger[500]
                                                : theme.vars.palette.primary[500],
                                            boxShadow: `
                                                0 0 0 2px ${theme.vars.palette.background.surface},
                                                0 1px 3px rgba(0, 0, 0, 0.22)
                                            `,
                                            '@media (orientation: landscape)': {
                                                top: -2,
                                                right: -4,
                                                width: 9,
                                                height: 9,
                                            },
                                        }}
                                    />
                                )}
                                {badgeCount > 0 && (
                                    <Box
                                        component="span"
                                        sx={{
                                            position: 'absolute',
                                            top: 0,
                                            right: -6,
                                            minWidth: 16,
                                            height: 16,
                                            px: 0.5,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '999px',
                                            bgcolor: badge.color === 'primary'
                                                ? theme.vars.palette.primary[500]
                                                : theme.vars.palette.neutral[500],
                                            color: '#fff',
                                            fontSize: '0.625rem',
                                            fontWeight: 600,
                                            lineHeight: 1.2,
                                            '@media (orientation: landscape)': {
                                                top: -4,
                                                right: -8,
                                                minWidth: 14,
                                                height: 14,
                                                fontSize: '0.5625rem',
                                            },
                                        }}
                                    >
                                        {badgeCount}
                                    </Box>
                                )}
                            </Box>
                            <Box
                                component="span"
                                sx={{
                                    color: itemColor,
                                    lineHeight: 1.2,
                                    '@media (orientation: landscape)': {
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '100%',
                                    },
                                }}
                            >
                                {item.label}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
