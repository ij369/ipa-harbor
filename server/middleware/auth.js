const jwt = require('jsonwebtoken');
const database = require('../utils/database');

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
            return res.status(401).json({
                success: false,
                message: '未提供认证令牌',
                error: 'No token provided'
            });
        }

        // 验证令牌
        const decoded = verifyToken(token);

        // 从数据库获取用户信息
        const user = await database.getUserById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户不存在',
                error: 'User not found'
            });
        }

        // 将用户信息添加到请求对象
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: '令牌已过期',
                error: 'Token expired'
            });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: '无效的令牌',
                error: 'Invalid token'
            });
        } else {
            console.error('认证中间件错误:', error);
            return res.status(500).json({
                success: false,
                message: '认证过程中发生错误',
                error: error.message
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
