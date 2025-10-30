const dayjs = require('dayjs');
/**
 * 管理员退出登录
 */
async function logoutHandler(req, res) {
    try {
        // 清除认证cookie
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        console.log(`管理员退出登录: ${req.user.username} , time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);

        return res.json({
            success: true,
            message: '退出登录成功'
        });

    } catch (error) {
        console.error('管理员退出登录错误:', error);
        return res.status(500).json({
            success: false,
            message: '退出登录过程中发生错误',
            error: error.message
        });
    }
}

module.exports = logoutHandler;
