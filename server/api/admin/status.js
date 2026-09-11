const database = require('../../utils/database');
const { getAppVersion } = require('../../utils/version');
const { readAppSettings } = require('../../utils/appSettings');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const {
    isSetupCompleted,
    syncSetupMarkerWithUsers,
} = require('../../utils/adminBootstrap');

/**
 * 获取管理员登录状态
 */
async function statusHandler(req, res) {
    try {
        await syncSetupMarkerWithUsers(database);

        const version = getAppVersion();
        const settings = await readAppSettings(req.user?.id);
        const isInitialized = isSetupCompleted();
        const setupRequiresInitPin = true;

        if (req.user) {
            return sendSuccess(res, {
                errorMessageCode: 'ADMIN_STATUS_FETCH_SUCCESS',
                data: {
                    version,
                    settings,
                    isInitialized: true,
                    isLoggedIn: true,
                    setupRequiresInitPin,
                    user: {
                        id: req.user.id,
                        username: req.user.username,
                        created_at: req.user.created_at,
                        updated_at: req.user.updated_at,
                    },
                    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                },
            });
        }

        return sendSuccess(res, {
            errorMessageCode: 'ADMIN_STATUS_FETCH_SUCCESS',
            data: {
                version,
                settings,
                isInitialized,
                isLoggedIn: false,
                setupRequiresInitPin,
                user: null,
                expiresAt: null,
            },
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
