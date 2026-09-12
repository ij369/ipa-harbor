import React from 'react';
import { Sheet } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import StandaloneBottomNav from './StandaloneBottomNav';
import { useAppSession, useAppDownload } from '../contexts/AppContext';

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

/** A2HS / standalone 底栏：fixed 毛玻璃，内容从 Home Indicator 上缘结束 */
export default function StandaloneAppFooter({ currentPath, onNavigate }) {
    const { t } = useTranslation();
    const { isAuthenticated } = useAppSession();
    const badgeInfo = useDownloadNavBadge();

    const navItems = [
        { path: '/', label: t('ui.search') },
        { path: '/purchases', label: t('ui.purchasedApps') },
        { path: '/dl', label: t('ui.downloadManager'), badge: badgeInfo },
        {
            path: '/settings',
            label: t('ui.settings'),
            badge: !isAuthenticated ? { dot: true, color: 'danger' } : undefined,
        },
    ];

    const visibleNavItems = isAuthenticated
        ? navItems
        : navItems.filter((item) => item.path !== '/purchases');

    return (
        <Sheet
            component="footer"
            className="app-shell-footer app-shell-footer--fixed"
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                border: 'none',
                borderTop: '1px solid',
                borderColor: 'divider',
                borderRadius: 0,
                bgcolor: 'transparent',
            }}
        >
            <StandaloneBottomNav
                navItems={visibleNavItems}
                currentPath={currentPath}
                onNavigate={onNavigate}
            />
        </Sheet>
    );
}
