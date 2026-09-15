import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Swal from 'sweetalert2';
import Dialog from '../components/Dialog';
import AppDetail, { toAppDetailPreview, toAppDetailPreviewFromId } from '../components/AppDetail';
import RegionSelector from '../components/RegionSelector';
import { useAppSession } from '../contexts/AppContext';
import {
    getAppDetails,
    isRateLimitError,
    resolveApiMessage,
    resolveClientErrorMessage,
} from '../utils/api';

/** 应用详情 Dialog 的 URL 查询参数（全站统一） */
export const APP_DETAIL_QUERY_KEY = 'appId';

/** 兼容旧链接（如 IpaDetailDrawer 曾跳转 Home 的 openAppId） */
export const LEGACY_APP_DETAIL_QUERY_KEY = 'openAppId';

function normalizeAppId(appId) {
    if (appId == null || appId === '') {
        return null;
    }
    return String(appId);
}

function buildDialogTitle(detailApp) {
    const idPart = detailApp?.trackId ? `ID: ${detailApp.trackId}` : '';
    const namePart = detailApp?.trackName ? ` - ${detailApp.trackName}` : '';
    return `${idPart}${namePart}`;
}

async function showDetailsFetchError({ t, source, onSpecifyRegion }) {
    const text = source instanceof Error
        ? resolveClientErrorMessage(source)
        : (resolveApiMessage(source) || t('ui.getDetailsFailed'));

    const showRegionEntry = source?.errorMessageCode === 'APP_DETAILS_NOT_FOUND'
        || source?.errorCode === 'APP_DETAILS_IDS_NOT_FOUND';

    const result = await Swal.fire({
        icon: 'error',
        title: t('ui.getDetailsFailed'),
        text,
        confirmButtonText: t('ui.confirm'),
        ...(showRegionEntry && {
            showCancelButton: true,
            cancelButtonText: t('ui.specifyRegion'),
        }),
    });

    if (showRegionEntry && result.dismiss === Swal.DismissReason.cancel) {
        onSpecifyRegion?.();
    }
}

export function useAppDetailDialog({
    syncQuery = true,
    queryKey = APP_DETAIL_QUERY_KEY,
} = {}) {
    const { t } = useTranslation();
    const { user, setUser } = useAppSession();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const [regionDialogOpen, setRegionDialogOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [appDetails, setAppDetails] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [preview, setPreview] = useState(null);
    const urlHandledRef = useRef(null);
    const fetchSeqRef = useRef(0);
    /** 为 true 时本次 Dialog 会话不读写 URL（如 /dl 抽屉内打开详情） */
    const queryWriteSuppressedRef = useRef(false);

    const readQueryAppId = useCallback(() => {
        if (!syncQuery) {
            return null;
        }
        return normalizeAppId(
            searchParams.get(queryKey) ?? searchParams.get(LEGACY_APP_DETAIL_QUERY_KEY),
        );
    }, [searchParams, queryKey, syncQuery]);

    const writeQueryAppId = useCallback((appId) => {
        if (!syncQuery || queryWriteSuppressedRef.current) {
            return;
        }

        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            const normalized = normalizeAppId(appId);

            if (normalized) {
                next.set(queryKey, normalized);
            } else {
                next.delete(queryKey);
            }
            next.delete(LEGACY_APP_DETAIL_QUERY_KEY);
            return next;
        }, { replace: true });
    }, [queryKey, setSearchParams, syncQuery]);

    const close = useCallback(() => {
        fetchSeqRef.current += 1;
        setIsOpen(false);
        setAppDetails([]);
        setCurrentIndex(0);
        setPreview(null);
        urlHandledRef.current = null;
        if (syncQuery && !queryWriteSuppressedRef.current) {
            writeQueryAppId(null);
        }
        queryWriteSuppressedRef.current = false;
    }, [syncQuery, writeQueryAppId]);

    const fetchAndOpen = useCallback(async ({
        ids,
        initialIndex = 0,
        nextPreview = null,
        updateQuery = true,
        onSuccess,
    }) => {
        const normalizedIds = ids
            .map((id) => normalizeAppId(id))
            .filter(Boolean);

        if (normalizedIds.length === 0) {
            return false;
        }

        const safeIndex = Math.min(Math.max(initialIndex, 0), normalizedIds.length - 1);
        const seq = fetchSeqRef.current + 1;
        fetchSeqRef.current = seq;

        setPreview(nextPreview ?? toAppDetailPreviewFromId(normalizedIds[safeIndex]));
        setLoading(true);
        setIsOpen(true);
        setCurrentIndex(safeIndex);

        if (updateQuery) {
            writeQueryAppId(normalizedIds[safeIndex]);
        }

        try {
            const response = await getAppDetails(normalizedIds);

            if (fetchSeqRef.current !== seq) {
                return false;
            }

            if (response.success && response.data?.length > 0) {
                setAppDetails(response.data);

                const preferredId = normalizedIds[safeIndex];
                const resolvedIndex = response.data.findIndex(
                    (item) => String(item.trackId) === preferredId,
                );
                const finalIndex = resolvedIndex >= 0 ? resolvedIndex : 0;
                setCurrentIndex(finalIndex);

                const activeAppId = normalizeAppId(response.data[finalIndex]?.trackId);
                if (updateQuery && activeAppId) {
                    writeQueryAppId(activeAppId);
                }

                onSuccess?.(response.data, finalIndex);
                return true;
            }

            await showDetailsFetchError({
                t,
                source: {
                    errorMessageCode: 'APP_DETAILS_NOT_FOUND',
                    errorCode: 'APP_DETAILS_IDS_NOT_FOUND',
                    ...response,
                },
                onSpecifyRegion: () => setRegionDialogOpen(true),
            });
            close();
            return false;
        } catch (error) {
            if (fetchSeqRef.current !== seq) {
                return false;
            }
            if (isRateLimitError(error)) {
                return false;
            }
            console.error('获取应用详情失败:', error.message);
            await showDetailsFetchError({
                t,
                source: error,
                onSpecifyRegion: () => setRegionDialogOpen(true),
            });
            close();
            return false;
        } finally {
            if (fetchSeqRef.current === seq) {
                setLoading(false);
            }
        }
    }, [close, t, writeQueryAppId]);

    const applyQueryWriteOptions = useCallback((options = {}) => {
        if (options.suppressQueryWrite) {
            queryWriteSuppressedRef.current = true;
            return;
        }
        if (options.updateQuery !== false) {
            queryWriteSuppressedRef.current = false;
        }
    }, []);

    const openByAppId = useCallback(async (appId, options = {}) => {
        const normalized = normalizeAppId(appId);
        if (!normalized) {
            return false;
        }

        applyQueryWriteOptions(options);

        return fetchAndOpen({
            ids: [normalized],
            initialIndex: 0,
            nextPreview: toAppDetailPreviewFromId(normalized),
            updateQuery: options.updateQuery ?? !options.suppressQueryWrite,
            onSuccess: options.onSuccess,
        });
    }, [applyQueryWriteOptions, fetchAndOpen]);

    const openByListApp = useCallback(async (clickedApp, allIds, options = {}) => {
        if (!clickedApp) {
            return false;
        }

        applyQueryWriteOptions(options);

        const normalizedIds = (allIds?.length ? allIds : [clickedApp.id])
            .map((id) => normalizeAppId(id))
            .filter(Boolean);
        const clickedId = normalizeAppId(clickedApp.id);
        const initialIndex = normalizedIds.findIndex((id) => id === clickedId);

        return fetchAndOpen({
            ids: normalizedIds,
            initialIndex: initialIndex >= 0 ? initialIndex : 0,
            nextPreview: toAppDetailPreview(clickedApp),
            updateQuery: options.updateQuery ?? !options.suppressQueryWrite,
            onSuccess: options.onSuccess,
        });
    }, [applyQueryWriteOptions, fetchAndOpen]);

    const goPrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
    }, []);

    const goNext = useCallback(() => {
        setCurrentIndex((prev) => (
            prev < appDetails.length - 1 ? prev + 1 : prev
        ));
    }, [appDetails.length]);

    const queryAppId = readQueryAppId();

    useEffect(() => {
        if (!syncQuery || !queryAppId) {
            urlHandledRef.current = null;
            return;
        }

        if (urlHandledRef.current === queryAppId) {
            return;
        }

        urlHandledRef.current = queryAppId;
        openByAppId(queryAppId, { updateQuery: false });
    }, [syncQuery, queryAppId, openByAppId]);

    useEffect(() => {
        if (!isOpen || !syncQuery || appDetails.length === 0) {
            return;
        }

        const appId = normalizeAppId(appDetails[currentIndex]?.trackId);
        if (!appId || readQueryAppId() === appId) {
            return;
        }

        writeQueryAppId(appId);
    }, [appDetails, currentIndex, isOpen, readQueryAppId, syncQuery, writeQueryAppId]);

    const detailApp = appDetails[currentIndex] ?? preview;
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < appDetails.length - 1;
    const enableNavigation = appDetails.length > 1;

    const dialog = useMemo(() => (
        <>
            <Dialog
                isOpen={isOpen}
                onClose={close}
                title={buildDialogTitle(detailApp)}
                size="large"
                onPrevious={enableNavigation ? goPrevious : undefined}
                onNext={enableNavigation ? goNext : undefined}
                hasPrevious={enableNavigation ? hasPrevious : undefined}
                hasNext={enableNavigation ? hasNext : undefined}
            >
                <AppDetail
                    app={detailApp}
                    loading={loading}
                />
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
                storeRegion={user?.storeRegion}
                regionSource={user?.regionSource}
            />
        </>
    ), [
        isOpen,
        close,
        detailApp,
        loading,
        enableNavigation,
        goPrevious,
        goNext,
        hasPrevious,
        hasNext,
        regionDialogOpen,
        user?.region,
        user?.storeRegion,
        user?.regionSource,
        setUser,
    ]);

    return {
        isOpen,
        loading,
        detailApp,
        appDetails,
        currentIndex,
        openByAppId,
        openByListApp,
        close,
        goPrevious,
        goNext,
        hasPrevious,
        hasNext,
        dialog,
    };
}
