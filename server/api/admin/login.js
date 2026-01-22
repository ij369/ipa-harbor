const bcrypt = require('bcrypt');
const database = require('../../utils/database');
const { generateToken } = require('../../middleware/auth');
const dayjs = require('dayjs');
/**
 * 管理员登录
 */
async function loginHandler(req, res) {
    try {
        const { username, password } = req.body;

        // 参数验证
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: '用户名和密码是必需的参数',
                error: 'Username and password are required'
            });
        }

        // 查找用户
        const user = await database.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误',
                error: 'Invalid credentials'
            });
        }

        // 验证密码
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误',
                error: 'Invalid credentials'
            });
        }

        // 生成JWT令牌
        const token = generateToken({
            userId: user.id,
            username: user.username
        });

        // 设置cookie
        const isLanAccess = process.env.ALLOW_LAN_ACCESS === 'true';
        res.cookie('authToken', token, {
            httpOnly: true,           // 防止XSS攻击
            secure: process.env.NODE_ENV === 'production' && !isLanAccess, // 局域网访问时不强制HTTPS
            sameSite: isLanAccess ? 'lax' : 'strict',       // 局域网访问时放宽同站策略
            maxAge: 2 * 24 * 60 * 60 * 1000 // 2天，单位毫秒
        });

        console.log(`管理员登录成功: ${username} , time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);

        return res.json({
            success: true,
            message: '登录成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                },
                expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
            }
        });

    } catch (error) {
        console.error('管理员登录错误:', error);
        return res.status(500).json({
            success: false,
            message: '管理员登录过程中发生错误',
            error: error.message
        });
    }
}

module.exports = loginHandler;
