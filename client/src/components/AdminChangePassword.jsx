import * as React from 'react';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import Input from '@mui/joy/Input';
import Button from '@mui/joy/Button';
import IconButton from '@mui/joy/IconButton';
import Alert from '@mui/joy/Alert';
import Tooltip from '@mui/joy/Tooltip';
import LockReset from '@mui/icons-material/LockReset';
import { useTranslation } from 'react-i18next';
import Swal from 'sweetalert2';
import Dialog from './Dialog';
import { useAdmin } from '../contexts/AdminContext';
import { useJoyDown } from '../hooks/useJoyMedia';
import { adminChangePassword, resolveClientErrorMessage } from '../utils/api';

const FORM_ID = 'admin-change-password-form';

function AdminChangePassword({
    size = 'sm',
    sx,
    ...triggerProps
}) {
    const { t } = useTranslation();
    const { user } = useAdmin();
    const belowMd = useJoyDown('md');
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [currentPassword, setCurrentPassword] = React.useState('');
    const [newPassword, setNewPassword] = React.useState('');

    const resetFields = () => {
        setCurrentPassword('');
        setNewPassword('');
        setError('');
    };

    const handleOpen = () => {
        resetFields();
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        resetFields();
    };

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (!currentPassword || !newPassword) {
            setError(t('ui.changePasswordRequired'));
            return;
        }
        if (newPassword.length < 6) {
            setError(t('ui.passwordMinLength'));
            return;
        }

        setLoading(true);
        try {
            await adminChangePassword({ currentPassword, newPassword });
            handleClose();
            Swal.fire({
                icon: 'success',
                title: t('ui.changePasswordSuccess'),
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top',
            });
        } catch (submitError) {
            setError(resolveClientErrorMessage(submitError) || t('apiErrorMessages.ADMIN_CHANGE_PASSWORD_FAILED'));
        } finally {
            setLoading(false);
        }
    };

    const trigger = belowMd ? (
        <Tooltip title={t('ui.changePassword')}>
            <IconButton
                size={size}
                variant="plain"
                color="neutral"
                aria-label={t('ui.changePassword')}
                onClick={handleOpen}
                sx={sx}
                {...triggerProps}
            >
                <LockReset sx={{ fontSize: 18 }} />
            </IconButton>
        </Tooltip>
    ) : (
        <Button
            size={size}
            variant="plain"
            color="neutral"
            startDecorator={<LockReset sx={{ fontSize: 18 }} />}
            onClick={handleOpen}
            sx={sx}
            {...triggerProps}
        >
            {t('ui.changePassword')}
        </Button>
    );

    return (
        <>
            {trigger}

            <Dialog
                isOpen={open}
                onClose={handleClose}
                title={t('ui.changePassword')}
                size="medium"
                actions={(
                    <Stack direction="row" spacing={1} sx={{ width: '100%', justifyContent: 'flex-end' }}>
                        <Button variant="outlined" color="neutral" onClick={handleClose} disabled={loading}>
                            {t('ui.cancel')}
                        </Button>
                        <Button type="submit" form={FORM_ID} loading={loading} disabled={loading}>
                            {t('ui.changePasswordSubmit')}
                        </Button>
                    </Stack>
                )}
            >
                <form id={FORM_ID} onSubmit={handleFormSubmit}>
                    <Stack spacing={2}>
                        <Stack spacing={0.5}>
                            <Typography level="body-sm">{t('ui.username')}</Typography>
                            <Input
                                name="username"
                                autoComplete="username"
                                value={user?.username ?? ''}
                                readOnly
                            />
                        </Stack>
                        <Stack spacing={0.5}>
                            <Typography level="body-sm">{t('ui.currentPassword')}</Typography>
                            <Input
                                name="currentPassword"
                                type="password"
                                autoComplete="current-password"
                                placeholder={t('ui.currentPasswordPlaceholder')}
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                            />
                        </Stack>
                        <Stack spacing={0.5}>
                            <Typography level="body-sm">{t('ui.newPassword')}</Typography>
                            <Input
                                name="newPassword"
                                type="password"
                                autoComplete="new-password"
                                placeholder={t('ui.passwordInputPlaceholder')}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                            />
                        </Stack>
                        {error && <Alert color="danger" size="sm">{error}</Alert>}
                    </Stack>
                </form>
            </Dialog>
        </>
    );
}

export default React.memo(AdminChangePassword);
