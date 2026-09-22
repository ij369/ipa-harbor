require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
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
const { migrateExistingJsonSidecars } = require('./utils/versionMetadata');
const { authenticateToken } = require('./middleware/auth');
const { sendError } = require('./utils/apiResponse');
const { NODE_ENV, KEYCHAIN_PASSPHRASE } = require('./config/keychain');
const { bootstrapAdminStartup, syncSetupMarkerWithUsers } = require('./utils/adminBootstrap');
const passkeyService = require('./utils/passkeyService');
const certService = require('./utils/certService');
const httpsManager = require('./utils/httpsManager');
const lanConfig = require('./utils/lanConfig');

process.stdout.write('\x1Bc');
console.clear();

const allowLAN = process.env.ALLOW_LAN_ACCESS === 'true';
const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',').map(d => d.trim()).filter(Boolean) || [];
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';
const bold = '\x1b[1m';
const hrLine = '--------------------------------';
const reset = '\x1b[0m'; // 结束样式

if (NODE_ENV !== 'development') {
    console.log(`${bold}IPA Harbor${reset}`);
    console.log(hrLine);
    console.log(`${yellow}Access settings:${reset}`);
    console.log(`${cyan}LAN access:${reset} ${allowLAN ? green + 'enabled' : red + 'disabled'}${reset}`);
    console.log(`${cyan}Allowed domains:${reset} ${allowedDomains.join(',') || yellow + 'none'}${reset}`);
    console.log(`↳ For a full env template, see docker-compose.example.yml:\nhttps://github.com/ij369/ipa-harbor/blob/main/server/docker-compose.example.yml\n`);
} else {
    console.log(`${yellow}Environment: ${NODE_ENV}${reset}\n`);
}

// === Express 基础配置 ===
const app = express();
// nginx / Cloudflare 等反代会传 X-Forwarded-For，需显式开启（https 直连访问勿开，避免伪造 IP）
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
}
const HOST = 'localhost';
const PORT = process.env.PORT || 3080;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// 配置 helmet 以支持IP访问
app.use(helmet({
    crossOriginOpenerPolicy: allowLAN ? false : { policy: 'same-origin' },
    crossOriginResourcePolicy: allowLAN ? false : { policy: 'same-origin' },
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
        /^https?:\/\/localhost(:\d+)?$/i,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
        /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
        /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+(:\d+)?$/,
        // mDNS .local 主机名（Safari 会将 Origin 规范为小写）
        /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.local(?::\d+)?$/i
    );
}

// 局域网 HTTPS 主机名（WebAuthn / 自定义 DNS）
if (allowLAN || certService.isAutoCertEnabled()) {
    const { lanHostname } = lanConfig.getLanConfig();
    if (lanHostname && lanHostname !== lanConfig.DEFAULT_HOSTNAME) {
        const escapedHostname = lanHostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push(new RegExp(`^https?:\\/\\/${escapedHostname}(?::\\d+)?$`, 'i'));
    }
}

// CORS 仅作用于 API；静态资源不走 CORS，避免 iPhone Safari 加载 JS/CSS 时被 403 拦截
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || origin === 'null') {
            return callback(null, true);
        }
        const isAllowed = patterns.some((re) => re.test(origin));
        return isAllowed
            ? callback(null, true)
            : callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};


if (process.env.ENABLE_MORE_LOGS === 'true') {
    app.use(morgan('combined'));
}

// if (KEYCHAIN_PASSPHRASE && NODE_ENV === 'production') {
//     console.log(`${green}KEYCHAIN_PASSPHRASE is set${reset}`);
// }

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

// === 局域网 CA 证书下载（HTTP，无需登录；安装页由前端 /lan-ca 路由承载）===
// 终端 QR 由 utils/lanCaTerminalQr.js CLI 生成（部署脚本 docker exec 调用），不提供 HTTP /lan-ca/qr
app.get('/lan-ca/download', (req, res) => {
    if (!certService.isAutoCertEnabled()) {
        return res.status(404).send('LAN auto-cert is not enabled');
    }

    const caPem = certService.getCaCertPem();
    if (!caPem) {
        return res.status(404).send('CA certificate not found');
    }

    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="ipa-harbor-lan-ca.crt"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(caPem);
});

// === API 路由 ===
app.use('/v1', cors(corsOptions));
// 需要管理员认证的路由
app.use('/v1/auth', authenticateToken, require('./api/auth'));
app.use('/v1/app', require('./api/app')); // 有些接口不需要管理员认证，在api/app/index.js中通过authenticateToken判断
app.use('/v1/dl-manager', authenticateToken, require('./api/dl-manager'));
app.use('/v1/ipa', require('./api/ipa')); // 下载和解析IPA文件不需要管理员认证
app.use('/v1/admin', require('./api/admin')); // 管理员认证路由（不需要预先认证）

app.use('/v1/*', (req, res) => sendError(res, 404, {
    message: '接口不存在',
    errorMessageCode: 'API_NOT_FOUND',
    error: 'Not Found',
    errorCode: 'API_NOT_FOUND_DETAIL',
}));

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
    if (err && err.message === 'Not allowed by CORS') {
        console.warn(`CORS request rejected: ${req.headers.origin || 'unknown origin'}`);
        return sendError(res, 403, {
            message: '跨域请求被拒绝',
            errorMessageCode: 'CORS_NOT_ALLOWED',
            error: 'CORS not allowed',
            errorCode: 'CORS_NOT_ALLOWED_DETAIL',
        });
    }

    // console.error(err.stack || err);
    return sendError(res, 500, {
        message: '服务器内部错误',
        errorMessageCode: 'INTERNAL_SERVER_ERROR',
        error: err?.message || 'Internal Server Error',
        errorCode: 'INTERNAL_ERROR_DETAIL',
    });
});

// === HTTP Server ===
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });
wsManager.attach(wss, 'http');

async function bootstrapHttpsServer() {
    if (certService.isAutoCertEnabled()) {
        if (!lanConfig.warnIfLanIpMissing()) {
            return false;
        }

        try {
            const material = certService.bootstrapAutoCert();
            if (material) {
                await httpsManager.start(app, material.key, material.cert, HTTPS_PORT);
                return true;
            }
        } catch (error) {
            console.error('局域网 HTTPS 启动失败:', error.message);
        }
        return false;
    }

    const manualKeyPath = path.join(__dirname, 'certs/server.key');
    const manualCertPath = path.join(__dirname, 'certs/server.crt');
    if (!fs.existsSync(manualKeyPath) || !fs.existsSync(manualCertPath)) {
        const isLocalLanOnly = allowLAN && allowedDomains.length === 0;
        if (process.env.NODE_ENV === 'production' && !isLocalLanOnly) {
            console.log(hrLine);
            console.warn(`${yellow}HTTPS Tutorial:${reset}\n Built-in HTTPS is not configured.\n ├ 1. Choose one:\n |    a) Set ENABLE_AUTO_CERT=true with LAN_IP\n |    b) Place certs/server.key and certs/server.crt in certs/\n |    c) Reverse-proxy the HTTP port (e.g. nginx, Caddy) to handle HTTPS\n └ 2. Set ALLOWED_DOMAINS to your public domain\n \n ↳ You can also refer to docker-compose.example.yml\n`);
        }
        return false;
    }

    try {
        const key = fs.readFileSync(manualKeyPath);
        const cert = fs.readFileSync(manualCertPath);
        await httpsManager.start(app, key, cert, HTTPS_PORT);

        if (allowedDomains.length === 0) {
            console.log(hrLine);
            console.warn(`${yellow}ALLOWED_DOMAINS is not set:${reset}\n └ Browser access from your domain may be blocked.\n ↳ See docker-compose.example.yml: https://github.com/ij369/ipa-harbor/blob/main/server/docker-compose.example.yml\n`);
            console.log(hrLine);
        }
        return true;
    } catch (error) {
        console.error('HTTPS 启动失败:', error.message);
        return false;
    }
}

// === 启动 HTTP 服务器 ===
async function startHttpServer() {
    try {
        await bootstrapAdminStartup();
        await database.init();
        await syncSetupMarkerWithUsers(database);
        await migrateExistingJsonSidecars();
        await passkeyService.runChallengeCleanupOnStartup();
        if (passkeyService.isWebAuthnConfigured()) {
            passkeyService.warmupAaguidRegistry().catch((error) => {
                console.warn('AAGUID 注册表预加载失败:', error.message);
            });
        }
    } catch (error) {
        console.error('服务启动初始化失败:', error);
        process.exit(1);
    }

    let httpsReady = false;
    try {
        httpsReady = await bootstrapHttpsServer();
    } catch (error) {
        console.error('HTTPS 初始化失败:', error.message);
    }

    httpServer.listen(PORT, () => {
        console.log(hrLine);
        console.log(`${green}Server started successfully.${reset}`);
        if (NODE_ENV === 'production') {
            console.log(`${green}HTTP port:${reset} ${PORT}`);
            if (httpsReady) {
                console.log(`${green}HTTPS port:${reset} ${HTTPS_PORT}`);
            }
        } else {
            console.log(`${green}HTTP:${reset}  ${lanConfig.formatLanUrl('http', HOST, PORT)}`);
            if (httpsReady) {
                console.log(`${green}HTTPS:${reset} ${lanConfig.formatLanUrl('https', HOST, HTTPS_PORT)}`);
            }
        }
        if (certService.isAutoCertEnabled()) {
            const status = certService.getLanHttpsStatus();
            if (status.lanIp && status.httpsUrl) {
                if (status.httpsHostnameUrl) {
                    console.log(`\n${cyan}LAN HTTPS:${reset} ${status.httpsHostnameUrl}`);
                    console.log(`           ${status.httpsUrl}`);
                } else {
                    console.log(`\n${cyan}LAN HTTPS:${reset} ${status.httpsUrl}`);
                }
            }
        }
        console.log(hrLine);

        startCronTasks();
    });
}

startHttpServer();

// === 定时广播任务 ===
function startCronTasks() {
    const taskManager = getTaskManager();

    // 每3秒广播文件列表 (watch类型)
    cron.schedule('*/3 * * * * *', async () => {
        try {
            const files = await taskManager.getFiles();
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

    passkeyService.startChallengeCleanupCron();

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
