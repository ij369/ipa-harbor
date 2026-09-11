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

    throw {
        success: false,
        error: parsed.error || error?.message || '执行命令失败',
        stderr,
        stdout,
        rawOutput: parsed.rawOutput,
    };
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
            if (combinedOutput.includes('Could not allocate dynamic translator buffer')) {
                return sendError(res, 500, {
                    message: '服务器内存不足，无法完成 Apple ID 首次认证。请为宿主机增加内存或配置至少 2GB swap 后重试',
                    errorMessageCode: 'AUTH_LOGIN_INSUFFICIENT_MEMORY',
                    error: execError.error || 'ipatool 认证引擎初始化失败',
                    errorCode: 'AUTH_LOGIN_TRANSLATOR_BUFFER_FAILED',
                });
            }
            if (!twoFactor && combinedOutput.includes('2FA code is required')) {
                return sendError(res, 200, {
                    message: '请求错误 / 请输入二次验证码',
                    errorMessageCode: 'AUTH_LOGIN_TWO_FACTOR_REQUIRED',
                    error: '需要输入二次验证码',
                    errorCode: 'AUTH_LOGIN_TWO_FACTOR_DETAIL',
                    needsTwoFactor: true,
                });
            }

            if (twoFactor) {
                return sendError(res, 401, {
                    message: '登录失败，请检查 Apple ID、密码或二次验证码',
                    errorMessageCode: 'AUTH_LOGIN_FAILED',
                    error: execError.error || execError.stderr?.trim() || execError.stdout?.trim() || '认证失败',
                    errorCode: 'AUTH_LOGIN_TWO_FACTOR_OR_CREDENTIALS_INVALID',
                });
            }

            return sendError(res, 500, {
                message: execError?.error || execError?.stdout || 'APPLE ID 登录过程中发生错误',
                errorMessageCode: 'AUTH_LOGIN_ERROR',
                error: execError.error || '执行命令失败',
                errorCode: 'AUTH_LOGIN_EXEC_FAILED',
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

module.exports = loginHandler;
