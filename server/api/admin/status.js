const database = require('../../utils/database');

/**
 * 获取管理员登录状态
 */
async function statusHandler(req, res) {
    try {
        // 检查系统是否已初始化（是否有用户）
        const userCount = await database.getUserCount();
        const isInitialized = userCount > 0;

        // 如果用户已登录
        if (req.user) {
            return res.json({
                success: true,
                data: {
                    isInitialized: true,
                    isLoggedIn: true,
                    user: {
                        id: req.user.id,
                        username: req.user.username,
                        created_at: req.user.created_at,
                        updated_at: req.user.updated_at
                    },
                    // 从cookie中获取过期时间（2天后）
                    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
                }
            });
        }

        // 用户未登录
        return res.json({
            success: true,
            data: {
                isInitialized,
                isLoggedIn: false,
                user: null,
                expiresAt: null
            }
        });

    } catch (error) {
        console.error('获取管理员状态错误:', error);
        return res.status(500).json({
            success: false,
            message: '获取状态时发生错误',
            error: error.message
        });
    }
}

module.exports = statusHandler;
