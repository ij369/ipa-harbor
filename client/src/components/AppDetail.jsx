import React, { useState, useEffect } from 'react';
import {
    Box,
    Stack,
    Typography,
    Chip,
    Avatar,
    Button,
    Divider,
    Sheet,
    Tabs,
    TabList,
    Tab,
    TabPanel,
    List,
    ListItem,
    ListItemContent,
    ListItemDecorator,
    CircularProgress,
    IconButton,
    Link,
    Tooltip
} from '@mui/joy';
import { Star, Download, Category, Person, History, AccountBalanceWallet, Delete, Refresh, InstallMobile, LabelImportantOutline } from '@mui/icons-material';
import { tabClasses } from '@mui/joy/Tab';
import { getAppVersions, purchaseApp, downloadApp, deleteTask, getAppInstallPackageUrl, getAppDownloadPackageUrl } from '../utils/api';
import { useApp } from '../contexts/AppContext';
import Swal from 'sweetalert2';
import isValidDomain from 'is-valid-domain';
import { getAppIconUrl } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function AppDetail({ app }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [versions, setVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState(null);
    const [downloadingVersions, setDownloadingVersions] = useState(new Set());
    const [dataSource, setDataSource] = useState(null); // 数据源标记
    const [activeTab, setActiveTab] = useState(0); // 管理tabs状态

    const { taskList, user } = useApp();

    useEffect(() => {
        setActiveTab(0);
        setVersions([]);
        setVersionsError(null);
        setDataSource(null);
    }, [app?.trackId]);

    const handleVersionsError = async () => {
        const isFree = app.price === 0;

        if (isFree) {
            const result = await Swal.fire({
                // title: '无法查询版本列表',
                title: t('ui.cannotQueryVersions'),
                // html: '当前应用似乎未获取；<br/>如果确认从未获取过，可以尝试领取该应用。<br/>如果确认已经获取过，可以稍后再试，或者点击加载第三方 API 版本列表按钮。',
                html: t('ui.cannotQueryVersionsHint'), // 
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: t('ui.claim'), // 领取
                cancelButtonText: t('ui.cancel'),
                showDenyButton: true,
                denyButtonText: t('ui.loadThirdPartyVersions') // 加载第三方 API 版本列表
            });

            if (result.isConfirmed) {
                try {
                    await purchaseApp(app.bundleId);
                    Swal.fire({
                        icon: 'success',
                        title: t('ui.claimSuccessHint'), // '已获取成功, 你可以在 App Store 中已购项目里找到该应用'
                        text: t('ui.refetchingVersions'), // '正在重新获取版本列表...'
                        timer: 1500,
                        showConfirmButton: false
                    });
                    // 重新获取版本列表
                    setTimeout(fetchVersions, 1000);
                } catch (purchaseError) {
                    Swal.fire({
                        icon: 'error',
                        title: t('ui.claimFailedHint'), // 获取失败, 请在 App Store 中获取该应用再次尝试
                        text: purchaseError.message,
                        confirmButtonText: t('ui.ok')
                    });
                }
            } else if (result.isDenied) {
                // 用户选择加载第三方API版本列表
                fetchVersions(true);
            }
        } else {
            const result = await Swal.fire({
                title: t('ui.needPurchase'), // 需要购买
                text: t('ui.paidAppHint'), // 该应用为收费应用，需要在设备的 App Store 上执行购买。
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: t('ui.getHistory'), // 获取历史
                cancelButtonText: t('ui.cancel')
            });

            if (result.isConfirmed) {
                fetchVersions();
            }
        }
    };

    if (!app) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress sx={{ mb: 2 }} />
                <Typography level="body-lg" sx={{ color: 'text.secondary', mb: 2 }}>
                    {t('ui.loading')}
                </Typography>
                {user?.region ? (
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        {t('ui.currentRegionDisplay', { region: user.region.toUpperCase() })}
                    </Typography>
                ) : (
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        {t('ui.noRegionHint')}
                    </Typography>
                )}
            </Box>
        );
    }

    // 格式化价格
    const formatPrice = (price) => {
        return price === 0 ? t('ui.free') : `${price}`;
    };

    // 格式化文件大小
    const formatFileSize = (bytes) => {
        if (!bytes) return t('ui.unknown');
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    // 格式化日期
    const formatDate = (dateString) => {
        if (!dateString) return t('ui.unknown');
        try {
            // 处理第三方API返回的日期格式 "2025-10-18 02:33:52"
            const date = new Date(dateString.replace(' ', 'T'));
            const lng = localStorage.getItem('language') || 'en';
            return date.toLocaleDateString(lng.startsWith('zh') ? 'zh-CN' : 'en-US');
        } catch (error) {
            return t('ui.dateFormatError'); // 日期格式错误
        }
    };

    // 获取版本列表
    const fetchVersions = async (useThirdPartyApi = false) => {
        if (!app.trackId) return;

        setVersionsLoading(true);
        setVersionsError(null);

        try {
            const response = await getAppVersions(app.trackId, useThirdPartyApi);
            if (response.success && response.data) {
                // 处理版本数据结构：externalVersionIdentifiers 
                const versionObjects = response.data.externalVersionIdentifiers || [];
                const versionsData = versionObjects.map((versionObj, index) => ({
                    versionId: versionObj.versionId,
                    bundleVersion: versionObj.bundleVersion,
                    releaseDate: versionObj.releaseDate,
                    isLatest: versionObj.bundleVersion === app.version,
                    displayName: versionObj.bundleVersion !== '未知'
                        ? `版本 ${versionObj.bundleVersion}`
                        : `版本 ${versionObjects.length - index}`
                }));
                setVersions(versionsData);
                setDataSource(response.source);

                // 显示数据源信息
                if (response.source === 'third-party') {
                    console.log('[INFO] 版本列表来源：第三方API');
                } else {
                    console.log('[INFO] 版本列表来源：ipatool');
                }
            }
        } catch (error) {
            console.error('获取版本列表失败:', error);
            console.log('版本列表错误类型:', error.errorType);
            console.log('版本列表错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            setVersionsError(error.message);

            if (error.errorType === 'LICENSE_REQUIRED') {
                // 处理许可证需要错误
                const isFree = app.price === 0;
                if (isFree) {
                    const result = await Swal.fire({
                        title: t('ui.needClaimFirst'), // 需要先领取该应用
                        html: t('ui.claimAppHint'), // 该应用需要先领取许可证才能查看版本列表。<br/>点击"领取"按钮来获取该应用的许可证。
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonText: t('ui.claim'), // 领取
                        cancelButtonText: t('ui.cancel')
                    });

                    if (result.isConfirmed) {
                        try {
                            await purchaseApp(app.bundleId);
                            Swal.fire({
                                icon: 'success',
                                title: t('ui.claimSuccess'), // 已获取成功
                                text: t('ui.refetchingVersions'), // 正在重新获取版本列表...
                                timer: 1500,
                                showConfirmButton: false
                            });
                            // 重新获取版本列表
                            setTimeout(fetchVersions, 1000);
                        } catch (purchaseError) {
                            Swal.fire({
                                icon: 'error',
                                title: t('ui.claimFailed'), // 获取失败
                                text: purchaseError.message,
                                confirmButtonText: t('ui.ok')
                            });
                        }
                    }
                } else {
                    Swal.fire({
                        title: t('ui.needPurchase'), // 需要购买
                        text: t('ui.paidAppHint'), // 该应用为收费应用，需要在设备的 App Store 上执行购买后才能查看版本列表。
                        icon: 'info',
                        confirmButtonText: t('ui.ok')
                    });
                }
            } else if (error.errorType === 'TOKEN_EXPIRED') {
                handleTokenExpiredError();
            } else if (error.message.includes('第三方API未找到该应用的版本信息')) {
                // 第三方API未找到数据的情况
                Swal.fire({
                    title: t('ui.loadThirdPartyVersions'), // 第三方API无数据
                    text: t('ui.thirdPartyApiWarning'), // 第三方API中未找到该应用的版本信息，请尝试其他方式获取版本列表。
                    icon: 'info',
                    confirmButtonText: t('ui.ok')
                });
            } else if (error.message.includes('获取版本列表时发生错误')) {
                handleVersionsError();
            }
        } finally {
            setVersionsLoading(false);
        }
    };

    // 处理密码令牌过期错误
    const handleTokenExpiredError = async () => {
        const result = await Swal.fire({
            title: t('ui.loginExpired'), // 登录已过期
            text: t('ui.loginExpiredHint'), // 您的登录状态已过期，需要重新登录才能继续操作。
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('ui.relogin'),
            cancelButtonText: t('ui.cancel')
        });

        if (result.isConfirmed) {
            // window.location.href = '/login'; // 或者使用路由导航
            navigate('/login');
        }
    };

    // 下载应用
    const handleDownload = async (versionId, bundleId) => {
        if (!app.trackId) return;

        setDownloadingVersions(prev => new Set([...prev, versionId]));

        try {
            const response = await downloadApp(app.trackId, versionId, bundleId);
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: t('ui.taskCreated'), // 下载任务已创建
                    text: `${t('ui.taskId')}: ${response.taskId}`, // 任务ID: ${response.taskId}
                    position: 'top', toast: true,
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        } catch (error) {
            console.error('下载失败:', error);
            console.log('错误类型:', error.errorType);
            console.log('错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

            if (error.errorType === 'LICENSE_REQUIRED') {
                const result = await Swal.fire({
                    icon: 'info',
                    title: t('ui.needClaimBeforeDownload'), // 需要先领取该应用
                    text: t('ui.claimRequiredForDownload'), // 该应用需要先领取许可证才能下载。
                    showCancelButton: true,
                    confirmButtonText: t('ui.goToClaim'), // 去领取
                    cancelButtonText: t('ui.cancel')
                });

                if (result.isConfirmed && app.price === 0) {
                    try {
                        await purchaseApp(app.bundleId);
                        Swal.fire({
                            icon: 'success',
                            title: t('ui.claimSuccess'), // 已获取成功
                            text: t('ui.claimSuccessNowRetry'), // 现在可以重新尝试下载了
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } catch (purchaseError) {
                        Swal.fire({
                            icon: 'error',
                            title: t('ui.claimFailed'), // 获取失败
                            text: purchaseError.message,
                            confirmButtonText: t('ui.ok')
                        });
                    }
                }
            } else if (error.errorType === 'TOKEN_EXPIRED') {
                const result = await Swal.fire({
                    icon: 'warning',
                    title: t('ui.loginExpired'), // 登录已过期
                    text: t('ui.downloadLoginExpired'), // 您的登录状态已过期，需要重新登录才能继续下载。
                    showCancelButton: true,
                    confirmButtonText: t('ui.relogin'),
                    cancelButtonText: t('ui.cancel')
                });

                if (result.isConfirmed) {
                    navigate('/apple-id');
                }
            } else {
                Swal.fire({
                    icon: 'error',
                    title: t('ui.failedToDownload'), // 下载失败
                    text: error.message,
                    confirmButtonText: t('ui.confirm')
                });
            }
        } finally {
            setDownloadingVersions(prev => {
                const newSet = new Set(prev);
                newSet.delete(versionId);
                return newSet;
            });
        }
    };


    // 删除任务
    const handleDeleteTask = async (taskId) => {
        const result = await Swal.fire({
            title: t('ui.confirmDelete'), // 确认删除
            text: t('ui.confirmDeleteTask'), // 确定要删除这个任务和对应的 ipa 文件吗？
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('ui.delete'),
            cancelButtonText: t('ui.cancel'),
            confirmButtonColor: '#d33'
        });

        if (result.isConfirmed) {
            try {
                const response = await deleteTask(taskId);
                if (response.success) {
                    Swal.fire({
                        icon: 'success',
                        title: t('ui.taskDeleted'), // 任务已删除
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
            } catch (error) {
                console.error('删除任务失败:', error);
                Swal.fire({
                    icon: 'error',
                    title: t('ui.deleteFailed'), // 删除失败
                    text: error.message,
                    confirmButtonText: t('ui.confirm')
                });
            }
        }
    };

    // 获取当前应用的latest版本
    const getLatestTaskInfo = () => {
        if (!app?.trackId || !taskList?.summary) return null;
        return taskList.summary[app.trackId]?.['latest'] || null;
    };

    // 获取指定版本的任务
    const getVersionTaskInfo = (versionId) => {
        if (!app?.trackId || !taskList?.summary) return null;
        return taskList.summary[app.trackId]?.[versionId] || null;
    };

    const renderDownloadSection = () => {
        const taskInfo = getLatestTaskInfo();

        if (!taskInfo) {
            return (
                <Button
                    startDecorator={<Download />}
                    size="sm"
                    fullWidth
                    loading={downloadingVersions.has('latest')}
                    onClick={() => handleDownload('latest', app.bundleId)}
                >
                    {/* 下载最新版 */}
                    {t('ui.downloadLatest')}
                </Button>
            );
        }

        switch (taskInfo.status) {
            case 'running':
                return (
                    <>
                        <Button fullWidth>
                            {/* 下载中... {taskInfo.percentage}% */}
                            {t('ui.downloading')} {taskInfo.percentage}%
                        </Button>
                        <Stack direction="row" gap={1} justifyContent="center">
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
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
                            {/* <Button fullWidth loading>等待下载...</Button> */}
                            <Button fullWidth loading>{t('ui.waitingDownload')}</Button>
                        </Box>
                        <Stack direction="row" gap={1} justifyContent="center">
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                disabled={true}
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
                            >
                                <Delete />
                            </IconButton>
                        </Stack>
                    </>
                );

            case 'completed':
                return (
                    <>
                        <Box sx={{ flex: 1 }}>
                            <Button fullWidth onClick={() => {
                                const forceDownload = true; // 强制下载，忽略检查, 因为目前无法实现安装
                                const isFQDN = isValidDomain(window.location.hostname);
                                const isSecureContext = window.isSecureContext;
                                console.log(isFQDN, isSecureContext);
                                // 只有isFQDN为true时，才提示用户，否则直接跳转
                                if (forceDownload || !isSecureContext || !isFQDN) {
                                    window.open(getAppDownloadPackageUrl(app.trackId, 'latest'), '_blank');
                                    return;
                                }
                                Swal.fire({
                                    title: t('ui.installOrDownload'), // 请问是下载 IPA 档案还是安装应用？
                                    text: t('ui.pleaseSelect'), // 请选择
                                    icon: 'question',
                                    showCancelButton: false,
                                    showConfirmButton: false,
                                    html: `
      <div style="display:flex; justify-content:center; gap:12px; padding:1rem;">
        <a href="${getAppInstallPackageUrl(app.trackId, 'latest')}"
        class="swal2-confirm swal2-styled"
           style="
             display:inline-block;
             background-color:var(--swal2-confirm-button-background-color);
             color:white;
             padding:8px 16px;
             border-radius:4px;
             text-decoration:none;
             font-size:14px;
           ">
           ${t('ui.install')}
        </a>

        <a href="${getAppDownloadPackageUrl(app.trackId, 'latest')}"
                  class="swal2-cancel swal2-styled"
 style="
             display:inline-block;
             background-color:var(--swal2-cancel-button-background-color);
             color:white;
             padding:8px 16px;
             border-radius:4px;
             text-decoration:none;
             font-size:14px;
           ">
           ${t('ui.downloadIPA')}
        </a>
      </div>
    `,

                                });
                            }}>{t('ui.install')}</Button>
                        </Box>
                        <Stack direction="row" gap={1} justifyContent="center">
                            <Button
                                size="sm"
                                variant="outlined"
                                color="primary"
                                startDecorator={<Refresh />}
                                onClick={() => handleDownload('latest', app.bundleId)}
                            >
                                {/* 重新下载最新版 */}
                                {t('ui.redownloadLatest')}
                            </Button>
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
                            >
                                <Delete />
                            </IconButton>
                        </Stack>
                    </>
                );

            case 'failed':
                return (
                    <>
                        <Box sx={{ flex: 1 }}>
                            {/* <Button fullWidth variant='soft' color='danger'>{taskInfo.status === 'failed' ? '下载失败' : '已取消'}</Button> */}
                            <Button fullWidth variant='soft' color='danger'>{taskInfo.status === 'failed' ? t('ui.downloadFailed') : t('ui.cancelled')}</Button>
                        </Box>
                        <Stack direction="row" gap={1} justifyContent="center">
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
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
                        loading={downloadingVersions.has('latest')}
                        onClick={() => handleDownload('latest', app.bundleId)}
                    >
                        {/* 下载最新版 */}
                        {t('ui.downloadLatest')}
                    </Button>
                );
        }
    };

    // 历史版本的下载钮
    const renderVersionDownloadButton = (version) => {
        const taskInfo = getVersionTaskInfo(version.versionId);
        const isDownloading = downloadingVersions.has(version.versionId);

        if (!taskInfo && !isDownloading) {
            return (
                <Button
                    size="sm"
                    variant="outlined"
                    startDecorator={<Download />}
                    onClick={() => handleDownload(version.versionId, app.bundleId)}
                >
                    {t('ui.download')}
                </Button>
            );
        }

        if (isDownloading && !taskInfo) {
            // 正在创建任务
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

        // 有任务状态
        if (taskInfo) {
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
                            borderColor: 'primary.300'
                        }}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    height: '100%',
                                    width: `${taskInfo.percentage}%`,
                                    bgcolor: 'primary.100',
                                    transition: 'width 0.3s ease'
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
                                    fontWeight: 'md'
                                }}
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
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
                            borderColor: 'neutral.300'
                        }}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    height: '100%',
                                    width: '100%',
                                    bgcolor: 'neutral.50'
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
                                    fontSize: 'xs'
                                }}
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
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
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
                            >
                                <Delete />
                            </IconButton>
                            {/* 该功能是有问题的，暂时移除 */}
                            {/* <Tooltip variant="outlined" color="warning" arrow size="sm" title={<Typography>需要 https 环境下使用, 暂不支持 macOS 安装</Typography>}>
                                <Link href={`${getAppInstallPackageUrl(app.trackId, version.versionId)}`}>
                                    <Button size="sm" color="success" startDecorator={<InstallMobile />}>安装</Button>
                                </Link>
                            </Tooltip> */}
                            <Link href={`${getAppDownloadPackageUrl(app.trackId, version.versionId)}`}>
                                {/* <Button size="sm" startDecorator={<Download />}>下载IPA</Button> */}
                                <Button size="sm" startDecorator={<Download />}>{t('ui.downloadIPA')}</Button>
                            </Link>
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
                            borderColor: 'danger.300'
                        }}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    height: '100%',
                                    width: '100%',
                                    bgcolor: 'danger.100'
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
                                    fontSize: 'xs'
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
                                    height: 20
                                }}
                                onClick={() => handleDeleteTask(taskInfo.taskId)}
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
                            onClick={() => handleDownload(version.versionId, app.bundleId)}
                        >
                            下载
                        </Button>
                    );
            }
        }

        return (
            <Button
                size="sm"
                variant="outlined"
                startDecorator={<Download />}
                onClick={() => handleDownload(version.versionId, app.bundleId)}
            >
                下载
            </Button>
        );
    };

    return (
        <Box>

            {/* 应用基本信息 */}
            <Stack direction="row" gap={3} sx={{ mb: 3 }}>
                <Avatar
                    src={getAppIconUrl(app.trackId, 512)}
                    alt={app.trackName}
                    sx={{ width: 128, height: 128, borderRadius: '22%', boxShadow: 'sm' }}
                />

                <Stack gap={1} sx={{ flex: 1 }}>
                    <Typography level="h3">{app.trackName}</Typography>
                    <Stack direction="row" gap={1} alignItems="center">
                        <Person fontSize="small" />
                        <Typography level="body-md">{app.artistName}</Typography>
                    </Stack>
                    <Stack direction="row" gap={1} alignItems="center">
                        <Category fontSize="small" />
                        <Typography level="body-sm">{app.primaryGenreName}</Typography>
                    </Stack>
                    <Stack direction="row" gap={2} alignItems="center">
                        <Chip
                            size="sm"
                            color={app.price === 0 ? 'success' : 'primary'}
                            variant="soft"
                            startDecorator={<AccountBalanceWallet />}
                        >
                            {formatPrice(app.price)}
                        </Chip>
                        {app.averageUserRating && (
                            <Stack direction="row" gap={0.5} alignItems="center">
                                <Star fontSize="small" sx={{ color: 'warning.400' }} />
                                <Typography level="body-sm">
                                    {app.averageUserRating.toFixed(1)} ({app.userRatingCount || 0})
                                </Typography>
                            </Stack>
                        )}

                    </Stack>
                </Stack>
            </Stack>

            <Stack gap={1} direction="row" alignItems="center">
                {renderDownloadSection()}
            </Stack>
            <Divider sx={{ my: 2 }} />

            {/* 当前版本 和 历史版本 */}
            <Tabs
                aria-label="tabs"
                value={activeTab}
                onChange={(event, value) => {
                    setActiveTab(value);
                    if (value === 1) {
                        fetchVersions();
                    }
                }}
                sx={{ bgcolor: 'transparent', position: 'sticky', top: 0, zIndex: 1000 }}
            >
                <TabList
                    disableUnderline
                    sx={{
                        p: 0.5,
                        gap: 0.5,
                        borderRadius: 'xl',
                        bgcolor: 'background.level1',
                        [`& .${tabClasses.root}[aria-selected="true"]`]: {
                            boxShadow: 'sm',
                            bgcolor: 'background.surface',
                        },
                    }}
                >
                    {/* <Tab disableIndicator sx={{ flex: 1 }}>当前版本</Tab>
                    <Tab disableIndicator sx={{ flex: 1 }}>历史版本</Tab> */}
                    <Tab disableIndicator sx={{ flex: 1 }}>{t('ui.currentVersion')}</Tab>
                    <Tab disableIndicator sx={{ flex: 1 }}>{t('ui.historicalVersions')}</Tab>
                </TabList>

                <TabPanel value={0} sx={{ p: 0, pt: 1.5 }}>
                    {/* 应用详细信息 */}
                    <Stack gap={2}>
                        {/* 版本信息 */}
                        <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                            <Typography level="title-sm" sx={{ mb: 1 }}>{t('ui.versionInfo')}</Typography>
                            <Stack gap={1}>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography level="body-sm">{t('ui.currentVersion')}:</Typography>
                                    <Typography level="body-sm" fontWeight="md">{app.version}</Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography level="body-sm">{t('ui.fileSize')}:</Typography>
                                    <Typography level="body-sm">{formatFileSize(app.fileSizeBytes)}</Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography level="body-sm">{t('ui.updateTime')}:</Typography>
                                    <Typography level="body-sm">{formatDate(app.currentVersionReleaseDate)}</Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography level="body-sm">{t('ui.ageRating')}:</Typography>
                                    <Typography level="body-sm">{app.contentAdvisoryRating || t('ui.unknown')}</Typography>
                                </Stack>
                            </Stack>
                        </Sheet>

                        {/* 支持信息 */}
                        <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                            <Typography level="title-sm" sx={{ mb: 1 }}>{t('ui.supportInfo')}</Typography>
                            <Stack gap={1}>
                                <Stack direction="row" gap={2}>
                                    <Typography level="body-sm" sx={{ flexShrink: 0 }}>{t('ui.languages')}:</Typography>
                                    <Typography level="body-sm" sx={{ textAlign: 'right', flex: 1 }}>
                                        {app.languageCodesISO2A ? app.languageCodesISO2A.join(', ') : t('ui.unknown')}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" gap={2}>
                                    <Typography level="body-sm" sx={{ flexShrink: 0 }}>{t('ui.compatibility')}:</Typography>
                                    <Typography level="body-sm" sx={{ textAlign: 'right', flex: 1 }}>{app.minimumOsVersion ? `iOS ${app.minimumOsVersion}+` : t('ui.unknown')}</Typography>
                                </Stack>
                                <Stack direction="row" gap={2}>
                                    <Typography level="body-sm" sx={{ flexShrink: 0 }}>{t('ui.bundleId')}:</Typography>
                                    <Typography level="body-sm" sx={{ fontFamily: 'monospace', textAlign: 'right', flex: 1 }}>
                                        {app.bundleId}
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Sheet>

                        {/* 应用描述 */}
                        {app.description && (
                            <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                                <Typography level="title-sm" sx={{ mb: 1 }}>{t('ui.appDescription')}</Typography>
                                <Typography level="body-sm" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {app.description}
                                </Typography>
                            </Sheet>
                        )}

                        {/* 版本更新说明 */}
                        {app.releaseNotes && (
                            <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                                {/* <Typography level="title-sm" sx={{ mb: 1 }}>版本更新说明</Typography> */}
                                <Typography level="title-sm" sx={{ mb: 1 }}>{t('ui.releaseNotes')}</Typography>
                                <Typography level="body-sm" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {app.releaseNotes}
                                </Typography>
                            </Sheet>
                        )}

                    </Stack>
                </TabPanel>

                <TabPanel value={1} sx={{ p: 0, pt: 1.5 }}>
                    {/* 数据源标记 */}
                    {dataSource === 'third-party' && (
                        <Typography
                            level="body-xs"
                            sx={{
                                color: 'warning.600',
                                mb: 1,
                                textAlign: 'center',
                                fontStyle: 'italic'
                            }}
                        >
                            {/* ⚠️注意: 当前显示的是第三方 API 数据，可能与实际版本有差异, 请在下载前确保已经获取过该应用 */}
                            {t('ui.thirdPartyApiWarning')}
                        </Typography>
                    )}

                    {/* 历史版本列表 */}
                    {versionsLoading ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                            <CircularProgress sx={{ mb: 2 }} />
                            {user?.region ? (
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    {t('ui.currentRegionDisplay', { region: user.region.toUpperCase() })}
                                </Typography>
                            ) : (
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    {t('ui.noRegionHint')}
                                </Typography>
                            )}
                        </Box>
                    ) : versionsError ? (
                        <Stack sx={{ textAlign: 'center', alignItems: 'center', py: 4 }} gap={1}>
                            <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                                {versionsError}
                            </Typography>
                            {/* <Button size="sm" color="danger" variant="soft" onClick={() => handleVersionsError()}>解决方法</Button>
                            <Button size="sm" color="primary" variant="soft" onClick={() => fetchVersions()}>重新获取版本列表</Button> */}
                            <Button size="sm" color="danger" variant="soft" onClick={() => handleVersionsError()}>{t('ui.solution')}</Button>
                            <Button size="sm" color="primary" variant="soft" onClick={() => fetchVersions()}>{t('ui.refetchVersionList')}</Button>
                        </Stack>
                    ) : versions.length > 0 ? (
                        <List>
                            {versions.map((version, index) => (
                                <>
                                    <ListItem key={index}>
                                        <ListItemDecorator>
                                            {version.isLatest ? <LabelImportantOutline style={{ color: 'green' }} /> : <History />}
                                        </ListItemDecorator>
                                        <ListItemContent>
                                            <Typography level="title-sm" color={version.isLatest ? 'success' : 'neutral'}>
                                                {version.displayName}
                                            </Typography>
                                            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                                {/* {version.releaseDate ? formatDate(version.releaseDate) : '发布日期未知'} */}
                                                {version.releaseDate ? formatDate(version.releaseDate) : t('ui.releaseDateUnknown')}
                                            </Typography>
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontFamily: 'monospace' }}>
                                                ID: {version.versionId}
                                            </Typography>
                                        </ListItemContent>
                                        {renderVersionDownloadButton(version)}
                                    </ListItem>
                                    <Divider />
                                </>
                            ))}
                        </List>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                                {/* 暂无历史版本 */}
                                {t('ui.noHistoricalVersions')}
                            </Typography>
                        </Box>
                    )}
                </TabPanel>
            </Tabs>
        </Box>
    );
}
