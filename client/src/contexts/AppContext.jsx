import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { getUserInfo } from '../utils/api';
import { useAdmin } from './AdminContext';

const initialState = {
    user: null,
    isAuthenticated: false,
    loading: true,
    error: null,
    // Ws 相关状态
    wsConnected: false,
    wsReconnecting: false,
    // 任务相关状态
    taskList: {
        running: [],
        pending: [],
        completed: [],
        failed: [],
        cancelled: [],
        summary: {}
    },
    fileList: {
        files: [],
        total: 0,
        totalSize: 0
    }
};

const ActionTypes = {
    SET_LOADING: 'SET_LOADING',
    SET_USER: 'SET_USER',
    CLEAR_USER: 'CLEAR_USER',
    SET_ERROR: 'SET_ERROR',
    // WS相关
    SET_WS_CONNECTED: 'SET_WS_CONNECTED',
    SET_WS_RECONNECTING: 'SET_WS_RECONNECTING',
    // 任务相关
    SET_TASK_LIST: 'SET_TASK_LIST',
    SET_FILE_LIST: 'SET_FILE_LIST'
};

function appReducer(state, action) {
    switch (action.type) {
        case ActionTypes.SET_LOADING:
            return {
                ...state,
                loading: action.payload
            };
        case ActionTypes.SET_USER:
            return {
                ...state,
                user: action.payload,
                isAuthenticated: true,
                loading: false,
                error: null
            };
        case ActionTypes.CLEAR_USER:
            return {
                ...state,
                user: null,
                isAuthenticated: false,
                loading: false,
                error: null
            };
        case ActionTypes.SET_ERROR:
            return {
                ...state,
                error: action.payload,
                loading: false
            };
        case ActionTypes.SET_WS_CONNECTED:
            return {
                ...state,
                wsConnected: action.payload,
                wsReconnecting: false
            };
        case ActionTypes.SET_WS_RECONNECTING:
            return {
                ...state,
                wsReconnecting: action.payload
            };
        case ActionTypes.SET_TASK_LIST:
            return {
                ...state,
                taskList: action.payload
            };
        case ActionTypes.SET_FILE_LIST:
            return {
                ...state,
                fileList: action.payload
            };
        default:
            return state;
    }
}

const AppContext = createContext();

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const pingIntervalRef = useRef(null);
    const adminLoggedInRef = useRef(false);
    const { isLoggedIn: adminLoggedIn, loading: adminLoading } = useAdmin();

    // 更新管理员登录状态的ref
    adminLoggedInRef.current = adminLoggedIn;

    // 检查用户认证状态
    const checkAuthStatus = async () => {
        try {
            dispatch({ type: ActionTypes.SET_LOADING, payload: true });
            const response = await getUserInfo();

            if (response.success && response.data) {
                dispatch({ type: ActionTypes.SET_USER, payload: response.data });
            } else {
                dispatch({ type: ActionTypes.CLEAR_USER });
            }
        } catch (error) {
            // 静默处理认证失败，不显示错误提示
            dispatch({ type: ActionTypes.CLEAR_USER });
        }
    };

    // 登出
    const logout = () => {
        dispatch({ type: ActionTypes.CLEAR_USER });
    };

    const setUser = (userData) => {
        dispatch({ type: ActionTypes.SET_USER, payload: userData });
    };

    const refreshUser = () => {
        checkAuthStatus();
    };

    // Ws 连接函数
    const connectWebSocket = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const HOST = window.location.hostname;
        const PORT =
            import.meta.env.MODE === 'production' ?
                window.location.port :
                import.meta.env.VITE_WEBSOCKET_PORT;
        const wsUrl = `${wsProtocol}//${HOST}:${PORT}/download-task`;
        console.log('连接WebSocket:', wsUrl);

        try {
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                console.log('WebSocket连接成功');
                dispatch({ type: ActionTypes.SET_WS_CONNECTED, payload: true });

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
                        case 'task-list':
                            const taskData = message.data;
                            if (taskData.success) {
                                // console.log('任务列表:', taskData.data);
                                dispatch({ type: ActionTypes.SET_TASK_LIST, payload: taskData.data });
                            }
                            break;

                        case 'watch':
                            const fileData = message.data;
                            if (fileData.success) {
                                dispatch({ type: ActionTypes.SET_FILE_LIST, payload: fileData.data });
                            }
                            break;

                        case 'task-completed':
                            const completedData = JSON.parse(message.data);
                            // console.log('任务完成:', completedData);
                            // 任务完成后会通过task-list更新状态
                            break;

                        case 'pong':
                            // 不需要处理
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
                dispatch({ type: ActionTypes.SET_WS_CONNECTED, payload: false });
                stopPing();

                // 只有在管理员仍然登录时才尝试重连
                if (!reconnectTimeoutRef.current && adminLoggedInRef.current) {
                    dispatch({ type: ActionTypes.SET_WS_RECONNECTING, payload: true });
                    reconnectTimeoutRef.current = setTimeout(() => {
                        // 重连前再次检查管理员登录状态
                        if (adminLoggedInRef.current) {
                            console.log('尝试重连WebSocket...');
                            connectWebSocket();
                        } else {
                            console.log('管理员已退出登录，取消WebSocket重连');
                            dispatch({ type: ActionTypes.SET_WS_RECONNECTING, payload: false });
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
    };

    // 断开WebSocket连接
    const disconnectWebSocket = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        stopPing();
        dispatch({ type: ActionTypes.SET_WS_CONNECTED, payload: false });
        dispatch({ type: ActionTypes.SET_WS_RECONNECTING, payload: false });
    };

    const startPing = () => {
        stopPing();

        pingIntervalRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    };

    const stopPing = () => {
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
        }
    };

    useEffect(() => {
        // 只有在管理员已登录且不在加载状态时才执行
        if (!adminLoading && adminLoggedIn) {
            checkAuthStatus();
            connectWebSocket();
        }

        return () => {
            disconnectWebSocket();
        };
    }, [adminLoggedIn, adminLoading]);

    // 当管理员登出时，清理用户状态和Ws连接
    useEffect(() => {
        if (!adminLoading && !adminLoggedIn) {
            // 清理用户的状态
            dispatch({ type: ActionTypes.CLEAR_USER });
            // 断开连接
            disconnectWebSocket();
        }
    }, [adminLoggedIn, adminLoading]);

    const value = {
        ...state,
        logout,
        setUser,
        refreshUser,
        checkAuthStatus,
        connectWebSocket,
        disconnectWebSocket
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp必须在AppProvider内部使用');
    }
    return context;
}
