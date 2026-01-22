/**
 * 设置用户地区
 */

const { exec } = require('child_process');
const path = require('path');

// ipatool二进制文件路径
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

// 全局内存存储用户地区映射 { email: region }
global.userRegions = global.userRegions || new Map();

/**
 * 执行ipatool命令获取用户信息
 */
function getUserInfo() {
    return new Promise((resolve, reject) => {
        const command = `"${IPATOOL_PATH}" auth info --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;

        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error('Not authenticated'));
            } else {
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (parseError) {
                    reject(new Error('Failed to parse user info'));
                }
            }
        });
    });
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed'
        });
    }

    try {
        // 从 ipatool 获取当前登录用户信息
        let userInfo;
        try {
            userInfo = await getUserInfo();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!userInfo || !userInfo.email) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const { region } = req.body;

        // 如果 region 为空字符串或 null，则删除该用户的地区设置
        if (!region) {
            global.userRegions.delete(userInfo.email);
            // 返回完整的用户信息（和 info 接口一样）
            userInfo.region = null;
            return res.json({
                success: true,
                message: 'Region cleared',
                data: userInfo
            });
        }

        // 验证 region 格式（2位小写字母）
        if (!/^[a-z]{2}$/.test(region)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid region code format'
            });
        }

        // 保存到内存
        global.userRegions.set(userInfo.email, region);

        // 返回完整的用户信息（和 info 接口一样）
        userInfo.region = region;
        return res.json({
            success: true,
            message: 'Region updated successfully',
            data: userInfo
        });

    } catch (error) {
        console.error('设置用户地区失败:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to set user region'
        });
    }
}

module.exports = handler;
