const { exec } = require('child_process');
const path = require('path');

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
            return res.status(400).json({
                success: false,
                message: '搜索关键词是必需的参数',
                error: '请在查询参数中提供keyword'
            });
        }

        const parsedLimit = isNaN(limit) ? 10 : parseInt(limit); // 如果limit不是数字，则默认为10

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

        // 构建ipatool search命令
        const command = `"${IPATOOL_PATH}" search "${keyword}" --limit ${parsedLimit} --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log(`执行搜索命令: ${command}`);

        try {
            const result = await executeIpatool(command);

            if (result.success) {
                return res.json({
                    success: true,
                    message: '搜索成功',
                    keyword: keyword,
                    data: result.data || result.rawOutput
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: '搜索失败',
                    error: result.error
                });
            }
        } catch (execError) {
            // console.error('执行ipatool search命令时出错:', execError);

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

            return res.status(500).json({
                success: false,
                message: '搜索时发生错误',
                error: execError.message || '执行命令失败'
            });
        }

    } catch (error) {
        // console.error('搜索错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = searchHandler;
