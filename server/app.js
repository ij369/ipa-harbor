require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const cron = require('node-cron');
const wsManager = require('./utils/websocketServer');
const { getTaskManager } = require('./api/dl-manager/taskManager');
const ProgressParser = require('./utils/progressParser');
const database = require('./utils/database');
const { authenticateToken } = require('./middleware/auth');
const { NODE_ENV, KEYCHAIN_PASSPHRASE } = require('./config/keychain');

process.stdout.write('\x1Bc');
console.clear();

console.log(`当前环境: ${NODE_ENV}`);
console.log('提交 issue: https://github.com/ij369/ipa-harbor/issues\n')

// === Express 基础配置 ===
const app = express();
const HOST = 'localhost';
const PORT = process.env.PORT || 3080;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// 配置 helmet 以支持IP访问
app.use(helmet({
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: NODE_ENV === 'production' ? {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // React inline script
            styleSrc: ["'self'", "'unsafe-inline'"], // React style-loader inline CSS
        },
    } : false,
    referrerPolicy: { policy: "no-referrer" },
}));
app.disable('x-powered-by');

// === CORS 配置：开发仅 localhost，生产 localhost + ALLOWED_DOMAINS ===
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        const env = process.env.NODE_ENV || 'development';
        const allowedDomains = [];

        if (env === 'production' && process.env.ALLOWED_DOMAINS) {
            allowedDomains.push(...process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim()));
        }

        const localhostPatterns = [
            /^https?:\/\/localhost(:\d+)?$/,
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        ];

        const matchesLocalhost = localhostPatterns.some(re => re.test(origin));
        const matchesAllowedDomain = allowedDomains.some(domain => {
            const domainPattern = new RegExp(`^https?://${domain.replace(/\./g, '\\.')}(?::\\d+)?$`);
            return domainPattern.test(origin);
        });

        const isAllowed =
            env === 'production'
                ? (matchesLocalhost || matchesAllowedDomain)
                : matchesLocalhost;

        if (!isAllowed) return callback(new Error('Not allowed by CORS'), false);
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));


if (process.env.ENABLE_MORE_LOGS === 'true') {
    app.use(morgan('combined'));
}

if (KEYCHAIN_PASSPHRASE && NODE_ENV === 'production') {
    console.log(`KEYCHAIN_PASSPHRASE 已设置`);
}

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// 防止恶意
const rateLimit = require('express-rate-limit');
app.use('/v1/', rateLimit({
    windowMs: 1 * 60 * 1000,  // 1分钟
    max: 100,                 // 每分钟最多100次
    standardHeaders: true,    // 在响应头返回速率限制信息
    legacyHeaders: false,     // 不使用旧的X-RateLimit头
}));

// === API 路由 ===
// 需要管理员认证的路由
app.use('/v1/auth', authenticateToken, require('./api/auth'));
app.use('/v1/app', require('./api/app')); // 有些接口不需要管理员认证，在api/app/index.js中通过authenticateToken判断
app.use('/v1/dl-manager', authenticateToken, require('./api/dl-manager'));
app.use('/v1/ipa', require('./api/ipa')); // 下载和解析IPA文件不需要管理员认证
app.use('/v1/admin', require('./api/admin')); // 管理员认证路由（不需要预先认证）

app.use('/v1/*', (req, res) => res.status(404).json({ error: 'Not Found' }));

// === 健康检查 ===
app.get('/health', (req, res) => {
    // 检查bin/ipatool是否可用
    const ipatoolPath = path.join(__dirname, 'bin/ipatool');
    if (!fs.existsSync(ipatoolPath)) {
        return res.status(500).json({ error: 'IPATool 未安装', message: '请检查IPATool是否在 /app/bin 目录下' });
    }
    res.json({
        status: 'ok',
        service: 'ipa-harbor'
    });
});

// === 前端页面托管 ===
const staticPath = path.join(__dirname, 'static');
if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get('*', (req, res, next) => {
        if (req.originalUrl.startsWith('/v1/')) return next();
        res.sendFile(path.join(staticPath, 'index.html'));
    });
}

// // === 错误处理 react router 已经处理了404 ===
// app.use('*', (req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((err, req, res, next) => {
    if (err && err.message === 'Not allowed by CORS' && process.env.ENABLE_MORE_LOGS === 'true') {
        console.warn(`拒绝跨域请求资源: ${req.headers.origin || '未知来源'}`);
        return res.status(403).json({ error: 'CORS not allowed' });
    }

    // console.error(err.stack || err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// === HTTP Server ===
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });
wsManager.attach(wss, 'http');

let httpsServer = null;
try {
    const key = fs.readFileSync(path.join(__dirname, 'certs/server.key'));
    const cert = fs.readFileSync(path.join(__dirname, 'certs/server.crt'));
    httpsServer = https.createServer({ key, cert }, app);

    const wssSecure = new WebSocket.Server({ server: httpsServer });
    wsManager.attach(wssSecure, 'https');

    httpsServer.listen(HTTPS_PORT, () => {
        console.log(`HTTPS 服务器运行在 https://${HOST}:${HTTPS_PORT}`);
        console.log(`WebSocket: wss://${HOST}:${HTTPS_PORT}/download-task`);
    });
} catch (err) {
    if (process.env.NODE_ENV === 'production') {
        console.warn('HTTPS 未启用，certs/server.key 或 certs/server.crt 不存在');
    }
}

// === 启动 HTTP 服务器 ===
httpServer.listen(PORT, async () => {
    console.log(`---`);
    console.log(`HTTP 服务器运行在 http://${HOST}:${PORT}`);
    console.log(`健康检查: http://${HOST}:${PORT}/health`);

    // 初始化数据库
    try {
        await database.init();
        // console.log('数据库系统就绪');
    } catch (error) {
        console.error('数据库初始化失败:', error);
    }

    // 启动定时广播任务
    startCronTasks();
});

// === 定时广播任务 ===
function startCronTasks() {
    const taskManager = getTaskManager();

    // 每3秒广播文件列表 (watch类型)
    cron.schedule('*/3 * * * * *', () => {
        try {
            const files = taskManager.getFiles();
            const data = {
                success: true,
                data: {
                    files: files,
                    total: files.length,
                    totalSize: files.reduce((sum, file) => sum + file.size, 0)
                }
            };

            wsManager.broadcastToDefault('watch', data);
        } catch (error) {
            console.error('广播文件列表失败:', error);
        }
    });

    // 每2秒广播任务列表 (task-list类型)
    cron.schedule('*/2 * * * * *', () => {
        try {
            const tasks = taskManager.getTasks();

            // 使用公共方法处理任务分组和进度信息
            const { groupedTasks, summary } = ProgressParser.processTasksWithProgress(tasks, taskManager.progressTexts);

            const data = {
                success: true,
                data: {
                    ...groupedTasks,
                    summary
                }
            };

            wsManager.broadcastToDefault('task-list', data);
        } catch (error) {
            console.error('广播任务列表失败:', error);
        }
    });

}

module.exports = app;
