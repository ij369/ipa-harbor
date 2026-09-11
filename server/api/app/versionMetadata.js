const { refreshVersionMetadata } = require('../../utils/versionMetadata');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 手动拉取并缓存单个版本的 Apple 元数据
 */
async function versionMetadataHandler(req, res) {
    try {
        const { appId, versionId } = req.params;

        if (!appId || !versionId) {
            return sendError(res, 400, {
                message: 'App ID 和 Version ID 是必需的参数',
                errorMessageCode: 'APP_VERSION_METADATA_PARAMS_REQUIRED',
                error: 'App ID 和 Version ID 为必填项',
                errorCode: 'APP_VERSION_METADATA_PARAMS_MISSING',
            });
        }

        const result = await refreshVersionMetadata(appId, versionId, { updateSidecar: true });

        return sendSuccess(res, {
            message: '版本元数据获取成功',
            errorMessageCode: 'APP_VERSION_METADATA_FETCH_SUCCESS',
            data: {
                versionId: result.versionId,
                bundleVersion: result.bundleVersion,
                releaseDate: result.releaseDate,
            },
        });
    } catch (error) {
        console.error('获取版本元数据失败:', error);

        if (error.errorType === 'TOKEN_EXPIRED') {
            return sendError(res, 401, {
                message: error.message,
                errorMessageCode: 'AUTH_TOKEN_EXPIRED',
                errorType: 'TOKEN_EXPIRED',
                error: error.message || '密码令牌已过期，请重新登录',
                errorCode: 'AUTH_PASSWORD_TOKEN_EXPIRED',
            });
        }

        if (error.errorType === 'RATE_LIMITED') {
            return sendError(res, 429, {
                message: error.message,
                errorMessageCode: 'APP_VERSION_METADATA_RATE_LIMITED',
                errorType: 'RATE_LIMITED',
                error: error.message,
                errorCode: 'APP_VERSION_METADATA_RATE_LIMITED_DETAIL',
            });
        }

        return sendError(res, 500, {
            message: '获取版本元数据失败',
            errorMessageCode: 'APP_VERSION_METADATA_FETCH_FAILED',
            error: error.message,
            errorCode: 'APP_VERSION_METADATA_ERROR_DETAIL',
        });
    }
}

module.exports = versionMetadataHandler;
