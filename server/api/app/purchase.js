const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { execIpatool } = require('../../utils/ipatoolExec');

/**
 * 执行ipatool命令的通用函数
 * @param {string[]} args - ipatool 子命令参数
 * @returns {Promise} 返回Promise对象
 */
async function executeIpatool(args) {
    const { error, stdout, stderr } = await execIpatool(args, { timeout: 60000 });

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
 * 购买App
 */
async function purchaseHandler(req, res) {
    try {
        const { bundleId } = req.params;

        // 参数验证
        if (!bundleId) {
            return sendError(res, 400, {
                message: 'Bundle ID是必需的参数',
                errorMessageCode: 'APP_PURCHASE_BUNDLE_ID_REQUIRED',
                error: '请在URL路径中提供bundleId',
                errorCode: 'APP_PURCHASE_BUNDLE_ID_MISSING',
            });
        }

        // console.log(`执行购买命令: purchase -b ${bundleId}`);

        try {
            const result = await executeIpatool(['purchase', '-b', bundleId]);

            if (result.success) {
                return sendSuccess(res, {
                    message: '购买/领取成功',
                    errorMessageCode: 'APP_PURCHASE_SUCCESS',
                    bundleId: bundleId,
                    data: result.data || result.rawOutput
                });
            } else {
                return sendError(res, 500, {
                    message: '购买/领取失败',
                    errorMessageCode: 'APP_PURCHASE_FAILED',
                    error: result.error,
                    errorCode: 'APP_PURCHASE_EXEC_FAILED',
                });
            }
        } catch (execError) {
            // console.error('执行ipatool purchase命令时出错:', execError);

            // 检查是否是认证相关错误
            if (execError.stdout && (
                execError.stdout.includes('failed to get account')
            )) {
                return sendError(res, 401, {
                    message: '用户未登录或认证信息已过期',
                    errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                    error: '请先登录',
                    errorCode: 'AUTH_LOGIN_REQUIRED',
                });
            }

            // 检查是否是已经拥有的错误
            if (execError.stderr && (
                execError.stderr.includes('already purchased') ||
                execError.stderr.includes('已购买') ||
                execError.stderr.includes('already own')
            )) {
                return sendError(res, 409, {
                    message: '该应用已经购买过了',
                    errorMessageCode: 'APP_PURCHASE_ALREADY_OWNED',
                    error: '无需重复购买',
                    errorCode: 'APP_PURCHASE_NO_REPEAT',
                });
            }

            return sendError(res, 500, {
                message: '购买/领取时发生错误',
                errorMessageCode: 'APP_PURCHASE_ERROR',
                error: execError.message || '执行命令失败',
                errorCode: 'APP_PURCHASE_EXEC_FAILED',
            });
        }

    } catch (error) {
        // console.error('购买处理错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = purchaseHandler;
