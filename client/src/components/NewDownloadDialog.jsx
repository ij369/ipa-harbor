import React, { useState, useEffect } from 'react';
import { Box, Stack, Input, Button, Textarea, Typography } from '@mui/joy';
import Dialog from './Dialog';
import RegionSelector from './RegionSelector';
import { getAppDetails, downloadApp } from '../utils/api';
import Swal from 'sweetalert2';
import { useTranslation } from 'react-i18next';
import { useApp } from '../contexts/AppContext';
import { Add } from '@mui/icons-material';

const STORAGE_KEY = 'new_download_memory';

// 导出按钮组件
export function NewDownloadButton({ onClick }) {
    const { t } = useTranslation();
    return (
        <Button
            variant="soft"
            color="primary"
            startDecorator={<Add />}
            onClick={onClick}
        >
            {t('ui.newDownload')}
        </Button>
    );
}

export default function NewDownloadDialog({ isOpen, onClose }) {
    const { t } = useTranslation();
    const { user, setUser } = useApp();
    const [appId, setAppId] = useState('');
    const [versionId, setVersionId] = useState('');
    const [memory, setMemory] = useState('');
    const [loading, setLoading] = useState(false);
    const [regionDialogOpen, setRegionDialogOpen] = useState(false);

    /**
     * 从输入中提取应用ID
     * 支持三种格式：
     * 1. id6755630162
     * 2. 6755630162
     * 3. https://apps.apple.com/cn/app/.../id6755630162
     */
    const extractAppId = (input) => {
        const trimmed = input.trim();
        const urlMatch = trimmed.match(/\/id(\d+)(?:\?|$|\/)/i);
        if (urlMatch) {
            return urlMatch[1];
        }

        const idPrefixMatch = trimmed.match(/^id(\d+)$/i);
        if (idPrefixMatch) {
            return idPrefixMatch[1];
        }

        if (/^\d+$/.test(trimmed)) {
            return trimmed;
        }

        return null;
    };

    useEffect(() => {
        if (isOpen) {
            const savedMemory = localStorage.getItem(STORAGE_KEY);
            if (savedMemory) {
                setMemory(savedMemory);
            }
        }
    }, [isOpen]);

    const handleMemoryInput = (e) => {
        const value = e.target.value;
        setMemory(value);
        localStorage.setItem(STORAGE_KEY, value);
    };

    const handleDownload = async () => {
        if (!appId.trim()) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.invalidAppId'),
                text: t('ui.invalidAppIdFormat'),
                confirmButtonText: t('ui.confirm')
            });
            return;
        }

        const extractedId = extractAppId(appId);
        if (!extractedId) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.invalidAppId'),
                text: t('ui.invalidAppIdFormat'),
                confirmButtonText: t('ui.confirm')
            });
            return;
        }

        setLoading(true);

        try {
            const detailsResponse = await getAppDetails([parseInt(extractedId)]);

            if (!detailsResponse.success || !detailsResponse.data || detailsResponse.data.length === 0) {
                throw new Error(detailsResponse.message || '无法获取应用详情');
            }

            const appDetail = detailsResponse.data[0];
            const bundleId = appDetail.bundleId;

            if (!bundleId) {
                throw new Error('无法获取应用的Bundle ID');
            }

            // 版本ID为空则使用latest
            const finalVersionId = versionId.trim() || 'latest';

            const downloadResponse = await downloadApp(
                parseInt(extractedId),
                finalVersionId,
                bundleId
            );

            if (downloadResponse.success) {
                Swal.fire({
                    icon: 'success',
                    title: t('ui.taskCreated'),
                    text: `${t('ui.taskId')}: ${downloadResponse.taskId}`,
                    position: 'top',
                    toast: true,
                    timer: 1500,
                    showConfirmButton: false
                });
                onClose();
                // 清空输入
                setAppId('');
                setVersionId('');
            } else {
                throw new Error(downloadResponse.message || '创建下载任务失败');
            }
        } catch (error) {
            console.error('下载失败:', error);
            Swal.fire({
                icon: 'error',
                title: t('ui.downloadFailed'),
                text: error.message || '下载失败',
                confirmButtonText: t('ui.confirm')
            });
        } finally {
            setLoading(false);
        }
    };

    const handleMemory = () => {
        if (!appId.trim()) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.invalidAppId'),
                text: t('ui.invalidAppIdFormat'),
                confirmButtonText: t('ui.confirm')
            });
            return;
        }

        const extractedId = extractAppId(appId);
        if (!extractedId) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.invalidAppId'),
                text: t('ui.invalidAppIdFormat'),
                confirmButtonText: t('ui.confirm')
            });
            return;
        }

        const finalVersionId = versionId.trim() || 'latest';
        const newLine = `${extractedId}\t${finalVersionId}`;

        // 追加到记忆内容
        const updatedMemory = memory ? `${memory}\n${newLine}` : newLine;
        setMemory(updatedMemory);
        localStorage.setItem(STORAGE_KEY, updatedMemory);

        Swal.fire({
            icon: 'success',
            title: t('ui.memorySaved'),
            position: 'top',
            toast: true,
            timer: 1000,
            showConfirmButton: false
        });
    };

    return (
        <>
            <Dialog
                isOpen={isOpen}
                onClose={onClose}
                title={t('ui.newDownload')}
                size="medium"
                headerActions={
                    <Button
                        variant="plain"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setRegionDialogOpen(true);
                        }}
                        sx={{ mr: 1 }}
                    >
                        {user?.region ? user.region.toUpperCase() : t('ui.region')}
                    </Button>
                }
            >
                <Stack gap={2}>
                    <Box>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                            APP {t('ui.appId')}:
                        </Typography>
                        <Input
                            placeholder={t('ui.enterAppId')}
                            value={appId}
                            onChange={(e) => setAppId(e.target.value)}
                            disabled={loading}
                        />
                    </Box>

                    <Box>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                            {t('ui.versionId')} ({t('ui.optional')}):
                        </Typography>
                        <Input
                            placeholder={t('ui.enterVersionId') || '留空则下载最新版'}
                            value={versionId}
                            onChange={(e) => setVersionId(e.target.value)}
                            disabled={loading}
                        />
                        <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                            {t('ui.versionIdHint') || '留空则下载最新版本'}
                        </Typography>
                    </Box>

                    <Stack direction="row" gap={2} sx={{ mt: 2 }}>
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={handleDownload}
                            disabled={loading}
                            fullWidth
                        >
                            {loading ? t('ui.loading') : t('ui.newDownload')}
                        </Button>
                        <Button
                            variant="outlined"
                            color="neutral"
                            onClick={handleMemory}
                            disabled={loading || !appId.trim()}
                            fullWidth
                        >
                            {t('ui.memory')}
                        </Button>
                    </Stack>

                    <Box sx={{ mt: 2 }}>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                            {t('ui.memoryNotebook') || '记事本'}:
                        </Typography>
                        <Textarea
                            minRows={6}
                            maxRows={10}
                            value={memory}
                            onInput={handleMemoryInput}
                            placeholder={t('ui.memoryPlaceholder') || '记忆的内容将显示在这里...'}
                            sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                        />
                    </Box>
                </Stack>
            </Dialog>

            <RegionSelector
                open={regionDialogOpen}
                onClose={(updatedUserData) => {
                    setRegionDialogOpen(false);
                    if (updatedUserData) {
                        setUser(updatedUserData);
                    }
                }}
                currentRegion={user?.region}
            />
        </>
    );
}
