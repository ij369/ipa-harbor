import React, { useState } from 'react';
import {
    Button,
    Dropdown,
    MenuButton,
    Menu,
    MenuItem,
    Typography,
    Box,
    Chip,
    Divider
} from '@mui/joy';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { ExitToApp, Person } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import { useTranslation } from 'react-i18next';

const AdminStatus = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { isLoggedIn, user, logout, getFormattedExpiresAt, isExpiringSoon } = useAdmin();
    const [logoutLoading, setLogoutLoading] = useState(false);

    const handleLogout = async () => {
        setLogoutLoading(true);
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('退出登录失败:', error);
        } finally {
            setLogoutLoading(false);
        }
    };

    const handleGoToLogin = () => {
        navigate('/login');
    };

    if (!isLoggedIn || !user) {
        return (
            <Button
                variant="outlined"
                size="sm"
                startDecorator={<Person />}
                onClick={handleGoToLogin}
            >
                {/* 登录系统*/}
                {t('ui.loginSystem')}
            </Button>
        );
    }

    return (
        <Dropdown>
            <MenuButton
                slots={{ root: Button }}
                slotProps={{
                    root: {
                        variant: 'plain',
                        size: 'sm',
                        startDecorator: <AdminPanelSettingsIcon />
                    }
                }}
            >
                {user.username}
                {isExpiringSoon() && (
                    <Chip color="warning" size="sm" sx={{ ml: 1 }}>
                        {/* 即将过期 */}
                        {t('ui.expiringSoon')}
                    </Chip>
                )}
            </MenuButton>
            <Menu placement="bottom-end" sx={{ minWidth: 250 }}>
                <MenuItem disabled>
                    <Box>
                        <Typography level="body-sm" sx={{ fontWeight: 'bold' }}>
                            {user.username}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            {/* 系统管理员账户 */}
                            {t('ui.adminAccount')}
                        </Typography>
                    </Box>
                </MenuItem>

                <MenuItem disabled>
                    <Box>
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            {/* 过期时间 */}
                            {t('ui.expiryTime')}
                        </Typography>
                        <Typography level="body-xs">
                            {getFormattedExpiresAt()}
                        </Typography>
                        {isExpiringSoon() && (
                            <Chip color="warning" size="sm" sx={{ mt: 0.5 }}>
                                {/* 即将过期 */}
                                {t('ui.expiringSoon')}
                            </Chip>
                        )}
                    </Box>
                </MenuItem>

                <Divider />

                {/* <MenuItem onClick={handleGoToLogin}>
                    <Person sx={{ mr: 1 }} />
                    管理员信息
                </MenuItem> */}

                <MenuItem
                    onClick={handleLogout}
                    disabled={logoutLoading}
                    color="danger"
                >
                    <ExitToApp sx={{ mr: 1 }} />
                    {/* {logoutLoading ? '退出中...' : '退出系统'} */}
                    {logoutLoading ? t('ui.loggingOut') : t('ui.logoutSystem')}
                </MenuItem>
            </Menu>
        </Dropdown>
    );
};

export default AdminStatus;
