const WebSocket = require('ws');
const { verifyToken } = require('../middleware/auth');
const database = require('./database');

class WebSocketManager {
    constructor() {
        this.servers = new Map(); // path -> Set<WebSocket>
        this.allowedPaths = new Set(['/download-task']);
    }

    /**
     * 解析cookie字符串
     * @param {string} cookieHeader - cookie头部字符串
     * @returns {Object} 解析后的cookie对象
     */
    parseCookies(cookieHeader) {
        const cookies = {};
        if (!cookieHeader) return cookies;

        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.trim().split('=');
            if (parts.length === 2) {
                cookies[parts[0]] = decodeURIComponent(parts[1]);
            }
        });
        return cookies;
    }

    /**
     * 验证WebSocket连接的认证状态
     * @param {Object} req - 请求对象
     * @returns {Promise<Object>} 验证结果
     */
    async authenticateWebSocket(req) {
        try {
            // 解析cookie
            const cookies = this.parseCookies(req.headers.cookie);
            const token = cookies.authToken;

            if (!token) {
                return {
                    success: false,
                    code: 4001,
                    message: '未提供认证令牌',
                    error: 'No authentication token provided'
                };
            }

            // 验证JWT令牌
            let decoded;
            try {
                decoded = verifyToken(token);
            } catch (error) {
                if (error.name === 'TokenExpiredError') {
                    return {
                        success: false,
                        code: 4002,
                        message: '认证令牌已过期',
                        error: 'Authentication token expired'
                    };
                } else if (error.name === 'JsonWebTokenError') {
                    return {
                        success: false,
                        code: 4003,
                        message: '无效的认证令牌',
                        error: 'Invalid authentication token'
                    };
                } else {
                    return {
                        success: false,
                        code: 4004,
                        message: '令牌验证失败',
                        error: 'Token verification failed'
                    };
                }
            }

            // 从数据库获取用户信息
            const user = await database.getUserById(decoded.userId);
            if (!user) {
                return {
                    success: false,
                    code: 4005,
                    message: '用户不存在或已被删除',
                    error: 'User not found or deleted'
                };
            }

            return {
                success: true,
                user: user
            };

        } catch (error) {
            return {
                success: false,
                code: 4006,
                message: '认证过程中发生内部错误',
                error: 'Internal authentication error'
            };
        }
    }

    // 挂载 HTTP 或 HTTPS WebSocket 服务
    attach(wss, label = 'ws') {
        wss.on('connection', async (ws, req) => {
            const [path] = req.url.split('?');

            // 检查路径是否被允许
            if (!this.allowedPaths.has(path)) {
                ws.close(4003, JSON.stringify({
                    success: false,
                    message: '未授权的WebSocket路径',
                    error: 'Unauthorized WebSocket path'
                }));
                return;
            }

            // 在生产环境下进行cookie验证
            if (process.env.NODE_ENV === 'production') {
                const authResult = await this.authenticateWebSocket(req);

                if (!authResult.success) {
                    console.warn(`拒绝未授权的 WebSocket 连接: ${path} (来源: ${req.headers.origin || 'unknown'})`);

                    ws.close(authResult.code, JSON.stringify({
                        success: false,
                        message: authResult.message,
                        error: authResult.error
                    }));
                    return;
                }

                // 将用户信息附加到WebSocket连接
                ws.user = authResult.user;
            }

            if (!this.servers.has(path)) {
                this.servers.set(path, new Set());
            }
            this.servers.get(path).add(ws);

            // 发送连接成功消息
            ws.send(JSON.stringify({
                type: 'system',
                data: `Connected to ${label} WebSocket: ${path}`,
                timestamp: new Date().toISOString()
            }));

            ws.on('message', (msg) => {
                try {
                    const data = JSON.parse(msg);
                    if (data.type === 'ping') {
                        ws.send(JSON.stringify({
                            type: 'pong',
                            timestamp: new Date().toISOString()
                        }));
                        return;
                    }

                    // 在生产环境下，只有认证用户才能发送广播消息
                    if (process.env.NODE_ENV === 'production' && !ws.user) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: '未认证用户无法发送消息',
                            error: 'Unauthenticated user cannot send messages'
                        }));
                        return;
                    }

                    this.broadcast(path, 'broadcast', {
                        timestamp: new Date().toISOString(),
                        message: data
                    });
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        data: '消息格式无效',
                        error: 'Invalid message format'
                    }));
                }
            });

            ws.on('close', () => {
                const set = this.servers.get(path);
                if (set) {
                    set.delete(ws);
                    if (set.size === 0) this.servers.delete(path);
                }
            });

            ws.on('error', (err) => {
                console.error(`[${label}] WebSocket error on ${path}:`, err.message);
            });
        });
    }

    broadcast(path, type, data) {
        const clients = this.servers.get(path);
        if (!clients || clients.size === 0) return;

        const message = JSON.stringify({ type, data, broadcast: true });
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }

    // 广播到默认路径 /download-task
    broadcastToDefault(type, data) {
        this.broadcast('/download-task', type, data);
    }
}

module.exports = new WebSocketManager();
