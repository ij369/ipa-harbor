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

const allowLAN = process.env.ALLOW_LAN_ACCESS === 'true';
const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',').map(d => d.trim()) || [];

if (NODE_ENV !== 'development') {
    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const yellow = '\x1b[33m';
    const cyan = '\x1b[36m';
    const reset = '\x1b[0m'; // 结束样式

    console.log(`${cyan}局域网访问:${reset} ${allowLAN ? green + '已启用' : red + '已禁用'}${reset}`);
    console.log(`${cyan}允许的域名:${reset} ${allowedDomains.join(',') || yellow + '无'}${reset}`);
    console.log(`以上由环境变量决定，参考:\nhttps://github.com/ij369/ipa-harbor/blob/main/server/docker-compose.example.yml\n`);
} else {
    console.log(`当前环境: development\n`);
}

console.log(`---`);

// === Express 基础配置 ===
const app = express();
const HOST = 'localhost';
const PORT = process.env.PORT || 3080;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// 配置 helmet 以支持IP访问
app.use(helmet({
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    contentSecurityPolicy: (NODE_ENV === 'production' && !allowLAN) ? {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // React inline script
            styleSrc: ["'self'", "'unsafe-inline'"], // React style-loader inline CSS
            upgradeInsecureRequests: null, // 禁用自动升级HTTP到HTTPS
        },
    } : false, // 局域网访问时禁用CSP
    referrerPolicy: { policy: "no-referrer" },
}));

app.disable('x-powered-by');

// 配置 CORS 

const patterns = []; // 允许的源匹配规则

// 开发环境默认允许 localhost
if (NODE_ENV !== 'production') {
    patterns.push(/^https?:\/\/localhost(:\d+)?$/);
}

// 生产环境允许配置的域名
if (NODE_ENV === 'production') {
    patterns.push(
        ...allowedDomains.map(
            domain => new RegExp(`^https?://${domain.replace(/\./g, '\\.')}(?::\\d+)?$`)
        )
    );
}

// 局域网访问规则
if (allowLAN) {
    patterns.push(
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
        /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
        /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+(:\d+)?$/
    );
}

app.use(cors({
    origin: (origin, callback) => {
        const isAllowed = !origin || patterns.some(re => re.test(origin));
        return isAllowed
            ? callback(null, true)
            : callback(new Error('Not allowed by CORS'), false);
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
        console.log(`HTTPS 服务器运行在  https://${HOST}:${HTTPS_PORT}`);
        // console.log(`WebSocket: wss://${HOST}:${HTTPS_PORT}/download-task`);
    });
} catch (err) {
    if (process.env.NODE_ENV === 'production') {
        console.warn('HTTPS 未启用，certs/server.key 或 certs/server.crt 不存在');
    }
}

// === 启动 HTTP 服务器 ===
httpServer.listen(PORT, async () => {

    console.log(`HTTP 服务器运行在   http://${HOST}:${PORT}`);
    // console.log(`健康检查: http://${HOST}:${PORT}/health`);

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
