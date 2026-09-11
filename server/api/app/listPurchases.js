const { exec } = require('child_process');
const path = require('path');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

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
                    const result = JSON.parse(stdout);
                    resolve({
                        success: true,
                        data: result
                    });
                } catch (parseError) {
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
 * 获取已购项目列表
 */
async function listPurchasesHandler(req, res) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const maxResults = Math.min(Math.max(parseInt(req.query.maxResults, 10) || 50, 1), 100);

        const command = `"${IPATOOL_PATH}" list-purchases --page ${page} --max-results ${maxResults} --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        try {
            const result = await executeIpatool(command);

            if (result.success) {
                const data = result.data || {};
                return sendSuccess(res, {
                    message: '获取已购项目成功',
                    errorMessageCode: 'APP_LIST_PURCHASES_SUCCESS',
                    data: {
                        apps: data.apps || [],
                        count: data.count ?? (data.apps?.length || 0),
                        totalCount: data.totalCount ?? (data.apps?.length || 0),
                        page: data.page ?? page
                    }
                });
            }

            return sendError(res, 500, {
                message: '获取已购项目失败',
                errorMessageCode: 'APP_LIST_PURCHASES_FAILED',
                error: result.error,
                errorCode: 'APP_LIST_PURCHASES_EXEC_FAILED',
            });
        } catch (execError) {
            if (execError.stdout && execError.stdout.includes('failed to get account')) {
                return sendError(res, 401, {
                    message: '用户未登录或认证信息已过期',
                    errorMessageCode: 'AUTH_NOT_LOGGED_IN',
                    error: '请先登录',
                    errorCode: 'AUTH_LOGIN_REQUIRED',
                });
            }

            if (execError.stderr && execError.stderr.includes('unknown command')) {
                return sendError(res, 500, {
                    message: '当前 ipatool 不支持 list-purchases。该命令在 v2.4.0 之后才加入，请在本机执行 ./build_ipatool.sh 从源码编译，或等待官方新版本发布',
                    errorMessageCode: 'APP_LIST_PURCHASES_UNSUPPORTED',
                    error: execError.stderr.trim() || execError.message,
                    errorCode: 'APP_LIST_PURCHASES_IPATOOL_UNSUPPORTED',
                });
            }

            return sendError(res, 500, {
                message: '获取已购项目时发生错误',
                errorMessageCode: 'APP_LIST_PURCHASES_ERROR',
                error: execError.stderr?.trim() || execError.stdout?.trim() || execError.message || '执行命令失败',
                errorCode: 'APP_LIST_PURCHASES_EXEC_FAILED',
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

module.exports = listPurchasesHandler;
