import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
} from 'react';
import { getUserInfo } from '../utils/api';
import { useAdmin } from './AdminContext';
import { DEFAULT_DOWNLOAD_FILENAME_TEMPLATE, normalizeTemplate } from '../utils/filenameTemplate';

const sessionInitialState = {
    user: null,
    isAuthenticated: false,
    loading: true,
    error: null,
    settings: {
        downloadFileNameTemplate: DEFAULT_DOWNLOAD_FILENAME_TEMPLATE,
        showVersionMetadataRefresh: false,
    },
    settingsLoaded: false,
};

const downloadInitialState = {
    wsConnected: false,
    wsReconnecting: false,
    taskList: {
        running: [],
        pending: [],
        completed: [],
        failed: [],
        cancelled: [],
        summary: {},
    },
    fileList: {
        files: [],
        total: 0,
        totalSize: 0,
    },
    taskListSynced: false,
    fileListSynced: false,
    downloadDataReady: false,
};

const SessionActionTypes = {
    SET_LOADING: 'SET_LOADING',
    SET_USER: 'SET_USER',
    CLEAR_USER: 'CLEAR_USER',
    SET_ERROR: 'SET_ERROR',
    SET_SETTINGS: 'SET_SETTINGS',
};

const DownloadActionTypes = {
    SET_WS_CONNECTED: 'SET_WS_CONNECTED',
    SET_WS_RECONNECTING: 'SET_WS_RECONNECTING',
    SET_TASK_LIST: 'SET_TASK_LIST',
    SET_FILE_LIST: 'SET_FILE_LIST',
    RESET_DOWNLOAD_DATA_SYNC: 'RESET_DOWNLOAD_DATA_SYNC',
};

function isSamePayload(left, right) {
    if (left === right) {
        return true;
    }
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function sessionReducer(state, action) {
    switch (action.type) {
        case SessionActionTypes.SET_LOADING:
            if (state.loading === action.payload) {
                return state;
            }
            return {
                ...state,
                loading: action.payload,
            };
        case SessionActionTypes.SET_USER:
            return {
                ...state,
                user: action.payload,
                isAuthenticated: true,
                loading: false,
                error: null,
            };
        case SessionActionTypes.CLEAR_USER:
            return {
                ...state,
                user: null,
                isAuthenticated: false,
                loading: false,
                error: null,
            };
        case SessionActionTypes.SET_ERROR:
            return {
                ...state,
                error: action.payload,
                loading: false,
            };
        case SessionActionTypes.SET_SETTINGS:
            return {
                ...state,
                settings: {
                    ...state.settings,
                    ...action.payload,
                    downloadFileNameTemplate: normalizeTemplate(
                        action.payload.downloadFileNameTemplate || state.settings.downloadFileNameTemplate
                    ),
                },
                settingsLoaded: true,
            };
        default:
            return state;
    }
}

function downloadReducer(state, action) {
    switch (action.type) {
        case DownloadActionTypes.SET_WS_CONNECTED:
            if (state.wsConnected === action.payload && !state.wsReconnecting) {
                return state;
            }
            return {
                ...state,
                wsConnected: action.payload,
                wsReconnecting: false,
            };
        case DownloadActionTypes.SET_WS_RECONNECTING:
            if (state.wsReconnecting === action.payload) {
                return state;
            }
            return {
                ...state,
                wsReconnecting: action.payload,
            };
        case DownloadActionTypes.SET_TASK_LIST:
            if (isSamePayload(state.taskList, action.payload)) {
                // 刷新后 WS 重推的空列表与初始值相同，仍需标记已同步
                if (state.taskListSynced) {
                    return state;
                }
                return {
                    ...state,
                    taskListSynced: true,
                    downloadDataReady: state.fileListSynced,
                };
            }
            return {
                ...state,
                taskList: action.payload,
                taskListSynced: true,
                downloadDataReady: state.fileListSynced,
            };
        case DownloadActionTypes.SET_FILE_LIST:
            if (isSamePayload(state.fileList, action.payload)) {
                if (state.fileListSynced) {
                    return state;
                }
                return {
                    ...state,
                    fileListSynced: true,
                    downloadDataReady: state.taskListSynced,
                };
            }
            return {
                ...state,
                fileList: action.payload,
                fileListSynced: true,
                downloadDataReady: state.taskListSynced,
            };
        case DownloadActionTypes.RESET_DOWNLOAD_DATA_SYNC:
            if (!state.taskListSynced && !state.fileListSynced && !state.downloadDataReady) {
                return state;
            }
            return {
                ...state,
                taskListSynced: false,
                fileListSynced: false,
                downloadDataReady: false,
            };
        default:
            return state;
    }
}

const AppSessionContext = createContext(null);
const AppDownloadContext = createContext(null);

function AppSessionProvider({ children }) {
    const [sessionState, sessionDispatch] = useReducer(sessionReducer, sessionInitialState);
    const {
        isLoggedIn: adminLoggedIn,
        loading: adminLoading,
        settings: adminSettings,
        settingsLoaded: adminSettingsLoaded,
    } = useAdmin();

    const checkAuthStatus = useCallback(async () => {
        try {
            sessionDispatch({ type: SessionActionTypes.SET_LOADING, payload: true });
            const response = await getUserInfo();

            if (response.success && response.data) {
                sessionDispatch({ type: SessionActionTypes.SET_USER, payload: response.data });
            } else {
                sessionDispatch({ type: SessionActionTypes.CLEAR_USER });
            }
        } catch {
            sessionDispatch({ type: SessionActionTypes.CLEAR_USER });
        }
    }, []);

    const logout = useCallback(() => {
        sessionDispatch({ type: SessionActionTypes.CLEAR_USER });
    }, []);

    const setUser = useCallback((userData) => {
        sessionDispatch({ type: SessionActionTypes.SET_USER, payload: userData });
    }, []);

    const refreshUser = useCallback(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    const setSettings = useCallback((nextSettings) => {
        sessionDispatch({ type: SessionActionTypes.SET_SETTINGS, payload: nextSettings });
    }, []);

    useEffect(() => {
        if (!adminSettingsLoaded) {
            return;
        }

        if (adminSettings) {
            sessionDispatch({ type: SessionActionTypes.SET_SETTINGS, payload: adminSettings });
        } else {
            sessionDispatch({ type: SessionActionTypes.SET_SETTINGS, payload: {} });
        }
    }, [adminSettings, adminSettingsLoaded]);

    useEffect(() => {
        if (!adminLoading && adminLoggedIn) {
            checkAuthStatus();
        }
    }, [adminLoggedIn, adminLoading, checkAuthStatus]);

    useEffect(() => {
        if (!adminLoading && !adminLoggedIn) {
            sessionDispatch({ type: SessionActionTypes.CLEAR_USER });
        }
    }, [adminLoggedIn, adminLoading]);

    const sessionValue = useMemo(() => ({
        ...sessionState,
        logout,
        setUser,
        refreshUser,
        checkAuthStatus,
        setSettings,
    }), [sessionState, logout, setUser, refreshUser, checkAuthStatus, setSettings]);

    return (
        <AppSessionContext.Provider value={sessionValue}>
            {children}
        </AppSessionContext.Provider>
    );
}

export function AppDownloadProvider({ children }) {
    const [downloadState, downloadDispatch] = useReducer(downloadReducer, downloadInitialState);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const pingIntervalRef = useRef(null);
    const adminLoggedInRef = useRef(false);
    const {
        isLoggedIn: adminLoggedIn,
        loading: adminLoading,
    } = useAdmin();

    adminLoggedInRef.current = adminLoggedIn;

    const stopPing = useCallback(() => {
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
        }
    }, []);

    const disconnectWebSocket = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        stopPing();
        downloadDispatch({ type: DownloadActionTypes.SET_WS_CONNECTED, payload: false });
        downloadDispatch({ type: DownloadActionTypes.SET_WS_RECONNECTING, payload: false });
        downloadDispatch({ type: DownloadActionTypes.RESET_DOWNLOAD_DATA_SYNC });
    }, [stopPing]);

    const startPing = useCallback(() => {
        stopPing();

        pingIntervalRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }, [stopPing]);

    const connectWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const HOST = window.location.hostname;
        const PORT =
            import.meta.env.MODE === 'production'
                ? window.location.port
                : import.meta.env.VITE_WEBSOCKET_PORT;
        const wsUrl = `${wsProtocol}//${HOST}:${PORT}/download-task`;
        console.log('连接WebSocket:', wsUrl);

        try {
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                console.log('WebSocket连接成功');
                downloadDispatch({ type: DownloadActionTypes.SET_WS_CONNECTED, payload: true });

                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }

                startPing();
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    switch (message.type) {
                        case 'task-list': {
                            const taskData = message.data;
                            if (taskData.success) {
                                downloadDispatch({
                                    type: DownloadActionTypes.SET_TASK_LIST,
                                    payload: taskData.data,
                                });
                            }
                            break;
                        }

                        case 'watch': {
                            const fileData = message.data;
                            if (fileData.success) {
                                downloadDispatch({
                                    type: DownloadActionTypes.SET_FILE_LIST,
                                    payload: fileData.data,
                                });
                            }
                            break;
                        }

                        case 'pong':
                            break;

                        case 'system':
                            console.log('系统消息:', message.data);
                            break;

                        default:
                            console.log('未知消息类型:', message.type, message.data);
                    }
                } catch (error) {
                    console.error('解析WebSocket消息失败:', error);
                }
            };

            wsRef.current.onclose = () => {
                console.log('WebSocket连接关闭');
                downloadDispatch({ type: DownloadActionTypes.SET_WS_CONNECTED, payload: false });
                downloadDispatch({ type: DownloadActionTypes.RESET_DOWNLOAD_DATA_SYNC });
                stopPing();

                if (!reconnectTimeoutRef.current && adminLoggedInRef.current) {
                    downloadDispatch({ type: DownloadActionTypes.SET_WS_RECONNECTING, payload: true });
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (adminLoggedInRef.current) {
                            console.log('尝试重连WebSocket...');
                            connectWebSocket();
                        } else {
                            console.log('管理员已退出登录，取消WebSocket重连');
                            downloadDispatch({ type: DownloadActionTypes.SET_WS_RECONNECTING, payload: false });
                        }
                    }, 5000);
                }
            };

            wsRef.current.onerror = (error) => {
                console.error('WebSocket错误:', error);
            };
        } catch (error) {
            console.error('创建WebSocket连接失败:', error);
        }
    }, [startPing, stopPing]);

    useEffect(() => {
        if (adminLoading) {
            return undefined;
        }

        if (adminLoggedIn) {
            connectWebSocket();
            return () => {
                disconnectWebSocket();
            };
        }

        disconnectWebSocket();
        return undefined;
    }, [adminLoggedIn, adminLoading, connectWebSocket, disconnectWebSocket]);

    const downloadValue = useMemo(() => ({
        ...downloadState,
        connectWebSocket,
        disconnectWebSocket,
    }), [downloadState, connectWebSocket, disconnectWebSocket]);

    return (
        <AppDownloadContext.Provider value={downloadValue}>
            {children}
        </AppDownloadContext.Provider>
    );
}

// 仅提供 session 层；WS / 下载数据由 AppDownloadProvider 按需包裹主应用 shell
export function AppProvider({ children }) {
    return (
        <AppSessionProvider>
            {children}
        </AppSessionProvider>
    );
}

export function useAppSession() {
    const context = useContext(AppSessionContext);
    if (!context) {
        throw new Error('useAppSession 必须在 AppProvider 内部使用');
    }
    return context;
}

export function useAppDownload() {
    const context = useContext(AppDownloadContext);
    if (!context) {
        throw new Error('useAppDownload 必须在 AppDownloadProvider 内部使用');
    }
    return context;
}

export function useApp() {
    return {
        ...useAppSession(),
        ...useAppDownload(),
    };
}
