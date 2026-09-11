const { enrichUserData } = require('../../utils/userRegion');
const { parseIpatoolOutput } = require('../../utils/ipatoolOutput');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { execIpatool } = require('../../utils/ipatoolExec');

async function executeIpatool(args) {
    const { error, stdout, stderr } = await execIpatool(args, { timeout: 15000 });
    const parsed = parseIpatoolOutput(stdout, stderr);

    if (parsed.success && parsed.data?.email) {
        return {
            success: true,
            data: parsed.data,
        };
    }

    throw {
        success: false,
        error: parsed.error || error?.message || '执行命令失败',
        stderr,
        stdout,
        rawOutput: parsed.rawOutput,
    };
}

function isNotLoggedInError(execError) {
    const combined = `${execError.stdout || ''}\n${execError.stderr || ''}\n${execError.error || ''}\n${execError.rawOutput || ''}`;
    return (
        combined.includes('not logged in') ||
        combined.includes('未登录') ||
        combined.includes('The specified item could not be found in the keyring') ||
        combined.includes('failed to get account')
    );
}

async function infoHandler(req, res) {
    try {
        try {
            const result = await executeIpatool(['auth', 'info']);

            if (result.success && result.data?.email) {
                const userData = await enrichUserData(result.data);

                return sendSuccess(res, {
                    message: '获取认证信息成功',
                    errorMessageCode: 'AUTH_INFO_FETCH_SUCCESS',
                    data: userData
                });
            }

            return sendError(res, 401, {
                message: '用户未登录或认证信息已过期',
                errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                error: '请先登录',
                errorCode: 'AUTH_LOGIN_REQUIRED',
            });
        } catch (execError) {
            if (isNotLoggedInError(execError)) {
                return sendError(res, 401, {
                    message: '用户未登录或认证信息已过期',
                    errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                    error: '请先登录',
                    errorCode: 'AUTH_LOGIN_REQUIRED',
                });
            }

            return sendError(res, 500, {
                message: '获取认证信息时发生错误',
                errorMessageCode: 'AUTH_INFO_FETCH_FAILED',
                error: execError.error || execError.message || '执行命令失败',
                errorCode: 'AUTH_INFO_EXEC_FAILED',
            });
        }
    } catch (error) {
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = infoHandler;
