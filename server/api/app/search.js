const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { execIpatool } = require('../../utils/ipatoolExec');

/**
 * 执行ipatool命令的通用函数
 * @param {string[]} args - ipatool 子命令参数
 * @returns {Promise} 返回Promise对象
 */
async function executeIpatool(args) {
    const { error, stdout, stderr } = await execIpatool(args, { timeout: 30000 });

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

        // console.log(`执行搜索命令: search ${keyword} --limit ${parsedLimit}`);

        try {
            const result = await executeIpatool([
                'search', keyword,
                '--limit', String(parsedLimit),
            ]);

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
