const https = require('https');
const { ensureVersionMetadataCached, upsertVersionMetadataRecord } = require('../../utils/versionMetadata');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const {
    parseIpatoolJsonLines,
    extractErrorFromLines,
    extractListVersionsFromLines,
} = require('../../utils/ipatoolOutput');
const { execIpatool } = require('../../utils/ipatoolExec');

/**
 * 执行ipatool命令的通用函数（带重试机制）
 * @param {string[]} args - ipatool 子命令参数
 * @param {number} maxRetries - 最大重试次数，默认为2
 * @param {number} currentAttempt - 当前尝试次数，默认为1
 * @returns {Promise} 返回Promise对象
 */
function classifyIpatoolOutput(allOutput) {
    if (allOutput.includes('password token is expired') || allOutput.includes('"error":"password token is expired"')) {
        return {
            error: '密码令牌已过期，请重新登录',
            errorType: 'TOKEN_EXPIRED',
        };
    }

    if (allOutput.includes('license is required') || allOutput.includes('"error":"license is required"')) {
        return {
            error: '需要先领取该应用的许可证',
            errorType: 'LICENSE_REQUIRED',
        };
    }

    return null;
}

async function executeIpatool(args, maxRetries = 2, currentAttempt = 1) {
    const { error, stdout, stderr } = await execIpatool(args, { timeout: 30000 });
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    const lines = parseIpatoolJsonLines(combined);
    const classified = classifyIpatoolOutput(combined);

    if (classified) {
        throw {
            success: false,
            ...classified,
            stderr,
            stdout,
        };
    }

    const versionData = extractListVersionsFromLines(lines);
    if (versionData) {
        return {
            success: true,
            data: versionData,
        };
    }

    const ipatoolError = extractErrorFromLines(lines);
    if (ipatoolError) {
        throw {
            success: false,
            error: ipatoolError,
            stderr,
            stdout,
        };
    }

    const shouldRetry = combined.includes('An unknown error has occurred') && currentAttempt <= maxRetries;
    if (shouldRetry) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return executeIpatool(args, maxRetries, currentAttempt + 1);
    }

    if (error) {
        throw {
            success: false,
            error: error.message || '执行命令失败',
            stderr,
            stdout,
        };
    }

    throw {
        success: false,
        error: '未能解析 ipatool 响应',
        stderr,
        stdout,
    };
}

async function buildThirdPartyVersionResponse(appId) {
    const versionHistory = await fetchVersionHistory(appId);
    if (!versionHistory || versionHistory.length === 0) {
        return null;
    }

    const versionObjects = versionHistory.map((item) => ({
        versionId: item.external_identifier.toString(),
        bundleVersion: item.bundle_version && item.bundle_version !== '未知' ? item.bundle_version : null,
        releaseDate: item.created_at || null,
    }));

    await Promise.all(versionObjects.map(async (versionObj) => {
        if (!versionObj.releaseDate) {
            return;
        }

        await upsertVersionMetadataRecord({
            appId,
            versionId: versionObj.versionId,
            displayVersion: versionObj.bundleVersion,
            releaseDate: versionObj.releaseDate,
            appleMetadata: {
                externalVersionID: versionObj.versionId,
                displayVersion: versionObj.bundleVersion,
                releaseDate: versionObj.releaseDate,
                source: 'third-party',
            },
        });
    }));

    return {
        externalVersionIdentifiers: versionObjects,
    };
}

async function respondWithThirdPartyVersions(res, appId, source) {
    const responseData = await buildThirdPartyVersionResponse(appId);
    if (!responseData) {
        return false;
    }

    sendSuccess(res, {
        message: source === 'third-party'
            ? '获取版本列表成功（第三方API）'
            : '获取版本列表成功（第三方API 回退）',
        errorMessageCode: source === 'third-party'
            ? 'APP_VERSIONS_FETCH_SUCCESS_THIRD_PARTY'
            : 'APP_VERSIONS_FETCH_SUCCESS_THIRD_PARTY_FALLBACK',
        appId,
        data: responseData,
        source,
    });
    return true;
}

/**
 * 请求第三方版本历史API
 * @param {string} appId - 应用ID
 * @returns {Promise} 返回Promise对象
 */
function fetchVersionHistory(appId) {
    return new Promise((resolve, reject) => {
        const url = `https://apis.bilin.eu.org/history/${appId}`;

        const request = https.get(url, { timeout: 10000 }, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    if (response.statusCode === 200) {
                        const result = JSON.parse(data);
                        if (result.code === 200 && result.data) {
                            resolve(result.data);
                        } else {
                            resolve([]);
                        }
                    } else {
                        resolve([]);
                    }
                } catch (parseError) {
                    // console.error('解析第三方API响应失败:', parseError);
                    resolve([]);
                }
            });
        });

        request.on('error', (error) => {
            // console.error('第三方API请求失败:', error);
            resolve([]);
        });

        request.on('timeout', () => {
            // console.error('第三方API请求超时');
            request.destroy();
            resolve([]);
        });

        request.setTimeout(10000);
    });
}

/**
 * 获取App版本列表
 */
async function versionsHandler(req, res) {
    try {
        const { appId } = req.params;
        const { useThirdPartyApi, lang = 'en-US' } = req.query;
        // 参数验证
        if (!appId) {
            return sendError(res, 400, {
                message: 'App ID是必需的参数',
                errorMessageCode: 'APP_VERSIONS_APP_ID_REQUIRED',
                error: '请在URL路径中提供appId',
                errorCode: 'APP_VERSIONS_APP_ID_MISSING',
            });
        }

        const listVersionsArgs = ['list-versions', '-i', String(appId)];

        // console.log(`执行获取版本列表命令: list-versions -i ${appId}`);

        try {
            // 根据参数决定使用哪种数据源
            if (useThirdPartyApi === 'true') {
                if (await respondWithThirdPartyVersions(res, appId, 'third-party')) {
                    return undefined;
                }

                return sendError(res, 404, {
                    message: '第三方API未找到该应用的版本信息',
                    errorMessageCode: 'APP_VERSIONS_THIRD_PARTY_NOT_FOUND',
                    error: '未找到版本数据',
                    errorCode: 'APP_VERSIONS_NO_VERSION_DATA',
                });
            } else {
                // console.log(`[DEBUG] 使用ipatool获取应用 ${appId} 的版本列表`);

                // 同时请求ipatool和第三方API（原有逻辑）
                const ipatoolResult = await executeIpatool(listVersionsArgs);

                if (ipatoolResult.success) {
                    const externalVersionIdentifiers = ipatoolResult.data.externalVersionIdentifiers?.reverse() || [];
                    const versionObjects = await ensureVersionMetadataCached(
                        appId,
                        externalVersionIdentifiers,
                        { fetchMissing: false }
                    );

                    const responseData = {
                        ...ipatoolResult.data,
                        externalVersionIdentifiers: versionObjects
                    };

                    return sendSuccess(res, {
                        message: '获取版本列表成功',
                        errorMessageCode: 'APP_VERSIONS_FETCH_SUCCESS',
                        appId: appId,
                        data: responseData,
                        source: 'ipatool'
                    });
                } else {
                    return sendError(res, 500, {
                        message: '获取版本列表失败',
                        errorMessageCode: 'APP_VERSIONS_FETCH_FAILED',
                        error: ipatoolResult.error,
                        errorCode: 'APP_VERSIONS_EXEC_FAILED',
                    });
                }
            }
        } catch (execError) {
            if (useThirdPartyApi !== 'true' && await respondWithThirdPartyVersions(res, appId, 'third-party-fallback')) {
                return undefined;
            }

            // 检查是否是密码令牌过期错误
            if (execError.errorType === 'TOKEN_EXPIRED') {
                return sendError(res, 401, {
                    message: '密码令牌已过期，请重新登录',
                    errorMessageCode: 'AUTH_TOKEN_EXPIRED',
                    error: execError.error,
                    errorType: 'TOKEN_EXPIRED',
                    errorCode: 'AUTH_PASSWORD_TOKEN_EXPIRED',
                });
            }

            // 检查是否是许可证相关错误
            if (execError.errorType === 'LICENSE_REQUIRED') {
                return sendError(res, 403, {
                    message: '需要先领取该应用的许可证',
                    errorMessageCode: 'APP_VERSIONS_LICENSE_REQUIRED',
                    error: execError.error,
                    errorType: 'LICENSE_REQUIRED',
                    errorCode: 'APP_VERSIONS_LICENSE_REQUIRED_DETAIL',
                });
            }

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

            // 检查是否是App ID不存在的错误
            if (execError.stderr && (
                execError.stderr.includes('not found') ||
                execError.stderr.includes('找不到') ||
                execError.stderr.includes('invalid')
            )) {
                return sendError(res, 404, {
                    message: '找不到指定的App',
                    errorMessageCode: 'APP_VERSIONS_APP_NOT_FOUND',
                    error: 'App ID不存在或无效',
                    errorCode: 'APP_VERSIONS_APP_ID_INVALID',
                });
            }

            return sendError(res, 500, {
                message: '获取版本列表时发生错误',
                errorMessageCode: 'APP_VERSIONS_ERROR',
                error: execError.error || execError.message || '执行命令失败',
                errorCode: 'APP_VERSIONS_EXEC_FAILED',
            });
        }

    } catch (error) {
        // console.error('版本列表错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

/**
 * 获取应用最新版本ID的（仅用于内部调用）
 * @param {number} appId - 应用ID
 * @returns {Promise<string|null>} 返回最新版本ID或null
 */
async function getLatestVersionId(appId) {
    try {
        const ipatoolResult = await executeIpatool(['list-versions', '-i', String(appId)]);

        if (ipatoolResult.success && ipatoolResult.data) {
            const externalVersionIdentifiers = ipatoolResult.data.externalVersionIdentifiers?.slice().reverse() || [];

            if (externalVersionIdentifiers.length > 0) {
                return String(externalVersionIdentifiers[0]);
            }
        }
    } catch (error) {
        // ipatool 失败时尝试第三方 API
    }

    const thirdParty = await buildThirdPartyVersionResponse(appId);
    if (thirdParty?.externalVersionIdentifiers?.length) {
        return String(thirdParty.externalVersionIdentifiers[0].versionId);
    }

    return null;
}

module.exports = { versionsHandler, getLatestVersionId };
