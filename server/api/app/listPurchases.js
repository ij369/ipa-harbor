const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { execIpatool } = require('../../utils/ipatoolExec');

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
 * 获取已购项目列表
 */
async function listPurchasesHandler(req, res) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const maxResults = Math.min(Math.max(parseInt(req.query.maxResults, 10) || 50, 1), 100);

        try {
            const result = await executeIpatool([
                'list-purchases',
                '--page', String(page),
                '--max-results', String(maxResults),
            ]);

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
                    message: '当前 ipatool 不支持 list-purchases。请升级至 v2.6.0+（./scripts/dl_latest.sh 拉取官方 release，或从 GitHub releases 下载 macOS 二进制到 server/bin/ipatool）',
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
