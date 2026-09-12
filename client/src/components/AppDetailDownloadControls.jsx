import React from 'react';
import {
    Box,
    Stack,
    Button,
    IconButton,
    Tooltip,
    Typography,
} from '@mui/joy';
import { Download, Delete, Refresh, InstallMobile } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppDownload } from '../contexts/AppContext';
import { openManifestInstall, openPackageDownload, resolveClientErrorMessage } from '../utils/api';
import Swal from 'sweetalert2';
import {
    canShowInstallForVersion,
    findStorageFileName,
    getLatestTaskInfo,
    getLocalFileForVersion,
    getVersionTaskInfo,
} from '../utils/downloadTaskInfo';

async function openPackageDownloadForVersion(taskList, appTrackId, versionId, storeLatestVersionId, t) {
    try {
        const fileName = findStorageFileName(taskList, appTrackId, versionId, storeLatestVersionId);
        await openPackageDownload(fileName);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: resolveClientErrorMessage(error, t('ui.downloadFailed')),
        });
    }
}

async function openManifestInstallForVersion(taskList, appTrackId, versionId, storeLatestVersionId, t) {
    const baseName = findStorageFileName(taskList, appTrackId, versionId, storeLatestVersionId).replace(/\.ipa$/i, '');
    if (!baseName.includes('_')) {
        return;
    }

    try {
        await openManifestInstall(baseName);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: resolveClientErrorMessage(error, t('ui.downloadFailed')),
        });
    }
}

/** 当前版本 Tab 中来自本地 ipa 的版本号 / 大小 */
export function AppDetailLatestVersionMeta({
    app,
    storeLatestVersionId,
    formatFileSize,
    t,
}) {
    const { fileList } = useAppDownload();
    const latestLocalFile = storeLatestVersionId
        ? getLocalFileForVersion(fileList, app?.trackId, storeLatestVersionId, storeLatestVersionId)
        : null;

    return (
        <>
            <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">{t('ui.currentVersion')}:</Typography>
                <Typography level="body-sm" fontWeight="md">
                    {latestLocalFile?.bundleShortVersionString || app.version}
                </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">{t('ui.fileSize')}:</Typography>
                <Typography level="body-sm">
                    {formatFileSize(latestLocalFile?.size ?? app.fileSizeBytes)}
                </Typography>
            </Stack>
        </>
    );
}

/** 历史版本行标题：本地 metadata 优先 */
export function AppDetailVersionTitle({
    version,
    app,
    storeLatestVersionId,
    fallbackDisplayName,
    t,
}) {
    const { fileList } = useAppDownload();
    const localFile = getLocalFileForVersion(fileList, app?.trackId, version.versionId, storeLatestVersionId);
    const shortVersion = localFile?.bundleShortVersionString;
    const displayName = shortVersion && shortVersion !== '未知'
        ? t('ui.versionNamed', { version: shortVersion })
        : fallbackDisplayName;

    return (
        <Typography level="title-sm" color={version.isLatest ? 'success' : 'neutral'}>
            {displayName}
        </Typography>
    );
}

/** 最新版下载区：独立订阅 WS，避免 AppDetail 主体重渲染 */
export function AppDetailLatestDownloadControls({
    app,
    storeLatestVersionId,
    downloadingLatest,
    showOtaInstall,
    onDownload,
    onDeleteTask,
}) {
    const { t } = useTranslation();
    const { taskList, fileList } = useAppDownload();
    const taskInfo = getLatestTaskInfo(taskList, fileList, app?.trackId, storeLatestVersionId);

    if (!taskInfo) {
        return (
            <Button
                startDecorator={<Download />}
                size="sm"
                fullWidth
                loading={downloadingLatest}
                onClick={() => onDownload('latest', app.bundleId)}
            >
                {t('ui.downloadLatest')}
            </Button>
        );
    }

    switch (taskInfo.status) {
        case 'running':
            return (
                <>
                    <Button fullWidth>
                        {t('ui.downloading')} {taskInfo.percentage}%
                    </Button>
                    <Stack direction="row" gap={1} justifyContent="center">
                        <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                        >
                            <Delete />
                        </IconButton>
                    </Stack>
                </>
            );

        case 'pending':
            return (
                <>
                    <Box sx={{ flex: 1 }}>
                        <Button fullWidth loading>{t('ui.waitingDownload')}</Button>
                    </Box>
                    <Stack direction="row" gap={1} justifyContent="center">
                        <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            disabled
                            onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                        >
                            <Delete />
                        </IconButton>
                    </Stack>
                </>
            );

        case 'completed': {
            const showInstall = showOtaInstall && canShowInstallForVersion(taskList, app.trackId, 'latest', storeLatestVersionId);

            return (
                <>
                    <Stack
                        gap={1}
                        sx={{
                            width: '100%',
                            flex: 1,
                            display: { xs: 'flex', sm: 'none' },
                        }}
                    >
                        <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
                            {showInstall ? (
                                <Button
                                    fullWidth
                                    size="sm"
                                    color="success"
                                    startDecorator={<InstallMobile />}
                                    sx={{ flex: 1, minWidth: 0 }}
                                    onClick={() => openManifestInstallForVersion(taskList, app.trackId, 'latest', storeLatestVersionId, t)}
                                >
                                    {t('ui.install')}
                                </Button>
                            ) : null}
                            <Button
                                fullWidth
                                size="sm"
                                startDecorator={<Download />}
                                sx={{ flex: 1, minWidth: 0 }}
                                onClick={() => openPackageDownloadForVersion(taskList, app.trackId, 'latest', storeLatestVersionId, t)}
                            >
                                {t('ui.downloadIPA')}
                            </Button>
                        </Stack>
                        <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                            >
                                <Delete />
                            </IconButton>
                            <Button
                                size="sm"
                                variant="outlined"
                                color="primary"
                                startDecorator={<Refresh />}
                                onClick={() => onDownload('latest', app.bundleId)}
                            >
                                {t('ui.redownloadLatest')}
                            </Button>
                        </Stack>
                    </Stack>
                    <Stack
                        direction="row"
                        gap={1}
                        alignItems="center"
                        sx={{
                            flex: 1,
                            width: '100%',
                            display: { xs: 'none', sm: 'flex' },
                        }}
                    >
                        {showInstall ? (
                            <Button
                                fullWidth
                                size="sm"
                                color="success"
                                startDecorator={<InstallMobile />}
                                sx={{ flex: 1, minWidth: 0 }}
                                onClick={() => openManifestInstallForVersion(taskList, app.trackId, 'latest', storeLatestVersionId, t)}
                            >
                                {t('ui.install')}
                            </Button>
                        ) : null}
                        <Button
                            fullWidth
                            size="sm"
                            startDecorator={<Download />}
                            sx={{ flex: 1, minWidth: 0 }}
                            onClick={() => openPackageDownloadForVersion(taskList, app.trackId, 'latest', storeLatestVersionId, t)}
                        >
                            {t('ui.downloadIPA')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="primary"
                            startDecorator={<Refresh />}
                            onClick={() => onDownload('latest', app.bundleId)}
                        >
                            {t('ui.redownloadLatest')}
                        </Button>
                        <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                        >
                            <Delete />
                        </IconButton>
                    </Stack>
                </>
            );
        }

        case 'failed':
            return (
                <>
                    <Box sx={{ flex: 1 }}>
                        <Button fullWidth variant="soft" color="danger">
                            {taskInfo.status === 'failed' ? t('ui.downloadFailed') : t('ui.cancelled')}
                        </Button>
                    </Box>
                    <Stack direction="row" gap={1} justifyContent="center">
                        <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                        >
                            <Delete />
                        </IconButton>
                    </Stack>
                </>
            );

        default:
            return (
                <Button
                    startDecorator={<Download />}
                    size="sm"
                    fullWidth
                    loading={downloadingLatest}
                    onClick={() => onDownload('latest', app.bundleId)}
                >
                    {t('ui.downloadLatest')}
                </Button>
            );
    }
}

/** 历史版本下载钮：独立订阅 WS */
export function AppDetailVersionDownloadButton({
    version,
    app,
    storeLatestVersionId,
    isDownloading,
    showOtaInstall,
    onDownload,
    onDeleteTask,
}) {
    const { t } = useTranslation();
    const { taskList, fileList } = useAppDownload();
    const taskInfo = getVersionTaskInfo(taskList, fileList, app?.trackId, version.versionId, storeLatestVersionId);

    if (!taskInfo && !isDownloading) {
        return (
            <Button
                size="sm"
                variant="outlined"
                startDecorator={<Download />}
                onClick={() => onDownload(version.versionId, app.bundleId)}
            >
                {t('ui.download')}
            </Button>
        );
    }

    if (isDownloading && !taskInfo) {
        return (
            <Button
                size="sm"
                variant="outlined"
                loading
                disabled
            >
                {t('ui.creating')}
            </Button>
        );
    }

    if (!taskInfo) {
        return null;
    }

    switch (taskInfo.status) {
        case 'running':
            return (
                <Box sx={{
                    position: 'relative',
                    width: 80,
                    height: 32,
                    borderRadius: 'sm',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'primary.300',
                }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: `${taskInfo.percentage}%`,
                            bgcolor: 'primary.100',
                            transition: 'width 0.3s ease',
                        }}
                    />
                    <Button
                        size="sm"
                        variant="plain"
                        sx={{
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            height: '100%',
                            minHeight: 'auto',
                            fontSize: 'xs',
                            fontWeight: 'md',
                        }}
                        onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                    >
                        {taskInfo.percentage}%
                    </Button>
                </Box>
            );

        case 'pending':
            return (
                <Box sx={{
                    position: 'relative',
                    width: 80,
                    height: 32,
                    borderRadius: 'sm',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'neutral.300',
                }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: '100%',
                            bgcolor: 'neutral.50',
                        }}
                    />
                    <Button
                        size="sm"
                        variant="plain"
                        sx={{
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            height: '100%',
                            minHeight: 'auto',
                            fontSize: 'xs',
                        }}
                        onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                    >
                        {t('ui.waiting')}
                    </Button>
                </Box>
            );

        case 'completed':
            return (
                <Stack direction="row" gap={1} justifyContent="center">
                    <IconButton
                        size="sm"
                        variant="plain"
                        color="danger"
                        onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                    >
                        <Delete />
                    </IconButton>
                    {showOtaInstall && canShowInstallForVersion(taskList, app.trackId, version.versionId, storeLatestVersionId) && (
                        <Tooltip variant="outlined" color="primary" arrow size="sm" title={t('ui.installOtaHint')}>
                            <Button
                                size="sm"
                                color="success"
                                startDecorator={<InstallMobile />}
                                onClick={() => openManifestInstallForVersion(taskList, app.trackId, version.versionId, storeLatestVersionId, t)}
                            >
                                {t('ui.install')}
                            </Button>
                        </Tooltip>
                    )}
                    <Button
                        size="sm"
                        startDecorator={<Download />}
                        onClick={() => openPackageDownloadForVersion(taskList, app.trackId, version.versionId, storeLatestVersionId, t)}
                    >
                        {t('ui.downloadIPA')}
                    </Button>
                </Stack>
            );

        case 'failed':
            return (
                <Box sx={{
                    position: 'relative',
                    width: 80,
                    height: 32,
                    borderRadius: 'sm',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'danger.300',
                }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: '100%',
                            bgcolor: 'danger.100',
                        }}
                    />
                    <Button
                        size="sm"
                        variant="plain"
                        color="danger"
                        sx={{
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            height: '100%',
                            minHeight: 'auto',
                            fontSize: 'xs',
                        }}
                    >
                        {t('ui.failed')}
                    </Button>
                    <IconButton
                        size="sm"
                        variant="plain"
                        color="danger"
                        sx={{
                            position: 'absolute',
                            right: 2,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 2,
                            minHeight: 'auto',
                            width: 20,
                            height: 20,
                        }}
                        onClick={() => onDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                    >
                        <Delete sx={{ fontSize: 12 }} />
                    </IconButton>
                </Box>
            );

        default:
            return (
                <Button
                    size="sm"
                    variant="outlined"
                    startDecorator={<Download />}
                    onClick={() => onDownload(version.versionId, app.bundleId)}
                >
                    {t('ui.download')}
                </Button>
            );
    }
}
