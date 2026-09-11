import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAdminStatus, adminLogin, adminLogout, resolveClientErrorMessage } from '../utils/api';
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
        loading: true,
        error: null
    });

    // 检查管理员状态（同时拉取后端应用设置，避免重复请求 status）
    const checkAdminStatus = async () => {
        try {
            setAdminState(prev => ({ ...prev, loading: true, error: null }));
            const response = await getAdminStatus();

            setAdminState(prev => ({
                ...prev,
                isInitialized: response.data.isInitialized,
                isLoggedIn: response.data.isLoggedIn,
                setupRequiresInitPin: Boolean(response.data.setupRequiresInitPin),
                user: response.data.user,
                expiresAt: response.data.expiresAt,
                settings: response.data.settings || null,
                settingsLoaded: true,
                statusLoaded: true,
                loading: false,
                error: null,
            }));
        } catch (error) {
            console.error('检查管理员状态失败:', error);
            setAdminState(prev => ({
                ...prev,
                loading: false,
                statusLoaded: false,
                error: resolveClientErrorMessage(error)
            }));
        }
    };

    const updateAppSettings = (settings) => {
        setAdminState(prev => ({
            ...prev,
            settings,
        }));
    };

    // 管理员登录
    const login = async (username, password) => {
        try {
            setAdminState(prev => ({ ...prev, loading: true, error: null }));
            const response = await adminLogin(username, password);

            setAdminState(prev => ({
                ...prev,
                isLoggedIn: true,
                user: response.data.user,
                expiresAt: response.data.expiresAt,
                loading: false
            }));

            return response;
        } catch (error) {
            setAdminState(prev => ({
                ...prev,
                loading: false,
                error: resolveClientErrorMessage(error)
            }));
            throw error;
        }
    };

    // 管理员退出登录
    const logout = async () => {
        try {
            await adminLogout();
            setAdminState(prev => ({
                ...prev,
                isLoggedIn: false,
                user: null,
                expiresAt: null,
                error: null
            }));
        } catch (error) {
            console.error('退出登录失败:', error);
            setAdminState(prev => ({
                ...prev,
                isLoggedIn: false,
                user: null,
                expiresAt: null
            }));
        }
    };

    const getFormattedExpiresAt = () => {
        if (!adminState.expiresAt) return null;
        return dayjs(adminState.expiresAt).format('YYYY-MM-DD HH:mm:ss');
    };

    // 检查是否即将过期（1小时内）
    const isExpiringSoon = () => {
        if (!adminState.expiresAt) return false;
        const expiresTime = dayjs(adminState.expiresAt);
        const now = dayjs();
        const diffInHours = expiresTime.diff(now, 'hour');
        return diffInHours <= 1;
    };


    useEffect(() => {
        checkAdminStatus();
    }, []);

    const value = {
        ...adminState,
        login,
        logout,
        checkAdminStatus,
        updateAppSettings,
        getFormattedExpiresAt,
        isExpiringSoon
    };

    return (
        <AdminContext.Provider value={value}>
            {children}
        </AdminContext.Provider>
    );
};
