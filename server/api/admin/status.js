const database = require('../../utils/database');
const { getAppVersion } = require('../../utils/version');
const { readAppSettings } = require('../../utils/appSettings');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 获取管理员登录状态
 */
async function statusHandler(req, res) {
    try {
        const version = getAppVersion();
        const settings = await readAppSettings(req.user?.id);
        // 检查系统是否已初始化（是否有用户）
        const userCount = await database.getUserCount();
        const isInitialized = userCount > 0;

        // 如果用户已登录
        if (req.user) {
            return sendSuccess(res, {
                errorMessageCode: 'ADMIN_STATUS_FETCH_SUCCESS',
                data: {
                    version,
                    settings,
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
        return sendSuccess(res, {
            errorMessageCode: 'ADMIN_STATUS_FETCH_SUCCESS',
            data: {
                version,
                settings,
                isInitialized,
                isLoggedIn: false,
                user: null,
                expiresAt: null
            }
        });

    } catch (error) {
        console.error('获取管理员状态错误:', error);
        return sendError(res, 500, {
            message: '获取状态时发生错误',
            errorMessageCode: 'ADMIN_STATUS_FETCH_FAILED',
            error: error.message,
            errorCode: 'ADMIN_STATUS_ERROR_DETAIL',
        });
    }
}

module.exports = statusHandler;
