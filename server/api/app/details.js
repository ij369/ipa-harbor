const https = require('https');
const { exec } = require('child_process');
const path = require('path');

// ipatool二进制文件路径
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

/**
 * 执行ipatool命令获取用户信息
 */
function executeIpatool(command) {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                try {
                    const result = JSON.parse(stdout);
                    resolve({ success: true, data: result });
                } catch (parseError) {
                    resolve({ success: true, rawOutput: stdout });
                }
            }
        });
    });
}

/**
 * 获取应用详情
 */
async function detailsHandler(req, res) {
    try {
        const { ids, lang = 'zh-CN' } = req.body;
        // 参数验证
        if (!ids) {
            return res.status(400).json({
                success: false,
                message: '应用ID列表是必需的参数',
                error: '请在请求体中提供ids数组'
            });
        }

        // 处理ID数组
        let idArray;
        if (Array.isArray(ids)) {
            idArray = ids;
        } else {
            return res.status(400).json({
                success: false,
                message: 'ID参数格式错误',
                error: 'ids必须是数组格式'
            });
        }

        if (idArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: '至少需要提供一个应用ID',
                error: 'ids数组不能为空'
            });
        }

        // 获取用户设置的地区（通过 ipatool 获取当前用户邮箱）
        let userRegion = null;
        try {
            const infoCommand = `"${IPATOOL_PATH}" auth info --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;
            const infoResult = await executeIpatool(infoCommand);
            if (infoResult.success && infoResult.data?.email) {
                userRegion = global.userRegions?.get(infoResult.data.email);
            }
        } catch (error) {
        }

        // 构建iTunes API URL，支持地区参数
        let itunesUrl;
        if (userRegion) {
            itunesUrl = `https://itunes.apple.com/${userRegion}/lookup?id=${idArray.join(',')}&lang=${lang}&entity=software`;
        } else {
            itunesUrl = `https://itunes.apple.com/lookup?id=${idArray.join(',')}&lang=${lang}&entity=software`;
        }

        console.log(`调用iTunes API: ${itunesUrl}`);

        try {
            const itunesResponse = await makeHttpsRequest(itunesUrl);
            const data = JSON.parse(itunesResponse);

            if (data && data.results) {
                return res.json({
                    success: true,
                    message: '获取应用详情成功',
                    data: data.results
                });
            } else {
                return res.status(404).json({
                    success: false,
                    message: '未找到应用详情',
                    error: '指定的应用ID可能不存在'
                });
            }
        } catch (apiError) {
            console.error('调用iTunes API时出错:', apiError);
            return res.status(500).json({
                success: false,
                message: '获取应用详情时发生错误',
                error: apiError.message || '调用iTunes API失败'
            });
        }

    } catch (error) {
        console.error('应用详情错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

/**
 * 发起HTTPS请求的辅助函数
 * @param {string} url - 请求URL
 * @returns {Promise<string>} 返回响应数据
 */
function makeHttpsRequest(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                if (response.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }
            });
        });

        request.on('error', (error) => {
            reject(error);
        });

        request.setTimeout(10000, () => {
            request.destroy();
            reject(new Error('请求超时'));
        });
    });
}

module.exports = detailsHandler;
