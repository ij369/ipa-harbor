const { exec } = require('child_process');
const path = require('path');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

// ipatool二进制文件路径
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

/**
 * 执行ipatool命令的通用函数
 * @param {string} command - 要执行的命令
 * @returns {Promise} 返回Promise对象
 */
function executeIpatool(command) {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                reject({
                    success: false,
                    error: error.message,
                    stderr: stderr,
                    stdout: stdout
                });
            } else {
                try {
                    // 尝试解析JSON输出
                    const result = JSON.parse(stdout);
                    resolve({
                        success: true,
                        data: result
                    });
                } catch (parseError) {
                    // 如果不是JSON格式，返回原始输出
                    resolve({
                        success: true,
                        rawOutput: stdout
                    });
                }
            }
        });
    });
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

        // 构建ipatool purchase命令
        const command = `"${IPATOOL_PATH}" purchase -b "${bundleId}" --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log(`执行购买命令: ${command}`);

        try {
            const result = await executeIpatool(command);

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
