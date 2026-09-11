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
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
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
 * 搜索App
 */
async function searchHandler(req, res) {
    try {
        const { keyword, limit } = req.query;

        // 参数验证
        if (!keyword) {
            return sendError(res, 400, {
                message: '搜索关键词是必需的参数',
                errorMessageCode: 'APP_SEARCH_KEYWORD_REQUIRED',
                error: '请在查询参数中提供keyword',
                errorCode: 'APP_SEARCH_KEYWORD_MISSING',
            });
        }

        const parsedLimit = isNaN(limit) ? 10 : parseInt(limit); // 如果limit不是数字，则默认为10

        // 获取用户设置的地区
        const { getEffectiveRegion } = require('../../utils/userRegion');
        const userRegion = await getEffectiveRegion();

        // 构建ipatool search命令
        const command = `"${IPATOOL_PATH}" search "${keyword}" --limit ${parsedLimit} --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log(`执行搜索命令: ${command}`);

        try {
            const result = await executeIpatool(command);

            if (result.success) {
                return sendSuccess(res, {
                    message: '搜索成功',
                    errorMessageCode: 'APP_SEARCH_SUCCESS',
                    keyword: keyword,
                    data: result.data || result.rawOutput
                });
            } else {
                return sendError(res, 500, {
                    message: '搜索失败',
                    errorMessageCode: 'APP_SEARCH_FAILED',
                    error: result.error,
                    errorCode: 'APP_SEARCH_EXEC_FAILED',
                });
            }
        } catch (execError) {
            // console.error('执行ipatool search命令时出错:', execError);

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

            return sendError(res, 500, {
                message: '搜索时发生错误',
                errorMessageCode: 'APP_SEARCH_ERROR',
                error: execError.message || '执行命令失败',
                errorCode: 'APP_SEARCH_EXEC_FAILED',
            });
        }

    } catch (error) {
        // console.error('搜索错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = searchHandler;
