const { exec } = require('child_process');
const path = require('path');
const { clearIpatoolAccountCache } = require('../../utils/ipatoolAccount');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

/**
 * 执行ipatool命令的通用函数
 * @param {string} command - 要执行的命令
 * @returns {Promise} 返回Promise对象
 */
function executeIpatool(command) {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
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
 * 撤销认证
 */
async function revokeHandler(req, res) {
    try {
        // 构建ipatool revoke命令
        const command = `"${IPATOOL_PATH}" auth revoke --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log('执行撤销认证命令');

        try {
            const result = await executeIpatool(command);

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
