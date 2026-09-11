const jwt = require('jsonwebtoken');
const database = require('../utils/database');
const { sendError } = require('../utils/apiResponse');

// JWT密钥，从环境变量获取
const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2d'; // 2天

/**
 * 生成JWT令牌
 * @param {Object} payload - 要编码的数据
 * @returns {string} JWT令牌
 */
function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证JWT令牌
 * @param {string} token - JWT令牌
 * @returns {Object} 解码后的数据
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

/**
 * JWT认证中间件
 * 检查请求中的JWT令牌是否有效
 */
async function authenticateToken(req, res, next) {
    try {
        // 从cookie中获取令牌
        const token = req.cookies?.authToken;

        if (!token) {
            return sendError(res, 401, {
                message: '未提供认证令牌',
                errorMessageCode: 'AUTH_TOKEN_NOT_PROVIDED',
                error: 'No token provided',
                errorCode: 'AUTH_NO_TOKEN_PROVIDED',
            });
        }

        // 验证令牌
        const decoded = verifyToken(token);

        // 从数据库获取用户信息
        const user = await database.getUserById(decoded.userId);

        if (!user) {
            return sendError(res, 401, {
                message: '用户不存在',
                errorMessageCode: 'AUTH_USER_NOT_FOUND',
                error: 'User not found',
                errorCode: 'AUTH_USER_NOT_FOUND_DETAIL',
            });
        }

        // 将用户信息添加到请求对象
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return sendError(res, 401, {
                message: '令牌已过期',
                errorMessageCode: 'AUTH_JWT_TOKEN_EXPIRED',
                error: 'Token expired',
                errorCode: 'AUTH_JWT_EXPIRED_DETAIL',
            });
        } else if (error.name === 'JsonWebTokenError') {
            return sendError(res, 401, {
                message: '无效的令牌',
                errorMessageCode: 'AUTH_TOKEN_INVALID',
                error: 'Invalid token',
                errorCode: 'AUTH_JWT_INVALID_DETAIL',
            });
        } else {
            console.error('认证中间件错误:', error);
            return sendError(res, 500, {
                message: '认证过程中发生错误',
                errorMessageCode: 'AUTH_MIDDLEWARE_ERROR',
                error: error.message,
                errorCode: 'AUTH_MIDDLEWARE_ERROR_DETAIL',
            });
        }
    }
}

/**
 * 可选的JWT认证中间件
 * 如果有令牌则验证，没有令牌则继续
 */
async function optionalAuth(req, res, next) {
    try {
        const token = req.cookies?.authToken;

        if (token) {
            const decoded = verifyToken(token);
            const user = await database.getUserById(decoded.userId);
            if (user) {
                req.user = user;
            }
        }

        next();
    } catch (error) {
        // 可选认证失败时不阻止请求，只是不设置用户信息
        next();
    }
}

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    JWT_SECRET,
    JWT_EXPIRES_IN
};
