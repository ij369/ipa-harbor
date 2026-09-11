const { clearIpatoolAccountCache } = require('../../utils/ipatoolAccount');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { execIpatool } = require('../../utils/ipatoolExec');

/**
 * 执行ipatool命令的通用函数
 * @param {string[]} args - ipatool 子命令参数
 * @returns {Promise} 返回Promise对象
 */
async function executeIpatool(args) {
    const { error, stdout, stderr } = await execIpatool(args, { timeout: 15000 });

    if (error) {
        throw {
            success: false,
            error: error.message,
            stderr,
            stdout,
        };
    }

    try {
        const result = JSON.parse(stdout);
        return {
            success: true,
            data: result,
        };
    } catch (parseError) {
        return {
            success: true,
            rawOutput: stdout,
        };
    }
}

/**
 * 撤销认证
 */
async function revokeHandler(req, res) {
    try {
        // console.log('执行撤销认证命令');

        try {
            const result = await executeIpatool(['auth', 'revoke']);

            if (result.success) {
                clearIpatoolAccountCache();
                return sendSuccess(res, {
                    message: '撤销认证成功',
                    errorMessageCode: 'AUTH_REVOKE_SUCCESS',
                    data: result.data || result.rawOutput
                });
            } else {
                return sendError(res, 500, {
                    message: '撤销认证失败',
                    errorMessageCode: 'AUTH_REVOKE_FAILED',
                    error: result.error,
                    errorCode: 'AUTH_REVOKE_EXEC_FAILED',
                });
            }
        } catch (execError) {
            // console.error('执行ipatool revoke命令时出错:', execError);

            // 检查是否是未登录的错误
            if (execError.stderr && (
                execError.stderr.includes('not logged in') ||
                execError.stderr.includes('未登录') ||
                execError.stderr.includes('authentication') ||
                execError.stderr.includes('keychain')
            )) {
                return sendError(res, 401, {
                    message: '用户未登录或认证信息已过期',
                    errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                    error: '没有可撤销的认证信息',
                    errorCode: 'AUTH_REVOKE_NO_AUTH_INFO',
                });
            }

            return sendError(res, 500, {
                message: '撤销认证时发生错误',
                errorMessageCode: 'AUTH_REVOKE_ERROR',
                error: execError.message || '执行命令失败',
                errorCode: 'AUTH_REVOKE_EXEC_FAILED',
            });
        }

    } catch (error) {
        // console.error('撤销认证错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = revokeHandler;
