import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
    getAdminStatus,
    adminLogin,
    adminLogout,
    passkeyLoginOptions,
    passkeyLoginVerify,
    resolveClientErrorMessage,
} from '../utils/api';
import { performPasskeyLogin } from '../utils/passkey';
import dayjs from 'dayjs';

const AdminContext = createContext();

export const useAdmin = () => {
    const context = useContext(AdminContext);
    if (!context) {
        throw new Error('useAdmin必须在AdminProvider内部使用');
    }
    return context;
};

export const AdminProvider = ({ children }) => {
    const [adminState, setAdminState] = useState({
        isInitialized: false,
        isLoggedIn: false,
        setupRequiresInitPin: false,
        user: null,
        expiresAt: null,
        settings: null,
        settingsLoaded: false,
        statusLoaded: false,
        appVersion: null,
        passkeyEnabled: false,
        loading: true,
        error: null,
    });
    const [postSetupFlowActive, setPostSetupFlowActive] = useState(false);

    const beginPostSetupFlow = useCallback(() => {
        setPostSetupFlowActive(true);
    }, []);

    const endPostSetupFlow = useCallback(() => {
        setPostSetupFlowActive(false);
    }, []);

    // 检查管理员状态（同时拉取后端应用设置，避免重复请求 status）
    const checkAdminStatus = useCallback(async () => {
        try {
            setAdminState((prev) => ({ ...prev, loading: true, error: null }));
            const response = await getAdminStatus();

            setAdminState((prev) => ({
                ...prev,
                isInitialized: response.data.isInitialized,
                isLoggedIn: response.data.isLoggedIn,
                setupRequiresInitPin: Boolean(response.data.setupRequiresInitPin),
                user: response.data.user,
                expiresAt: response.data.expiresAt,
                settings: response.data.settings || null,
                settingsLoaded: true,
                statusLoaded: true,
                appVersion: response.data.version || null,
                passkeyEnabled: Boolean(response.data.passkeyEnabled),
                loading: false,
                error: null,
            }));
        } catch (error) {
            console.error('检查管理员状态失败:', error);
            setAdminState((prev) => ({
                ...prev,
                loading: false,
                statusLoaded: false,
                error: resolveClientErrorMessage(error),
            }));
        }
    }, []);

    const updateAppSettings = useCallback((settings) => {
        setAdminState((prev) => ({
            ...prev,
            settings,
        }));
    }, []);

    // 管理员登录
    const login = useCallback(async (username, password) => {
        try {
            setAdminState((prev) => ({ ...prev, loading: true, error: null }));
            const response = await adminLogin(username, password);

            setAdminState((prev) => ({
                ...prev,
                isLoggedIn: true,
                user: response.data.user,
                expiresAt: response.data.expiresAt,
                loading: false,
            }));

            return response;
        } catch (error) {
            setAdminState((prev) => ({
                ...prev,
                loading: false,
            }));
            throw error;
        }
    }, []);

    // Passkey verify 完成后更新登录态（按钮登录与 Conditional UI 共用）
    const completePasskeyLogin = useCallback(async (challengeId, credential) => {
        const response = await passkeyLoginVerify(challengeId, credential);
        setAdminState((prev) => ({
            ...prev,
            isLoggedIn: true,
            user: response.data.user,
            expiresAt: response.data.expiresAt,
            loading: false,
            error: null,
        }));
        return response;
    }, []);

    // Passkey 按钮登录（不切换全局 loading，避免登录页背景被 loading 视图替换）
    const passkeyLogin = useCallback(async () => {
        setAdminState((prev) => ({ ...prev, error: null }));
        const optionsResponse = await passkeyLoginOptions();
        const { challengeId, options } = optionsResponse.data;
        const credential = await performPasskeyLogin(options);
        return await completePasskeyLogin(challengeId, credential);
    }, [completePasskeyLogin]);

    // 管理员退出登录
    const logout = useCallback(async () => {
        try {
            await adminLogout();
            setAdminState((prev) => ({
                ...prev,
                isLoggedIn: false,
                user: null,
                expiresAt: null,
                error: null,
            }));
        } catch (error) {
            console.error('退出登录失败:', error);
            setAdminState((prev) => ({
                ...prev,
                isLoggedIn: false,
                user: null,
                expiresAt: null,
            }));
        }
    }, []);

    const getFormattedExpiresAt = useCallback(() => {
        if (!adminState.expiresAt) return null;
        return dayjs(adminState.expiresAt).format('YYYY-MM-DD HH:mm:ss');
    }, [adminState.expiresAt]);

    // 检查是否即将过期（1小时内）
    const isExpiringSoon = useCallback(() => {
        if (!adminState.expiresAt) return false;
        const expiresTime = dayjs(adminState.expiresAt);
        const now = dayjs();
        const diffInHours = expiresTime.diff(now, 'hour');
        return diffInHours <= 1;
    }, [adminState.expiresAt]);

    useEffect(() => {
        checkAdminStatus();
    }, [checkAdminStatus]);

    const value = useMemo(() => ({
        ...adminState,
        postSetupFlowActive,
        login,
        passkeyLogin,
        completePasskeyLogin,
        logout,
        checkAdminStatus,
        beginPostSetupFlow,
        endPostSetupFlow,
        updateAppSettings,
        getFormattedExpiresAt,
        isExpiringSoon,
    }), [
        adminState,
        postSetupFlowActive,
        login,
        passkeyLogin,
        completePasskeyLogin,
        logout,
        checkAdminStatus,
        beginPostSetupFlow,
        endPostSetupFlow,
        updateAppSettings,
        getFormattedExpiresAt,
        isExpiringSoon,
    ]);

    return (
        <AdminContext.Provider value={value}>
            {children}
        </AdminContext.Provider>
    );
};
