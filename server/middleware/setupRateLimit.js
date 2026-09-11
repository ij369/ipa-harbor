const rateLimit = require('express-rate-limit');

const SETUP_RATE_LIMIT_WINDOW_MS = parseInt(process.env.SETUP_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const SETUP_RATE_LIMIT_MAX = parseInt(process.env.SETUP_RATE_LIMIT_MAX, 10) || 5;

/** 初始化 setup 限流：超出后直接断开连接，不返回 HTTP 响应 */
const setupRateLimit = rateLimit({
    windowMs: SETUP_RATE_LIMIT_WINDOW_MS,
    max: SETUP_RATE_LIMIT_MAX,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        if (typeof req.socket?.destroy === 'function') {
            req.socket.destroy();
            return;
        }
        res.destroy();
    },
});

module.exports = setupRateLimit;
