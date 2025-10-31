import React from 'react';
import { Box, Stack, Typography, Sheet, Button, Badge, Divider, Chip, IconButton } from '@mui/joy';
import { useNavigate, useLocation } from 'react-router-dom';
import { AddToHomeScreen as AddToHomeScreenIcon } from '@mui/icons-material';
import UserStatus from './UserStatus';
import AdminStatus from './AdminStatus';
import { useApp } from '../contexts/AppContext';
import { useAdmin } from '../contexts/AdminContext';
import GitHubIcon from '@mui/icons-material/GitHub';

export default function AppShell({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { taskList, user, isAuthenticated, loading, logout } = useApp();
    const { isLoggedIn, user: adminUser, logout: adminLogout, getFormattedExpiresAt, isExpiringSoon } = useAdmin();

    const handleNavigate = (path) => {
        navigate(path);
    };

    // // 管理员退出登录
    // const handleAdminLogout = async () => {
    //     try {
    //         await adminLogout();
    //         navigate('/login');
    //     } catch (error) {
    //         console.error('退出系统失败:', error);
    //     }
    // };

    const getBadgeInfo = () => {
        if (!taskList) return { count: 0, color: 'neutral' };

        const runningCount = taskList.running?.length || 0;
        const completedCount = taskList.completed?.length || 0;

        if (runningCount > 0) {
            return { count: runningCount, color: 'primary' };
        } else if (completedCount > 0) {
            return { count: completedCount, color: 'neutral' };
        }

        return { count: 0, color: 'neutral' };
    };

    const badgeInfo = getBadgeInfo();

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Sheet
                variant="outlined"
                sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    p: 2,
                    bgcolor: 'background.surface'
                }}
            >
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ maxWidth: '1200px', mx: 'auto', width: '100%' }}
                >
                    {/* 左侧标题 */}
                    <Stack direction="row" alignItems="center" gap={1}>
                        <IconButton color="primary">
                            <AddToHomeScreenIcon />
                        </IconButton>
                        <Typography
                            level="h3"
                            sx={{
                                fontWeight: 'bold',
                                color: 'primary.500',
                                display: { xs: 'none', sm: 'block' }
                            }}
                        >
                            IPA Harbor
                        </Typography>
                    </Stack>

                    {/* 右侧导航按钮 */}
                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="plain"
                            size="sm"
                            onClick={() => handleNavigate('/')}
                            color={location.pathname === '/' ? 'primary' : 'neutral'}
                        >
                            首页
                        </Button>
                        <Badge
                            badgeContent={badgeInfo.count > 0 ? badgeInfo.count : null}
                            color={badgeInfo.color}
                            size="sm"
                        >
                            <Button
                                variant="plain"
                                size="sm"
                                onClick={() => handleNavigate('/dl')}
                                color={location.pathname === '/dl' ? 'primary' : 'neutral'}
                            >
                                下载管理
                            </Button>
                        </Badge>

                        {isAuthenticated ? <UserStatus /> : (
                            <Button
                                variant="outlined"
                                size="sm"
                                onClick={() => handleNavigate('/apple-id')}
                                color={location.pathname === '/apple-id' ? 'primary' : 'danger'}
                            >
                                {location.pathname === '/apple-id' ? '登录 Apple ID' : '需要登录 Apple ID'}
                            </Button>
                        )}
                        {/* <AdminStatus /> */}
                    </Stack>
                </Stack>
            </Sheet>

            {/* 主要内容区域 */}
            <Box
                component="main"
                sx={{
                    flex: 1,
                    p: 3,
                    maxWidth: '1200px',
                    mx: 'auto',
                    width: '100%',
                    pb: 8
                }}
            >
                {children}
            </Box>

            {/* Footer */}
            <Sheet
                variant="outlined"
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    borderTop: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.surface',
                    p: 1,
                    // zIndex: 1000
                }}
            >

                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ maxWidth: '1200px', mx: 'auto', width: '100%' }}
                >
                    {/* 左侧：管理员信息 */}
                    <Stack direction="column" alignItems="flex-start" gap={0.2}>
                        <Typography level="body-xs">IPA Harbor ©2025</Typography>
                        <Stack direction="row" gap={0.2} sx={{
                            cursor: 'pointer',
                            ":hover": {
                                opacity: 0.8
                            },
                            transition: 'opacity 0.2s ease-in-out'
                        }}>
                            <Typography level="body-xs" sx={{
                                fontSize: '0.625rem', fontWeight: 'normal',

                            }}
                                onClick={() => window.open('https://github.com/ij369/ipa-harbor', '_blank')}
                                startDecorator={<GitHubIcon sx={{ fontSize: '0.75rem' }} />}>一个基于 ipatool 的开源 IPA 可视化 Web 管理工具</Typography>
                            <Typography level="body-xs" sx={{
                                fontSize: '0.625rem', fontWeight: 'normal',
                                display: { xs: 'none', sm: 'none', md: 'block' }
                            }}
                                onClick={() => window.open('https://github.com/ij369/ipa-harbor', '_blank')}
                            >, 支持 App 搜索、历史版本下载与容器化部署。</Typography>
                        </Stack>
                    </Stack>

                    {/* 右侧：操作按钮 */}
                    <Stack direction="row" alignItems="center" gap={1}>
                        <AdminStatus />
                    </Stack>
                </Stack>
            </Sheet>
        </Box>
    );
}
