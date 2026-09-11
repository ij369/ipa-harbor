import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
    Skeleton,
    IconButton,
    Link,
    Tooltip
} from '@mui/joy';
import { Star, Download, Category, Person, History, AccountBalanceWallet, Delete, Refresh, InstallMobile, LabelImportantOutline } from '@mui/icons-material';
import FindReplaceIcon from '@mui/icons-material/FindReplace';
import { tabClasses } from '@mui/joy/Tab';
import { getAppVersions, refreshAppVersionMetadata, purchaseApp, downloadApp, deleteTask, getAppInstallPackageUrlByFileName, getAppDownloadPackageUrlByFileName, isRateLimitError, resolveClientErrorMessage } from '../utils/api';
import { isOtaSecureContext, useOtaInstallPreference } from '../utils/otaInstallPreference';
import { useLoadAppScreenshotsPreference } from '../utils/appScreenshotsPreference';
import { useApp } from '../contexts/AppContext';
import Swal from 'sweetalert2';
import { getAppIconUrl } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getIntlLocale } from '../i18n';
import { Virtuoso } from 'react-virtuoso';
import AppScreenshots from './AppScreenshots';
import { getAppScreenshotGroups } from '../utils/appScreenshotUrls';
import { formatAppLanguageCodes } from '../utils/languageDisplayName';
import {
    clearVersionsPreloadCache,
    commitVersionsPreloadFetch,
    ensureVersionsPreload,
    getVersionsPreloadEntry,
    isVersionsPreloadConsumed,
    markVersionsPreloadConsumed,
} from '../utils/appVersionsPreloadCache';

const VersionVirtuosoList = React.forwardRef(function VersionVirtuosoList({ style, children, ...props }, ref) {
    return (
        <List ref={ref} component="div" style={style} {...props}>
            {children}
        </List>
    );
});

const versionVirtuosoComponents = { List: VersionVirtuosoList };

// 历史版本行高约 80–120px，适当加大视口外渲染范围，避免快速滚动透白
const versionListVirtuosoConfig = {
    increaseViewportBy: { top: 800, bottom: 800 },
    minOverscanItemCount: { top: 12, bottom: 12 },
    defaultItemHeight: 96,
    skipAnimationFrameInResizeObserver: true,
};

/** 列表行 / 搜索结果 → 详情加载前的预览数据 */
export function toAppDetailPreview(listApp) {
    if (!listApp) {
        return null;
    }

    return {
        trackId: listApp.id,
        trackName: listApp.name,
        bundleId: listApp.bundleID || listApp.bundleId,
        version: listApp.version,
        ...(listApp.price != null ? { price: listApp.price } : {}),
    };
}

export function toAppDetailPreviewFromId(appId) {
    if (appId == null || appId === '') {
        return null;
    }

    return { trackId: appId };
}

export default function AppDetail({ app, loading = false }) {
    const { t, i18n } = useTranslation();

    const buildVersionDisplayName = (bundleVersion, fallbackIndex) => {
        if (bundleVersion != null && bundleVersion !== '' && bundleVersion !== '未知') {
            return t('ui.versionNamed', { version: bundleVersion });
        }
        if (fallbackIndex != null) {
            return t('ui.versionIndexed', { index: fallbackIndex });
        }
        return t('ui.unknown');
    };

    const navigate = useNavigate();
    const [versions, setVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState(null);
    const [downloadingVersions, setDownloadingVersions] = useState(new Set());
    const [refreshingVersionMetadata, setRefreshingVersionMetadata] = useState(new Set());
    const [dataSource, setDataSource] = useState(null); // 数据源标记
    const [activeTab, setActiveTab] = useState(0); // 管理tabs状态
    const [storeLatestVersionId, setStoreLatestVersionId] = useState(null);
    const rootRef = useRef(null);
    const activeTabRef = useRef(0);
    const currentTrackIdRef = useRef(null);
    const [scrollParent, setScrollParent] = useState(null);

    const { taskList, user, fileList, settings } = useApp();
    const [otaInstallEnabled] = useOtaInstallPreference();
    const [loadAppScreenshotsEnabled] = useLoadAppScreenshotsPreference();
    const showVersionMetadataRefresh = settings.showVersionMetadataRefresh === true;
    const [showScreenshotsOnce, setShowScreenshotsOnce] = useState(false);
    const showOtaInstall = otaInstallEnabled && isOtaSecureContext();
    const { phone: phoneScreenshotGroup, ipad: ipadScreenshotGroup } = getAppScreenshotGroups(app);

    useLayoutEffect(() => {
        const parent = rootRef.current?.closest('.dialog-body');
        setScrollParent(parent ?? null);
    }, [app?.trackId]);

    const extractLatestVersionId = (versionObjects = []) => {
        const latest = versionObjects.find((item) => item.bundleVersion === app.version) || versionObjects[0];
        return latest?.versionId != null ? String(latest.versionId) : null;
    };

    useEffect(() => () => clearVersionsPreloadCache(), []);

    useEffect(() => {
        currentTrackIdRef.current = app?.trackId != null ? String(app.trackId) : null;
    }, [app?.trackId]);

    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

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
            return date.toLocaleDateString(getIntlLocale(i18n.language));
        } catch (error) {
            return t('ui.dateFormatError'); // 日期格式错误
        }
    };

    const parseVersionsResponse = (response) => {
        if (!response?.success || !response.data) {
            return null;
        }

        const versionObjects = response.data.externalVersionIdentifiers || [];
        const storeLatestVersionId = extractLatestVersionId(versionObjects);
        const versionsData = versionObjects.map((versionObj, index) => ({
            versionId: versionObj.versionId,
            bundleVersion: versionObj.bundleVersion,
            releaseDate: versionObj.releaseDate,
            isLatest: storeLatestVersionId != null
                && String(versionObj.versionId) === storeLatestVersionId,
            displayName: buildVersionDisplayName(
                versionObj.bundleVersion,
                versionObjects.length - index,
            ),
        }));

        return {
            versions: versionsData,
            storeLatestVersionId,
            source: response.source,
        };
    };

    const applyVersionsSuccess = (parsed) => {
        setVersions(parsed.versions);
        setStoreLatestVersionId(parsed.storeLatestVersionId);
        setDataSource(parsed.source);
        setVersionsError(null);

        if (parsed.source === 'third-party') {
            console.log('[INFO] 版本列表来源：第三方API');
        } else if (parsed.source === 'third-party-fallback') {
            console.log('[INFO] 版本列表来源：第三方API（ipatool 回退）');
        } else {
            console.log('[INFO] 版本列表来源：ipatool');
        }
    };

    const getVersionsSourceWarningKey = (source) => {
        if (source === 'third-party-fallback') {
            return 'ui.thirdPartyFallbackWarning';
        }
        if (source === 'third-party') {
            return 'ui.thirdPartyApiWarning';
        }
        return null;
    };

    const syncVersionsStateFromCache = (trackId) => {
        const preloadEntry = getVersionsPreloadEntry(trackId);

        if (preloadEntry?.parsed) {
            setStoreLatestVersionId(preloadEntry.parsed.storeLatestVersionId);
        } else {
            setStoreLatestVersionId(null);
        }

        if (preloadEntry?.consumed && preloadEntry.parsed) {
            applyVersionsSuccess(preloadEntry.parsed);
            setVersionsLoading(false);
            return;
        }

        if (preloadEntry?.consumed && preloadEntry.error) {
            setVersions([]);
            setVersionsError(resolveClientErrorMessage(preloadEntry.error));
            setDataSource(null);
            setVersionsLoading(false);
            return;
        }

        setVersions([]);
        setVersionsError(null);
        setDataSource(null);
        setVersionsLoading(false);
    };

    const updatePreloadCacheAfterFetch = (trackId, { parsed = null, error = null } = {}) => {
        commitVersionsPreloadFetch(trackId, app.version, { parsed, error });
    };

    const applyPreloadEntrySideEffects = async (trackId) => {
        const preloadEntry = getVersionsPreloadEntry(trackId);
        if (!preloadEntry) {
            return;
        }

        if (preloadEntry.parsed && currentTrackIdRef.current === trackId) {
            setStoreLatestVersionId(preloadEntry.parsed.storeLatestVersionId);
        }

        if (
            activeTabRef.current === 1
            && currentTrackIdRef.current === trackId
            && !preloadEntry.consumed
        ) {
            if (preloadEntry.parsed) {
                preloadEntry.consumed = true;
                applyVersionsSuccess(preloadEntry.parsed);
                setVersionsLoading(false);
                return;
            }

            if (preloadEntry.error) {
                if (isRateLimitError(preloadEntry.error)) {
                    return;
                }

                preloadEntry.consumed = true;
                setVersionsError(resolveClientErrorMessage(preloadEntry.error));
                setVersionsLoading(false);
                await processVersionsFetchError(preloadEntry.error);
            }
        } else if (preloadEntry.error && !isRateLimitError(preloadEntry.error)) {
            console.warn(`预加载版本列表失败 (${trackId}):`, preloadEntry.error.message);
        }
    };

    useEffect(() => {
        if (!app?.trackId) {
            return;
        }

        const trackId = String(app.trackId);
        setActiveTab(0);
        activeTabRef.current = 0;
        setShowScreenshotsOnce(false);
        syncVersionsStateFromCache(trackId);
    }, [app?.trackId]);

    const consumePreloadedVersions = async (trackId, preloadEntry) => {
        if (!preloadEntry || preloadEntry.consumed) {
            return false;
        }

        if (preloadEntry.parsed) {
            markVersionsPreloadConsumed(trackId, true);
            applyVersionsSuccess(preloadEntry.parsed);
            return true;
        }

        if (preloadEntry.error) {
            markVersionsPreloadConsumed(trackId, true);
            setVersionsError(resolveClientErrorMessage(preloadEntry.error));
            await processVersionsFetchError(preloadEntry.error);
            return true;
        }

        return false;
    };

    const activateHistoryVersionsTab = async () => {
        if (!app.trackId) {
            return;
        }

        const trackId = String(app.trackId);

        if (isVersionsPreloadConsumed(trackId)) {
            await fetchVersions(false);
            return;
        }

        const preloadEntry = getVersionsPreloadEntry(trackId);
        if (!preloadEntry) {
            markVersionsPreloadConsumed(trackId, true);
            await fetchVersions(false);
            return;
        }

        if (await consumePreloadedVersions(trackId, preloadEntry)) {
            return;
        }

        setVersionsLoading(true);
        setVersionsError(null);

        try {
            await preloadEntry.promise;
            const latestPreload = getVersionsPreloadEntry(trackId);
            if (latestPreload?.trackId === trackId) {
                await consumePreloadedVersions(trackId, latestPreload);
            }
        } finally {
            setVersionsLoading(false);
        }
    };

    // 获取版本列表（显式刷新或第三方 API）
    const fetchVersions = async (useThirdPartyApi = false) => {
        if (!app.trackId) return;

        const trackId = String(app.trackId);
        markVersionsPreloadConsumed(trackId, true);
        setVersionsLoading(true);
        setVersionsError(null);

        try {
            const response = await getAppVersions(app.trackId, useThirdPartyApi);
            const parsed = parseVersionsResponse(response);
            if (parsed) {
                applyVersionsSuccess(parsed);
                updatePreloadCacheAfterFetch(trackId, { parsed });
            }
        } catch (error) {
            updatePreloadCacheAfterFetch(trackId, { error });
            await processVersionsFetchError(error);
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

    const processVersionsFetchError = async (error) => {
        if (isRateLimitError(error)) {
            return true;
        }

        console.error('获取版本列表失败:', error);
        console.log('版本列表错误类型:', error.errorType);
        console.log('版本列表错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        setVersionsError(resolveClientErrorMessage(error));

        if (error.errorType === 'LICENSE_REQUIRED') {
            const isFree = app.price === 0;
            if (isFree) {
                const result = await Swal.fire({
                    title: t('ui.needClaimFirst'),
                    html: t('ui.claimAppHint'),
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: t('ui.claim'),
                    cancelButtonText: t('ui.cancel'),
                });

                if (result.isConfirmed) {
                    try {
                        await purchaseApp(app.bundleId);
                        Swal.fire({
                            icon: 'success',
                            title: t('ui.claimSuccess'),
                            text: t('ui.refetchingVersions'),
                            timer: 1500,
                            showConfirmButton: false,
                        });
                        setTimeout(fetchVersions, 1000);
                    } catch (purchaseError) {
                        Swal.fire({
                            icon: 'error',
                            title: t('ui.claimFailed'),
                            text: purchaseError.message,
                            confirmButtonText: t('ui.ok'),
                        });
                    }
                }
            } else {
                Swal.fire({
                    title: t('ui.needPurchase'),
                    text: t('ui.paidAppHint'),
                    icon: 'info',
                    confirmButtonText: t('ui.ok'),
                });
            }
        } else if (error.errorType === 'TOKEN_EXPIRED') {
            handleTokenExpiredError();
        } else if (error.errorMessageCode === 'APP_VERSIONS_THIRD_PARTY_NOT_FOUND') {
            Swal.fire({
                title: t('ui.loadThirdPartyVersions'),
                text: t('ui.thirdPartyApiWarning'),
                icon: 'info',
                confirmButtonText: t('ui.ok'),
            });
        } else if (error.errorMessageCode === 'APP_VERSIONS_ERROR') {
            handleVersionsError();
        }

        return false;
    };

    useEffect(() => {
        if (!app?.trackId) {
            return undefined;
        }

        const trackId = String(app.trackId);
        const entry = ensureVersionsPreload(trackId, app.version, async () => {
            try {
                const response = await getAppVersions(trackId, false);
                const parsed = parseVersionsResponse(response);
                if (!parsed) {
                    throw new Error('获取版本列表时发生错误');
                }
                return parsed;
            } catch (error) {
                if (isRateLimitError(error)) {
                    return null;
                }
                throw error;
            }
        });

        if (!entry) {
            return undefined;
        }

        if (entry.parsed) {
            applyPreloadEntrySideEffects(trackId);
            return undefined;
        }

        entry.promise.then(() => applyPreloadEntrySideEffects(trackId));

        return undefined;
    }, [app?.trackId, app?.version]);

    // 手动拉取单个版本的 Apple 元数据
    const handleRefreshVersionMetadata = async (versionId) => {
        if (!app.trackId || !versionId) return;

        setRefreshingVersionMetadata((prev) => new Set([...prev, versionId]));

        try {
            const response = await refreshAppVersionMetadata(app.trackId, versionId);
            if (response.success && response.data) {
                setVersions((prev) => prev.map((v) => {
                    if (String(v.versionId) !== String(versionId)) return v;
                    const bundleVersion = response.data.bundleVersion || v.bundleVersion;
                    return {
                        ...v,
                        releaseDate: response.data.releaseDate || v.releaseDate,
                        bundleVersion,
                        displayName: bundleVersion != null && bundleVersion !== '' && bundleVersion !== '未知'
                            ? t('ui.versionNamed', { version: bundleVersion })
                            : v.displayName,
                    };
                }));
            }
        } catch (error) {
            if (isRateLimitError(error)) return;
            console.error('获取版本元数据失败:', error);

            if (error.errorType === 'TOKEN_EXPIRED') {
                handleTokenExpiredError();
                return;
            }

            Swal.fire({
                icon: 'error',
                title: t('ui.refreshVersionMetadataFailed'),
                text: resolveClientErrorMessage(error),
                confirmButtonText: t('ui.ok'),
            });
        } finally {
            setRefreshingVersionMetadata((prev) => {
                const next = new Set(prev);
                next.delete(versionId);
                return next;
            });
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
            if (isRateLimitError(error)) return;
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
                        if (isRateLimitError(purchaseError)) return;
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
                    text: resolveClientErrorMessage(error),
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

    const resolveVersionId = (versionId) => {
        if (versionId !== 'latest') {
            return String(versionId);
        }

        return storeLatestVersionId;
    };

    const findStorageFileName = (versionId) => {
        const appId = String(app.trackId);
        const resolvedId = resolveVersionId(versionId);

        if (!resolvedId) {
            return `${appId}_latest.ipa`;
        }

        const completedTasks = taskList.completed || [];
        const matchedTask = completedTasks.find((task) => (
            String(task.appId) === appId
            && (task.versionId === resolvedId || String(task.actualVersionId) === resolvedId)
        ));

        if (matchedTask?.fileName) {
            return matchedTask.fileName;
        }

        return `${appId}_${resolvedId}.ipa`;
    };

    const getDownloadUrl = (versionId) => {
        return getAppDownloadPackageUrlByFileName(findStorageFileName(versionId));
    };

    const getInstallUrl = (versionId) => {
        const fileName = findStorageFileName(versionId);
        const baseName = fileName.replace(/\.ipa$/i, '');

        // manifest 路由要求文件名含 appId_versionId 形式
        if (!baseName.includes('_')) {
            return null;
        }

        return getAppInstallPackageUrlByFileName(baseName);
    };

    // 删除任务
    const handleDeleteTask = async (taskId, fileName) => {
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
                const response = taskId
                    ? await deleteTask(taskId)
                    : await deleteTask(null, fileName);
                if (response.success) {
                    Swal.fire({
                        icon: 'success',
                        title: t('ui.taskDeleted'), // 任务已删除
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
            } catch (error) {
                if (isRateLimitError(error)) return;
                console.error('删除任务失败:', error);
                Swal.fire({
                    icon: 'error',
                    title: t('ui.deleteFailed'), // 删除失败
                    text: resolveClientErrorMessage(error),
                    confirmButtonText: t('ui.confirm')
                });
            }
        }
    };

    const getLocalFileForVersion = (versionId) => {
        if (!app?.trackId || !versionId) return null;
        const appId = String(app.trackId);
        const resolvedId = resolveVersionId(versionId) || versionId;

        return fileList.files?.find((item) => (
            item.name === `${appId}_${resolvedId}.ipa`
            || (String(item.itemId) === appId && String(item.softwareVersionExternalIdentifier) === String(resolvedId))
        )) ?? null;
    };

    // 获取当前应用的 latest 版本（App Store 真正最新 build 且已下载到本地）
    const getLatestTaskInfo = () => {
        if (!app?.trackId) return null;
        const appId = String(app.trackId);
        const fromSummary = taskList?.summary?.[appId]?.latest;

        if (fromSummary && fromSummary.status !== 'completed') {
            const task = [...(taskList.running || []), ...(taskList.pending || []), ...(taskList.failed || [])]
                .find((item) => item.id === fromSummary.taskId);

            return {
                ...fromSummary,
                fileName: task?.fileName,
            };
        }

        if (!storeLatestVersionId) {
            return null;
        }

        const file = getLocalFileForVersion(storeLatestVersionId);
        if (file) {
            return { status: 'completed', taskId: null, percentage: 100, fileName: file.name };
        }

        return null;
    };

    const getVersionTaskInfo = (versionId) => {
        if (!app?.trackId) return null;
        const appId = String(app.trackId);
        const fromTask = taskList?.summary?.[appId]?.[versionId];
        if (fromTask) return fromTask;

        const file = getLocalFileForVersion(versionId);
        return file ? { status: 'completed', taskId: null, percentage: 100, fileName: file.name } : null;
    };

    const latestLocalFile = storeLatestVersionId
        ? getLocalFileForVersion(storeLatestVersionId)
        : null;

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
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
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
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                            >
                                <Delete />
                            </IconButton>
                        </Stack>
                    </>
                );

            case 'completed': {
                const installUrl = getInstallUrl('latest');
                const downloadUrl = getDownloadUrl('latest');
                const showInstall = showOtaInstall && installUrl;

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
                                    <Link href={installUrl} sx={{ flex: 1, minWidth: 0 }}>
                                        <Button fullWidth size="sm" color="success" startDecorator={<InstallMobile />}>
                                            {t('ui.install')}
                                        </Button>
                                    </Link>
                                ) : null}
                                <Link
                                    href={downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ flex: 1, minWidth: 0 }}
                                >
                                    <Button fullWidth size="sm" startDecorator={<Download />}>
                                        {t('ui.downloadIPA')}
                                    </Button>
                                </Link>
                            </Stack>
                            <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
                                <IconButton
                                    size="sm"
                                    variant="outlined"
                                    color="danger"
                                    onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                                >
                                    <Delete />
                                </IconButton>
                                <Button
                                    size="sm"
                                    variant="outlined"
                                    color="primary"
                                    startDecorator={<Refresh />}
                                    onClick={() => handleDownload('latest', app.bundleId)}
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
                                <Link href={installUrl} sx={{ flex: 1, minWidth: 0 }}>
                                    <Button fullWidth size="sm" color="success" startDecorator={<InstallMobile />}>
                                        {t('ui.install')}
                                    </Button>
                                </Link>
                            ) : null}
                            <Link
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ flex: 1, minWidth: 0 }}
                            >
                                <Button fullWidth size="sm" startDecorator={<Download />}>
                                    {t('ui.downloadIPA')}
                                </Button>
                            </Link>
                            <Button
                                size="sm"
                                variant="outlined"
                                color="primary"
                                startDecorator={<Refresh />}
                                onClick={() => handleDownload('latest', app.bundleId)}
                            >
                                {t('ui.redownloadLatest')}
                            </Button>
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
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
                            {/* <Button fullWidth variant='soft' color='danger'>{taskInfo.status === 'failed' ? '下载失败' : '已取消'}</Button> */}
                            <Button fullWidth variant='soft' color='danger'>{taskInfo.status === 'failed' ? t('ui.downloadFailed') : t('ui.cancelled')}</Button>
                        </Box>
                        <Stack direction="row" gap={1} justifyContent="center">
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
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
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
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
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
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
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
                            >
                                <Delete />
                            </IconButton>
                            {showOtaInstall && getInstallUrl(version.versionId) && (
                                <Tooltip variant="outlined" color="primary" arrow size="sm" title={t('ui.installOtaHint')}>
                                    <Link href={getInstallUrl(version.versionId)}>
                                        <Button size="sm" color="success" startDecorator={<InstallMobile />}>
                                            {t('ui.install')}
                                        </Button>
                                    </Link>
                                </Tooltip>
                            )}
                            <Link href={getDownloadUrl(version.versionId)} target="_blank" rel="noopener noreferrer">
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
                                onClick={() => handleDeleteTask(taskInfo.taskId, taskInfo.fileName)}
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
                            {t('ui.download')}
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
                {t('ui.download')}
            </Button>
        );
    };

    const renderHistoricalVersionItem = (version, index) => {
        const localFile = getLocalFileForVersion(version.versionId);
        const shortVersion = localFile?.bundleShortVersionString;
        const displayName = shortVersion && shortVersion !== '未知'
            ? t('ui.versionNamed', { version: shortVersion })
            : version.displayName;
        const releaseDate = version.releaseDate;
        const versionActions = renderVersionDownloadButton(version);

        const isFirst = index === 0;
        const isLast = index === versions.length - 1;

        return (
            <ListItem
                sx={{
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    rowGap: 1,
                    pt: isFirst
                        ? 'var(--ListItem-paddingY)'
                        : 'calc(var(--ListItem-paddingY) + var(--ListDivider-gap, 0.375rem))',
                    pb: isLast
                        ? 'var(--ListItem-paddingY)'
                        : 'calc(var(--ListItem-paddingY) + var(--ListDivider-gap, 0.375rem))',
                    ...(index > 0 && {
                        borderTop: '1px solid',
                        borderColor: 'divider',
                    }),
                }}
            >
                <ListItemDecorator>
                    {version.isLatest ? <LabelImportantOutline style={{ color: 'green' }} /> : <History />}
                </ListItemDecorator>
                <ListItemContent sx={{ flex: 1, minWidth: 0 }}>
                    <Stack
                        direction="row"
                        alignItems="flex-end"
                        gap={0.5}
                        sx={{
                            alignSelf: 'flex-start',
                            '& .version-metadata-refresh': {
                                opacity: 0,
                                transition: 'opacity 0.15s ease-in-out',
                                '@media (hover: none), (pointer: coarse)': {
                                    opacity: 1,
                                },
                            },
                            '&:hover .version-metadata-refresh, & .version-metadata-refresh:focus-visible': {
                                opacity: 1,
                            },
                            '& .version-metadata-refresh[data-loading="true"]': {
                                opacity: 1,
                            },
                        }}
                    >
                        <Stack gap={0.25}>
                            <Typography level="title-sm" color={version.isLatest ? 'success' : 'neutral'}>
                                {displayName}
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                {releaseDate ? formatDate(releaseDate) : t('ui.releaseDateUnknown')}
                            </Typography>
                        </Stack>
                        {showVersionMetadataRefresh && !releaseDate && (
                            <Tooltip title={t('ui.refreshVersionMetadata')} variant="outlined" placement="right">
                                <IconButton
                                    className="version-metadata-refresh"
                                    variant="plain"
                                    color="neutral"
                                    size="sm"
                                    data-loading={refreshingVersionMetadata.has(version.versionId) || undefined}
                                    loading={refreshingVersionMetadata.has(version.versionId)}
                                    onClick={() => handleRefreshVersionMetadata(version.versionId)}
                                    aria-label={t('ui.refreshVersionMetadata')}
                                >
                                    <FindReplaceIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', fontFamily: 'monospace', mt: 0.25 }}>
                        {t('ui.versionId')}: {version.versionId}
                    </Typography>
                </ListItemContent>
                <Box
                    sx={{
                        flexBasis: { xs: '100%', sm: 'auto' },
                        display: 'flex',
                        justifyContent: 'flex-end',
                        pl: { xs: 2, sm: 0 },
                    }}
                >
                    {versionActions}
                </Box>
            </ListItem>
        );
    };

    if (!app) {
        return null;
    }

    const displayName = app.trackName || (app.trackId != null ? `ID: ${app.trackId}` : t('ui.loading'));
    const primaryGenreDisplayName = app.genres?.[0] || app.primaryGenreName || '';

    const renderAppHeader = (isLoading = false) => (
        <Stack direction="row" gap={3} sx={{ mb: 3 }}>
            <Avatar
                src={getAppIconUrl(app.trackId, 512, user?.region)}
                alt={displayName}
                sx={{ width: 128, height: 128, borderRadius: '22%', boxShadow: 'sm' }}
            />

            <Stack gap={1} sx={{ flex: 1, minWidth: 0 }}>
                <Typography level="h3">{displayName}</Typography>
                {isLoading ? (
                    <>
                        <Stack direction="row" gap={1} alignItems="center">
                            <Person fontSize="small" sx={{ color: 'text.tertiary', flexShrink: 0 }} />
                            {/* 发布者：约 12 字宽，上限 65% 内容区，避免满宽条 */}
                            <Skeleton variant="text" level="body-md" sx={{ width: 'min(12ch, 65%)' }} />
                        </Stack>
                        <Stack direction="row" gap={1} alignItems="center">
                            <Category fontSize="small" sx={{ color: 'text.tertiary', flexShrink: 0 }} />
                            {/* 分类：更短，约 7 字宽 */}
                            <Skeleton variant="text" level="body-sm" sx={{ width: 'min(7ch, 42%)' }} />
                        </Stack>
                    </>
                ) : (
                    <>
                        {app.artistName ? (
                            <Stack direction="row" gap={1} alignItems="center">
                                <Person fontSize="small" />
                                <Typography level="body-md">{app.artistName}</Typography>
                            </Stack>
                        ) : null}
                        {primaryGenreDisplayName ? (
                            <Stack direction="row" gap={1} alignItems="center">
                                <Category fontSize="small" />
                                <Typography level="body-sm">{primaryGenreDisplayName}</Typography>
                            </Stack>
                        ) : null}
                    </>
                )}
                <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
                    {app.price != null && (
                        <Chip
                            size="sm"
                            color={app.price === 0 ? 'success' : 'primary'}
                            variant="soft"
                            startDecorator={<AccountBalanceWallet />}
                        >
                            {formatPrice(app.price)}
                        </Chip>
                    )}
                    {!isLoading && app.averageUserRating ? (
                        <Stack direction="row" gap={0.5} alignItems="center">
                            <Star fontSize="small" sx={{ color: 'warning.400' }} />
                            <Typography level="body-sm">
                                {app.averageUserRating.toFixed(1)} ({app.userRatingCount || 0})
                            </Typography>
                        </Stack>
                    ) : null}
                </Stack>
            </Stack>
        </Stack>
    );

    const renderTextSkeleton = (text, level) => (
        <Box sx={{ position: 'relative', width: 'fit-content' }}>
            <Typography level={level} sx={{ visibility: 'hidden' }} aria-hidden="true">
                {text}
            </Typography>
            <Skeleton variant="text" level={level} sx={{ position: 'absolute', inset: 0, width: '100%' }} />
        </Box>
    );

    const renderLabelValueRowSkeleton = (label) => (
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
            {renderTextSkeleton(label, 'body-sm')}
            <Skeleton variant="text" level="body-sm" sx={{ width: 'min(6ch, 28%)', flexShrink: 0 }} />
        </Stack>
    );

    const renderParagraphSkeleton = (lineWidths) => (
        <Stack gap={0.75}>
            {lineWidths.map((width, index) => (
                <Skeleton key={index} variant="text" level="body-sm" sx={{ width }} />
            ))}
        </Stack>
    );

    const renderProseSheetSkeleton = (title, lineWidths) => (
        <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
            <Box sx={{ mb: 1 }}>
                {renderTextSkeleton(title, 'title-sm')}
            </Box>
            {renderParagraphSkeleton(lineWidths)}
        </Sheet>
    );

    const renderLoadingBody = () => (
        <Box sx={{ minHeight: 620 }}>
            {/* 与加载完成后的布局同高，减少 Dialog 高度跳动 */}
            <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 'sm', width: '100%' }} />
            <Divider sx={{ my: 2 }} />
            <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 'xl', width: '100%' }} />
            <Box sx={{ position: 'relative', pt: 1.5, minHeight: 480 }}>
                <Stack gap={2}>
                    <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                        <Box sx={{ mb: 1 }}>
                            {renderTextSkeleton(t('ui.versionInfo'), 'title-sm')}
                        </Box>
                        <Stack gap={1}>
                            {renderLabelValueRowSkeleton(`${t('ui.currentVersion')}:`)}
                            {renderLabelValueRowSkeleton(`${t('ui.fileSize')}:`)}
                            {renderLabelValueRowSkeleton(`${t('ui.updateTime')}:`)}
                            {renderLabelValueRowSkeleton(`${t('ui.ageRating')}:`)}
                        </Stack>
                    </Sheet>
                    <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                        <Box sx={{ mb: 1 }}>
                            {renderTextSkeleton(t('ui.supportInfo'), 'title-sm')}
                        </Box>
                        <Stack gap={1}>
                            {renderLabelValueRowSkeleton(`${t('ui.languages')}:`)}
                            {renderLabelValueRowSkeleton(`${t('ui.compatibility')}:`)}
                            {renderLabelValueRowSkeleton(`${t('ui.bundleId')}:`)}
                        </Stack>
                    </Sheet>
                    {renderProseSheetSkeleton(t('ui.appDescription'), ['100%', '100%', '96%', '72%'])}
                    {renderProseSheetSkeleton(t('ui.releaseNotes'), ['100%', '88%', '64%'])}
                </Stack>
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        pt: 3,
                        bgcolor: 'rgba(var(--joy-palette-background-surfaceChannel, 255 255 255) / 0.72)',
                        pointerEvents: 'none',
                    }}
                >
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
            </Box>
        </Box>
    );

    if (loading) {
        return (
            <Box ref={rootRef}>
                {renderAppHeader(true)}
                {renderLoadingBody()}
            </Box>
        );
    }

    const versionsSourceWarningKey = getVersionsSourceWarningKey(dataSource);

    return (
        <Box ref={rootRef}>
            {renderAppHeader(false)}

            <Stack
                gap={1}
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ width: '100%' }}
            >
                {renderDownloadSection()}
            </Stack>
            <Divider sx={{ my: 2 }} />

            {/* 当前版本 和 历史版本 */}
            <Tabs
                aria-label="tabs"
                value={activeTab}
                onChange={(event, value) => {
                    setActiveTab(value);
                    activeTabRef.current = value;
                    if (value === 1) {
                        activateHistoryVersionsTab();
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

                <TabPanel value={0} sx={{ p: 0, pt: 1.5, minWidth: 0, maxWidth: '100%' }}>
                    {/* 应用详细信息 */}
                    <Stack gap={2} sx={{ minWidth: 0, maxWidth: '100%' }}>
                        {/* 版本信息 */}
                        <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                            <Typography level="title-sm" sx={{ mb: 1 }}>{t('ui.versionInfo')}</Typography>
                            <Stack gap={1}>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography level="body-sm">{t('ui.currentVersion')}:</Typography>
                                    <Typography level="body-sm" fontWeight="md">{latestLocalFile?.bundleShortVersionString || app.version}</Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography level="body-sm">{t('ui.fileSize')}:</Typography>
                                    <Typography level="body-sm">{formatFileSize(latestLocalFile?.size ?? app.fileSizeBytes)}</Typography>
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

                        {!loading && (
                            <AppScreenshots
                                phoneGroup={phoneScreenshotGroup}
                                ipadGroup={ipadScreenshotGroup}
                                showGallery={loadAppScreenshotsEnabled || showScreenshotsOnce}
                                onLoadOnce={() => setShowScreenshotsOnce(true)}
                                title={t('ui.appScreenshots')}
                                phoneTitle={t('ui.appScreenshotsPhone')}
                                ipadTitle={t('ui.appScreenshotsIpad')}
                                loadOnceLabel={t('ui.loadAppScreenshotsOnce')}
                                emptyLabel={t('ui.noAppScreenshots')}
                                screenshotAlt={app.trackName || t('ui.appScreenshots')}
                            />
                        )}

                        {/* 支持信息 */}
                        <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
                            <Typography level="title-sm" sx={{ mb: 1 }}>{t('ui.supportInfo')}</Typography>
                            <Stack gap={1}>
                                <Stack direction="row" gap={2}>
                                    <Typography level="body-sm" sx={{ flexShrink: 0 }}>{t('ui.languages')}:</Typography>
                                    <Typography level="body-sm" sx={{ textAlign: 'right', flex: 1 }}>
                                        {formatAppLanguageCodes(app.languageCodesISO2A, i18n.language) ?? t('ui.unknown')}
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
                    {/* 数据源标记（第三方 API 或 ipatool 回退） */}
                    {versionsSourceWarningKey && (
                        <Typography
                            level="body-xs"
                            sx={{
                                color: 'warning.600',
                                mb: 1,
                                textAlign: 'center',
                                fontStyle: 'italic',
                            }}
                        >
                            {t(versionsSourceWarningKey)}
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
                            <Button size="sm" color="danger" variant="soft" onClick={() => handleVersionsError()}>{t('ui.solution')}</Button>
                            <Button size="sm" color="primary" variant="soft" onClick={() => fetchVersions()}>{t('ui.refetchVersionList')}</Button>
                        </Stack>
                    ) : versions.length > 0 ? (
                        scrollParent ? (
                            <Virtuoso
                                customScrollParent={scrollParent}
                                components={versionVirtuosoComponents}
                                data={versions}
                                increaseViewportBy={versionListVirtuosoConfig.increaseViewportBy}
                                minOverscanItemCount={versionListVirtuosoConfig.minOverscanItemCount}
                                defaultItemHeight={versionListVirtuosoConfig.defaultItemHeight}
                                skipAnimationFrameInResizeObserver={versionListVirtuosoConfig.skipAnimationFrameInResizeObserver}
                                itemContent={(index, version) => renderHistoricalVersionItem(version, index)}
                            />
                        ) : (
                            <List>
                                {versions.map((version, index) => (
                                    <React.Fragment key={version.versionId ?? index}>
                                        {renderHistoricalVersionItem(version, index)}
                                    </React.Fragment>
                                ))}
                            </List>
                        )
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                                {t('ui.noHistoricalVersions')}
                            </Typography>
                        </Box>
                    )}
                </TabPanel>
            </Tabs>
        </Box>
    );
}
