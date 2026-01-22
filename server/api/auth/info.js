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
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
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
 * 获取认证信息
 */
async function infoHandler(req, res) {
    try {
        // 构建ipatool info命令
        const command = `"${IPATOOL_PATH}" auth info --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        // console.log('执行获取认证信息命令');

        try {
            const result = await executeIpatool(command);

            if (result.success) {
                const userData = result.data || result.rawOutput;

                // 如果有用户邮箱，尝试从全局 Map 中获取地区信息
                if (userData && userData.email) {
                    const userRegion = global.userRegions?.get(userData.email);
                    if (userRegion) {
                        userData.region = userRegion;
                    }
                }

                return res.json({
                    success: true,
                    message: '获取认证信息成功',
                    data: userData
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: '获取认证信息失败',
                    error: result.error
                });
            }
        } catch (execError) {
            // console.error('执行ipatool info命令时出错:', execError);

            // 检查是否是未登录的错误
            if (execError.stderr && (
                execError.stderr.includes('not logged in') ||
                execError.stderr.includes('未登录') ||
                execError.stderr.includes('authentication') ||
                execError.stderr.includes('keychain') ||
                execError.stderr.includes('The specified item could not be found in the keyring')
            )) {
                return res.status(401).json({
                    success: false,
                    message: '用户未登录或认证信息已过期',
                    error: '请先登录'
                });
            }

            return res.status(500).json({
                success: false,
                message: '获取认证信息时发生错误',
                error: execError.message || '执行命令失败'
            });
        }

    } catch (error) {
        // console.error('认证信息错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = infoHandler;
