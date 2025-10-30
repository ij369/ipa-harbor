const { exec } = require('child_process');
const path = require('path');
const https = require('https');

// ipatool二进制文件路径
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

/**
 * 执行ipatool命令的通用函数（带重试机制）
 * @param {string} command - 要执行的命令
 * @param {number} maxRetries - 最大重试次数，默认为2
 * @param {number} currentAttempt - 当前尝试次数，默认为1
 * @returns {Promise} 返回Promise对象
 */
function executeIpatool(command, maxRetries = 2, currentAttempt = 1) {
    return new Promise((resolve, reject) => {
        // console.log(`[DEBUG] 执行ipatool命令 (尝试 ${currentAttempt}/${maxRetries + 1}): ${command}`);

        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                const errorInfo = {
                    success: false,
                    error: error.message,
                    stderr: stderr,
                    stdout: stdout
                };

                // 检查是否包含特定错误类型
                const allOutput = stdout + stderr;

                // 检查是否是密码令牌过期错误
                if (allOutput.includes('password token is expired') || allOutput.includes('"error":"password token is expired"')) {
                    // console.log(`[DEBUG] 检测到password token is expired错误`);
                    reject({
                        success: false,
                        error: '密码令牌已过期，请重新登录',
                        errorType: 'TOKEN_EXPIRED',
                        stderr: stderr,
                        stdout: stdout
                    });
                    return;
                }

                // 检查是否是需要许可证的错误
                if (allOutput.includes('license is required') || allOutput.includes('"error":"license is required"')) {
                    // console.log(`[DEBUG] 检测到license is required错误`);
                    reject({
                        success: false,
                        error: '需要先领取该应用的许可证',
                        errorType: 'LICENSE_REQUIRED',
                        stderr: stderr,
                        stdout: stdout
                    });
                    return;
                }

                // 检查是否包含"An unknown error has occurred"错误
                const shouldRetry = (stderr.includes('An unknown error has occurred') ||
                    stdout.includes('An unknown error has occurred')) &&
                    currentAttempt <= maxRetries;

                if (shouldRetry) {
                    // console.log(`[DEBUG] 检测到"An unknown error has occurred"错误，准备重试 (${currentAttempt}/${maxRetries})`);
                    // console.log(`[DEBUG] 错误详情 - stdout: ${stdout}`);
                    // console.log(`[DEBUG] 错误详情 - stderr: ${stderr}`);

                    // 延迟1秒后重试
                    setTimeout(() => {
                        executeIpatool(command, maxRetries, currentAttempt + 1)
                            .then(resolve)
                            .catch(reject);
                    }, 1000);
                } else {
                    // console.log(`[DEBUG] 命令执行失败，不符合重试条件或已达到最大重试次数`);
                    reject(errorInfo);
                }
            } else {
                try {
                    // 尝试解析JSON输出
                    const result = JSON.parse(stdout);
                    // console.log(`[DEBUG] 命令执行成功 (尝试 ${currentAttempt})`);
                    resolve({
                        success: true,
                        data: result
                    });
                } catch (parseError) {
                    // 如果不是JSON格式，返回原始输出
                    // console.log(`[DEBUG] 命令执行成功，返回原始输出 (尝试 ${currentAttempt})`);
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
        const { useThirdPartyApi } = req.query;
        // 参数验证
        if (!appId) {
            return res.status(400).json({
                success: false,
                message: 'App ID是必需的参数',
                error: '请在URL路径中提供appId'
            });
        }

        // 构建ipatool list-versions命令
        const command = `"${IPATOOL_PATH}" list-versions -i "${appId}" --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log(`执行获取版本列表命令: ${command}`);

        try {
            // 根据参数决定使用哪种数据源
            if (useThirdPartyApi === 'true') {
                // console.log(`[DEBUG] 使用第三方API获取应用 ${appId} 的版本列表`);

                // 只请求第三方API
                const versionHistory = await fetchVersionHistory(appId);

                if (versionHistory && versionHistory.length > 0) {
                    // 将第三方API数据转换为标准格式
                    const versionObjects = versionHistory.map(item => ({
                        versionId: item.external_identifier.toString(),
                        bundleVersion: item.bundle_version || '未知',
                        releaseDate: item.created_at || null
                    }));

                    // 构建响应数据结构
                    const responseData = {
                        externalVersionIdentifiers: versionObjects
                    };

                    return res.json({
                        success: true,
                        message: '获取版本列表成功（第三方API）',
                        appId: appId,
                        data: responseData,
                        source: 'third-party'
                    });
                } else {
                    return res.status(404).json({
                        success: false,
                        message: '第三方API未找到该应用的版本信息',
                        error: '未找到版本数据'
                    });
                }
            } else {
                // console.log(`[DEBUG] 使用ipatool获取应用 ${appId} 的版本列表`);

                // 同时请求ipatool和第三方API（原有逻辑）
                const [ipatoolResult, versionHistory] = await Promise.all([
                    executeIpatool(command),
                    fetchVersionHistory(appId)
                ]);

                if (ipatoolResult.success) {
                    // 获取版本ID数组 然好反转数组
                    const externalVersionIdentifiers = ipatoolResult.data.externalVersionIdentifiers?.reverse() || [];

                    // 创建版本历史映射表
                    const historyMap = new Map();
                    versionHistory.forEach(item => {
                        historyMap.set(item.external_identifier, {
                            bundleVersion: item.bundle_version,
                            releaseDate: item.created_at
                        });
                    });

                    // 合并数据，将版本ID数组转换为版本对象数组
                    const versionObjects = externalVersionIdentifiers.map(versionId => {
                        const historyInfo = historyMap.get(parseInt(versionId));
                        return {
                            versionId: versionId,
                            bundleVersion: historyInfo ? historyInfo.bundleVersion : '未知',
                            releaseDate: historyInfo ? historyInfo.releaseDate : null
                        };
                    });

                    // 返回修改后的数据结构
                    const responseData = {
                        ...ipatoolResult.data,
                        externalVersionIdentifiers: versionObjects
                    };

                    return res.json({
                        success: true,
                        message: '获取版本列表成功',
                        appId: appId,
                        data: responseData,
                        source: 'ipatool'
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        message: '获取版本列表失败',
                        error: ipatoolResult.error
                    });
                }
            }
        } catch (execError) {
            // console.error('执行ipatool list-versions命令时出错:', execError);

            // 检查是否是密码令牌过期错误
            if (execError.errorType === 'TOKEN_EXPIRED') {
                return res.status(401).json({
                    success: false,
                    message: '密码令牌已过期，请重新登录',
                    error: execError.error,
                    errorType: 'TOKEN_EXPIRED'
                });
            }

            // 检查是否是许可证相关错误
            if (execError.errorType === 'LICENSE_REQUIRED') {
                return res.status(403).json({
                    success: false,
                    message: '需要先领取该应用的许可证',
                    error: execError.error,
                    errorType: 'LICENSE_REQUIRED'
                });
            }

            // 检查是否是认证相关错误
            if (execError.stdout && (
                execError.stdout.includes('failed to get account')
            )) {
                return res.status(401).json({
                    success: false,
                    message: '用户未登录或认证信息已过期',
                    error: '请先登录'
                });
            }

            // 检查是否是App ID不存在的错误
            if (execError.stderr && (
                execError.stderr.includes('not found') ||
                execError.stderr.includes('找不到') ||
                execError.stderr.includes('invalid')
            )) {
                return res.status(404).json({
                    success: false,
                    message: '找不到指定的App',
                    error: 'App ID不存在或无效'
                });
            }

            return res.status(500).json({
                success: false,
                message: '获取版本列表时发生错误',
                error: execError.message || '执行命令失败'
            });
        }

    } catch (error) {
        // console.error('版本列表错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
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
        // 构建ipatool list-versions命令
        const command = `"${IPATOOL_PATH}" list-versions -i "${appId}" --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log(`[DEBUG] 获取最新版本ID命令: ${command}`);

        const ipatoolResult = await executeIpatool(command);

        if (ipatoolResult.success && ipatoolResult.data) {
            // 获取版本ID数组并反转（最新的在最后）
            const externalVersionIdentifiers = ipatoolResult.data.externalVersionIdentifiers?.reverse() || [];

            if (externalVersionIdentifiers.length > 0) {
                const latestVersionId = externalVersionIdentifiers[0];
                // console.log(`[DEBUG] 应用 ${appId} 的最新版本ID: ${latestVersionId}`);
                return latestVersionId;
            } else {
                // console.log(`[DEBUG] 应用 ${appId} 没有找到版本信息`);
                return null;
            }
        } else {
            // console.log(`[DEBUG] 获取应用 ${appId} 版本信息失败:`, ipatoolResult.error);
            return null;
        }
    } catch (error) {
        // console.error(`获取应用 ${appId} 最新版本ID失败:`, error);
        return null;
    }
}

module.exports = { versionsHandler, getLatestVersionId };
