const { enrichUserData } = require('../../utils/userRegion');
const { parseIpatoolOutput } = require('../../utils/ipatoolOutput');
const { clearIpatoolAccountCache } = require('../../utils/ipatoolAccount');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { IPATOOL_PATH, execIpatool } = require('../../utils/ipatoolExec');

/** 首次登录可能较慢（SAP 初始化），适当延长超时 */
const LOGIN_TIMEOUT_MS = 600000;
const INFO_TIMEOUT_MS = 60000;

/**
 * 执行 ipatool 命令并解析 JSON 输出
 * @param {string[]} args - ipatool 子命令参数
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @returns {Promise} 返回Promise对象
 */
async function executeIpatool(args, timeoutMs = INFO_TIMEOUT_MS) {
    const { error, stdout, stderr } = await execIpatool(args, { timeout: timeoutMs });
    const parsed = parseIpatoolOutput(stdout, stderr);

    if (parsed.needsTwoFactor) {
        return {
            success: false,
            needsTwoFactor: true,
            message: parsed.message || '需要二次验证码',
            rawOutput: parsed.rawOutput,
        };
    }

    if (parsed.success && parsed.data) {
        return {
            success: true,
            data: parsed.data,
        };
    }

    const rawError = parsed.error || error?.message || stderr?.trim() || '执行命令失败';

    throw {
        success: false,
        error: rawError,
        knownError: parsed.knownError || null,
        stderr,
        stdout,
        rawOutput: parsed.rawOutput,
    };
}

/** 附带 errorMessageCode 供前端 i18n；同时保留原文，无翻译时前端透传 */
function sendIpatoolError(res, statusCode, rawError, knownError = null) {
    const payload = {
        message: rawError,
        error: rawError,
    };
    if (knownError) {
        payload.errorMessageCode = knownError.errorMessageCode;
        payload.errorCode = knownError.errorCode;
    }
    return sendError(res, statusCode, payload);
}

/**
 * 登录
 */
async function loginHandler(req, res) {
    try {
        const { email, password, twoFactor } = req.body;

        // 参数验证
        if (!email || !password) {
            return sendError(res, 400, {
                message: '邮箱和密码是必需的参数',
                errorMessageCode: 'AUTH_LOGIN_PARAMS_REQUIRED',
                error: 'Bad Request',
                errorCode: 'AUTH_LOGIN_EMAIL_PASSWORD_MISSING',
            });
        }

        const loginArgs = ['auth', 'login', '-e', email, '-p', password];
        if (twoFactor) {
            loginArgs.push('--auth-code', twoFactor);
        }

        console.log(`执行登录命令: ${IPATOOL_PATH} auth login -e ${email} -p ***${twoFactor ? ' --auth-code ***' : ''}`);

        try {
            const result = await executeIpatool(loginArgs, LOGIN_TIMEOUT_MS);

            if (result.needsTwoFactor) {
                return sendError(res, 200, {
                    message: '请求错误 / 请输入二次验证码',
                    errorMessageCode: 'AUTH_LOGIN_TWO_FACTOR_REQUIRED',
                    error: '需要输入二次验证码',
                    errorCode: 'AUTH_LOGIN_TWO_FACTOR_DETAIL',
                    needsTwoFactor: true,
                });
            }

            if (!result.success || !result.data?.email) {
                return sendError(res, 401, {
                    message: '登录失败',
                    errorMessageCode: 'AUTH_LOGIN_FAILED',
                    error: result.error || '未能获取账号信息',
                    errorCode: 'AUTH_LOGIN_NO_ACCOUNT_INFO',
                });
            }

            clearIpatoolAccountCache();

            try {
                const infoResult = await executeIpatool(['auth', 'info'], INFO_TIMEOUT_MS);

                if (infoResult.success && infoResult.data?.email) {
                    const userData = await enrichUserData(infoResult.data);
                    return sendSuccess(res, {
                        message: '登录成功',
                        errorMessageCode: 'AUTH_LOGIN_SUCCESS',
                        data: userData
                    });
                }
            } catch (infoError) {
                console.error('登录后获取用户信息失败:', infoError?.error || infoError?.message);
            }

            // ipatool 已登录但 info 暂时不可用，使用 login 输出中的账号信息
            const userData = await enrichUserData(result.data);
            if (userData.email) {
                return sendSuccess(res, {
                    message: '登录成功',
                    errorMessageCode: 'AUTH_LOGIN_SUCCESS',
                    data: userData
                });
            }

            return sendError(res, 401, {
                message: '登录失败，未能获取用户信息',
                errorMessageCode: 'AUTH_LOGIN_FAILED',
                error: '无法获取用户信息',
                errorCode: 'AUTH_LOGIN_NO_USER_INFO',
            });
        } catch (execError) {
            console.error(
                '执行ipatool命令时出错:',
                execError?.stderr || execError?.stdout || execError?.error
            );

            const combinedOutput = `${execError.stdout || ''}\n${execError.stderr || ''}`;
            if (!twoFactor && combinedOutput.includes('2FA code is required')) {
                return sendError(res, 200, {
                    message: '请求错误 / 请输入二次验证码',
                    errorMessageCode: 'AUTH_LOGIN_TWO_FACTOR_REQUIRED',
                    error: '需要输入二次验证码',
                    errorCode: 'AUTH_LOGIN_TWO_FACTOR_DETAIL',
                    needsTwoFactor: true,
                });
            }

            const statusCode = twoFactor ? 401 : 500;
            return sendIpatoolError(res, statusCode, execError.error, execError.knownError);
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

module.exports = loginHandler;
