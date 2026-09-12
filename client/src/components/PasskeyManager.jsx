import * as React from 'react';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import Input from '@mui/joy/Input';
import Button from '@mui/joy/Button';
import IconButton from '@mui/joy/IconButton';
import Alert from '@mui/joy/Alert';
import Tooltip from '@mui/joy/Tooltip';
import Avatar from '@mui/joy/Avatar';
import Box from '@mui/joy/Box';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import ComputerIcon from '@mui/icons-material/Computer';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import PasskeyIcon from './PasskeyIcon';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import Swal from 'sweetalert2';
import Dialog from './Dialog';
import { useJoyDown } from '../hooks/useJoyMedia';
import {
    deletePasskey,
    listPasskeys,
    passkeyRegisterOptions,
    passkeyRegisterVerify,
    updatePasskeyNickname,
    resolveClientErrorMessage,
} from '../utils/api';
import { isPasskeySupported, performPasskeyRegister, resolvePasskeyClientError } from '../utils/passkey';
import { useAdmin } from '../contexts/AdminContext';

function renderPasskeyDeviceTypeAvatar(deviceType) {
    if (deviceType === 'multiDevice') {
        return <CloudSyncIcon sx={{ fontSize: 18 }} />;
    }
    if (deviceType === 'singleDevice') {
        return <ComputerIcon sx={{ fontSize: 18 }} />;
    }
    return <PasskeyIcon sx={{ fontSize: 18 }} />;
}

function PasskeyManager({
    size = 'sm',
    sx,
    ...triggerProps
}) {
    const { t } = useTranslation();
    const belowMd = useJoyDown('md');
    const { statusLoaded, passkeyEnabled } = useAdmin();
    const passkeySupported = statusLoaded && passkeyEnabled && isPasskeySupported();

    const [open, setOpen] = React.useState(false);
    const [passkeys, setPasskeys] = React.useState([]);
    const [listLoading, setListLoading] = React.useState(false);
    const [registerLoading, setRegisterLoading] = React.useState(false);
    const [deleteLoadingId, setDeleteLoadingId] = React.useState(null);
    const [editSavingId, setEditSavingId] = React.useState(null);
    const [editingId, setEditingId] = React.useState(null);
    const [editingNickname, setEditingNickname] = React.useState('');
    const [error, setError] = React.useState('');

    const loadPasskeys = React.useCallback(async () => {
        setListLoading(true);
        setError('');
        try {
            const response = await listPasskeys();
            setPasskeys(response.data?.passkeys || []);
        } catch (err) {
            setError(resolveClientErrorMessage(err) || t('ui.passkeyLoadFailed'));
        } finally {
            setListLoading(false);
        }
    }, [t]);

    const clearEditing = () => {
        setEditingId(null);
        setEditingNickname('');
    };

    const resetFields = () => {
        setError('');
        setDeleteLoadingId(null);
        setEditSavingId(null);
        clearEditing();
    };

    const handleOpen = () => {
        resetFields();
        setOpen(true);
        if (passkeySupported) {
            loadPasskeys();
        }
    };

    const handleClose = () => {
        setOpen(false);
        resetFields();
        setPasskeys([]);
    };

    const handleRegister = async () => {
        if (!passkeySupported) {
            setError(t('ui.passkeyRequiresSecureContext'));
            return;
        }

        setRegisterLoading(true);
        setError('');
        try {
            const optionsResponse = await passkeyRegisterOptions();
            const { challengeId, options } = optionsResponse.data;
            const credential = await performPasskeyRegister(options);
            await passkeyRegisterVerify(challengeId, credential);
            await loadPasskeys();
            Swal.fire({
                icon: 'success',
                title: t('ui.passkeyRegisterSuccess'),
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top',
            });
        } catch (err) {
            const message = resolvePasskeyClientError(err);
            if (message) {
                setError(message);
            }
        } finally {
            setRegisterLoading(false);
        }
    };

    const startEditing = (item) => {
        setError('');
        setEditingId(item.id);
        setEditingNickname(item.nickname || '');
    };

    const handleCancelEdit = () => {
        clearEditing();
    };

    const handleSubmitEdit = async (item) => {
        const nextNickname = editingNickname.trim();
        const currentNickname = (item.nickname || '').trim();
        if (nextNickname === currentNickname) {
            clearEditing();
            return;
        }

        setEditSavingId(item.id);
        setError('');
        try {
            await updatePasskeyNickname(item.id, nextNickname);
            clearEditing();
            await loadPasskeys();
            Swal.fire({
                icon: 'success',
                title: t('ui.passkeyNicknameUpdateSuccess'),
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top',
            });
        } catch (err) {
            setError(resolveClientErrorMessage(err) || t('ui.passkeyNicknameUpdateFailed'));
        } finally {
            setEditSavingId(null);
        }
    };

    const handleDelete = async (id) => {
        setDeleteLoadingId(id);
        setError('');
        try {
            await deletePasskey(id);
            if (editingId === id) {
                clearEditing();
            }
            await loadPasskeys();
            Swal.fire({
                icon: 'success',
                title: t('ui.passkeyDeleteSuccess'),
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top',
            });
        } catch (err) {
            setError(resolveClientErrorMessage(err) || t('ui.passkeyDeleteFailed'));
        } finally {
            setDeleteLoadingId(null);
        }
    };

    const isRowBusy = (itemId) => (
        registerLoading
        || deleteLoadingId === itemId
        || editSavingId === itemId
        || (editingId != null && editingId !== itemId)
    );

    const triggerLabel = t('ui.passkeyManagement');
    const triggerDisabled = !passkeySupported;

    const trigger = belowMd ? (
        <Tooltip title={triggerDisabled ? t('ui.passkeyRequiresSecureContext') : triggerLabel}>
            <IconButton
                size={size}
                variant="plain"
                color="neutral"
                aria-label={triggerLabel}
                onClick={handleOpen}
                disabled={triggerDisabled}
                sx={sx}
                {...triggerProps}
            >
                <PasskeyIcon sx={{ fontSize: 18 }} />
            </IconButton>
        </Tooltip>
    ) : (
        <Tooltip title={triggerDisabled ? t('ui.passkeyRequiresSecureContext') : ''} disableHoverListener={!triggerDisabled}>
            <Button
                size={size}
                variant="plain"
                color="neutral"
                startDecorator={<PasskeyIcon sx={{ fontSize: 18 }} />}
                onClick={handleOpen}
                disabled={triggerDisabled}
                sx={sx}
                {...triggerProps}
            >
                {triggerLabel}
            </Button>
        </Tooltip>
    );

    return (
        <>
            {trigger}

            <Dialog
                isOpen={open}
                onClose={handleClose}
                title={triggerLabel}
                size="medium"
                actions={passkeySupported ? (
                    <Stack direction="row" spacing={1} sx={{ width: '100%', justifyContent: 'flex-end' }}>
                        <Button variant="outlined" color="neutral" onClick={handleClose} disabled={registerLoading || editingId != null}>
                            {t('ui.cancel')}
                        </Button>
                        <Button
                            loading={registerLoading}
                            disabled={registerLoading || listLoading || editingId != null}
                            onClick={handleRegister}
                        >
                            {t('ui.passkeyAdd')}
                        </Button>
                    </Stack>
                ) : (
                    <Stack direction="row" spacing={1} sx={{ width: '100%', justifyContent: 'flex-end' }}>
                        <Button variant="outlined" color="neutral" onClick={handleClose}>
                            {t('ui.close')}
                        </Button>
                    </Stack>
                )}
            >
                {!passkeySupported ? (
                    <Alert color="neutral" size="sm">
                        {t('ui.passkeyRequiresSecureContext')}
                    </Alert>
                ) : (
                    <Stack spacing={2}>
                        {listLoading ? (
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                {t('ui.loading')}
                            </Typography>
                        ) : passkeys.length === 0 ? (
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                {t('ui.passkeyEmpty')}
                            </Typography>
                        ) : (
                            <List
                                size="sm"
                                sx={{
                                    '--ListItem-paddingY': '10px',
                                    '--ListDivider-gap': '0.375rem',
                                }}
                            >
                                {passkeys.map((item, index) => {
                                    const isEditing = editingId === item.id;
                                    const rowBusy = isRowBusy(item.id);
                                    const isFirst = index === 0;
                                    const isLast = index === passkeys.length - 1;

                                    return (
                                        <ListItem
                                            key={item.id}
                                            sx={{
                                                alignItems: 'center',
                                                pt: isFirst ? 'var(--ListItem-paddingY)' : 0,
                                                pb: isLast ? 'var(--ListItem-paddingY)' : 0,
                                            }}
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={1.5}
                                                alignItems="center"
                                                sx={{ flex: 1, minWidth: 0, width: '100%' }}
                                            >
                                                <Avatar
                                                    variant="soft"
                                                    color="neutral"
                                                    size="sm"
                                                    aria-hidden
                                                    sx={{
                                                        flexShrink: 0,
                                                        alignSelf: 'center',
                                                        '--Avatar-size': '32px',
                                                    }}
                                                >
                                                    {renderPasskeyDeviceTypeAvatar(item.deviceType)}
                                                </Avatar>
                                                <Box
                                                    sx={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                        ...(index > 0 && {
                                                            borderTop: '1px solid',
                                                            borderColor: 'divider',
                                                            pt: 'calc(var(--ListItem-paddingY) + var(--ListDivider-gap))',
                                                        }),
                                                        ...(!isLast && {
                                                            pb: 'calc(var(--ListItem-paddingY) + var(--ListDivider-gap))',
                                                        }),
                                                    }}
                                                >
                                                    <Stack
                                                        direction="row"
                                                        spacing={0.5}
                                                        alignItems="center"
                                                        sx={{ minWidth: 0 }}
                                                    >
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            {isEditing ? (
                                                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ width: '100%' }}>
                                                                    <Input
                                                                        size="sm"
                                                                        autoFocus
                                                                        value={editingNickname}
                                                                        placeholder={item.providerName || t('ui.passkeyNicknamePlaceholder')}
                                                                        disabled={editSavingId === item.id}
                                                                        slotProps={{
                                                                            input: {
                                                                                maxLength: 64,
                                                                                autoComplete: 'off',
                                                                                onKeyDown: (event) => {
                                                                                    if (event.key === 'Enter') {
                                                                                        event.preventDefault();
                                                                                        handleSubmitEdit(item);
                                                                                    }
                                                                                    if (event.key === 'Escape') {
                                                                                        event.preventDefault();
                                                                                        handleCancelEdit();
                                                                                    }
                                                                                },
                                                                            },
                                                                        }}
                                                                        onChange={(event) => setEditingNickname(event.target.value)}
                                                                        sx={{ flex: 1, minWidth: 0 }}
                                                                    />
                                                                    <Tooltip title={t('ui.discard')}>
                                                                        <IconButton
                                                                            size="sm"
                                                                            variant="plain"
                                                                            color="neutral"
                                                                            disabled={editSavingId === item.id}
                                                                            onClick={handleCancelEdit}
                                                                            aria-label={t('ui.discard')}
                                                                        >
                                                                            <CloseIcon sx={{ fontSize: 18 }} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title={t('ui.submit')}>
                                                                        <IconButton
                                                                            size="sm"
                                                                            variant="plain"
                                                                            color="primary"
                                                                            loading={editSavingId === item.id}
                                                                            disabled={editSavingId === item.id}
                                                                            onClick={() => handleSubmitEdit(item)}
                                                                            aria-label={t('ui.submit')}
                                                                        >
                                                                            <CheckIcon sx={{ fontSize: 18 }} />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                </Stack>
                                                            ) : (
                                                                <Typography level="body-sm" fontWeight="md" noWrap sx={{ lineHeight: 1.4 }}>
                                                                    {item.displayName || item.providerName || item.nickname || t('ui.passkeyUnnamed')}
                                                                </Typography>
                                                            )}
                                                            {item.lastUsedAt != null && (
                                                                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: isEditing ? 0.5 : 0.25, lineHeight: 1.3 }}>
                                                                    {dayjs(item.lastUsedAt).format('YYYY-MM-DD HH:mm:ss')}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                        {!isEditing && (
                                                            <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0, ml: 0.5 }}>
                                                                <IconButton
                                                                    size="sm"
                                                                    variant="plain"
                                                                    color="neutral"
                                                                    disabled={rowBusy}
                                                                    onClick={() => startEditing(item)}
                                                                    aria-label={t('ui.passkeyEditNickname')}
                                                                >
                                                                    <EditOutlinedIcon />
                                                                </IconButton>
                                                                <IconButton
                                                                    size="sm"
                                                                    variant="plain"
                                                                    color="danger"
                                                                    loading={deleteLoadingId === item.id}
                                                                    disabled={rowBusy}
                                                                    onClick={() => handleDelete(item.id)}
                                                                    aria-label={t('ui.passkeyDelete')}
                                                                >
                                                                    <DeleteOutlineIcon />
                                                                </IconButton>
                                                            </Stack>
                                                        )}
                                                    </Stack>
                                                </Box>
                                            </Stack>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        )}

                        {error && <Alert color="danger" size="sm">{error}</Alert>}
                    </Stack>
                )}
            </Dialog>
        </>
    );
}

export default React.memo(PasskeyManager);
