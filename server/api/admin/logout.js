const dayjs = require('dayjs');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 管理员退出登录
 */
async function logoutHandler(req, res) {
    try {
        // 清除认证cookie
        const isLanAccess = process.env.ALLOW_LAN_ACCESS === 'true';
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production' && !isLanAccess,
            sameSite: isLanAccess ? 'lax' : 'strict'
        });

        console.log(`管理员退出登录: ${req.user.username} , time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);

        return sendSuccess(res, {
            message: '退出登录成功',
            errorMessageCode: 'ADMIN_LOGOUT_SUCCESS',
        });

    } catch (error) {
        console.error('管理员退出登录错误:', error);
        return sendError(res, 500, {
            message: '退出登录过程中发生错误',
            errorMessageCode: 'ADMIN_LOGOUT_FAILED',
            error: error.message,
            errorCode: 'ADMIN_LOGOUT_ERROR_DETAIL',
        });
    }
}

module.exports = logoutHandler;
