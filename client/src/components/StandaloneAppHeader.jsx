import React from 'react';
import {
    Stack,
    Typography,
    Sheet,
    IconButton,
} from '@mui/joy';
import { AddToHomeScreen as AddToHomeScreenIcon } from '@mui/icons-material';

/** A2HS / standalone 顶栏：fixed 毛玻璃，布局与浏览器 Header 一致；横屏时由 CSS 隐藏 */
export default function StandaloneAppHeader({ onNavigate, children }) {
    return (
        <Sheet
            component="header"
            className="safe-area-x app-shell-header app-shell-header--fixed"
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                border: 'none',
                borderBottom: '1px solid',
                borderColor: 'divider',
                borderRadius: 0,
                pb: 2,
                bgcolor: 'transparent',
                '--safe-area-pad-x': '16px',
            }}
        >
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
            >
                <Stack direction="row" alignItems="center" gap={1}>
                    <IconButton color="primary" onClick={() => onNavigate('/')}>
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

                {children}
            </Stack>
        </Sheet>
    );
}
