/**
 * 设置用户地区（手动覆盖 Apple ID storefront 默认地区）
 */

const {
    enrichUserData,
    setManualRegion,
} = require('../../utils/userRegion');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { execIpatool } = require('../../utils/ipatoolExec');
const { parseIpatoolOutput } = require('../../utils/ipatoolOutput');

async function getUserInfo() {
    const { error, stdout, stderr } = await execIpatool(['auth', 'info'], { timeout: 15000 });
    const parsed = parseIpatoolOutput(stdout, stderr);

    if (parsed.success && parsed.data?.email) {
        return parsed.data;
    }

    throw new Error(parsed.error || error?.message || '用户未登录或认证信息已过期');
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        return sendError(res, 405, {
            message: '不允许的请求方法',
            errorMessageCode: 'AUTH_REGION_METHOD_NOT_ALLOWED',
            error: '仅支持 POST 请求',
            errorCode: 'AUTH_REGION_POST_ONLY',
        });
    }

    try {
        let userInfo;
        try {
            userInfo = await getUserInfo();
        } catch (error) {
            return sendError(res, 401, {
                message: '用户未登录或认证信息已过期',
                errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                error: '请先登录',
                errorCode: 'AUTH_LOGIN_REQUIRED',
            });
        }

        if (!userInfo || !userInfo.email) {
            return sendError(res, 401, {
                message: '用户未登录或认证信息已过期',
                errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                error: '请先登录',
                errorCode: 'AUTH_LOGIN_REQUIRED',
            });
        }

        const { region } = req.body;

        if (!region) {
            setManualRegion(userInfo.email, null);
            const data = await enrichUserData(userInfo);
            return sendSuccess(res, {
                message: '已清除地区设置',
                errorMessageCode: 'AUTH_REGION_CLEARED',
                data
            });
        }

        if (!/^[a-z]{2}$/.test(region)) {
            return sendError(res, 400, {
                message: '地区代码格式无效',
                errorMessageCode: 'AUTH_REGION_INVALID_FORMAT',
                error: '地区代码须为两位小写字母',
                errorCode: 'AUTH_REGION_CODE_FORMAT',
            });
        }

        setManualRegion(userInfo.email, region);
        const data = await enrichUserData(userInfo);

        return sendSuccess(res, {
            message: '地区设置已更新',
            errorMessageCode: 'AUTH_REGION_UPDATE_SUCCESS',
            data
        });
    } catch (error) {
        console.error('设置用户地区失败:', error);
        return sendError(res, 500, {
            message: '设置地区失败',
            errorMessageCode: 'AUTH_REGION_SET_FAILED',
            error: error.message || '更新地区设置出错',
            errorCode: 'AUTH_REGION_ERROR_DETAIL',
        });
    }
}

module.exports = handler;
