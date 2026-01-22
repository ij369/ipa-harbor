const https = require('https');
const { exec } = require('child_process');
const path = require('path');

// ipatool二进制文件路径
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

// 1×1 透明 GIF
const ONE_PIXEL_GIF_BASE64 =
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

/**
 * 获取当前用户的地区设置
 */
async function getUserRegion() {
    return new Promise((resolve) => {
        const command = `"${IPATOOL_PATH}" auth info --keychain-passphrase "${KEYCHAIN_PASSPHRASE}" --non-interactive --format "json"`;
        
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                resolve(null);
            } else {
                try {
                    const result = JSON.parse(stdout);
                    if (result.email) {
                        const region = global.userRegions?.get(result.email);
                        resolve(region || null);
                    } else {
                        resolve(null);
                    }
                } catch (parseError) {
                    resolve(null);
                }
            }
        });
    });
}

/**
 * GET /icon/:appid?size=60
 * 从 iTunes Lookup API 获取 App 图标（找不到则返回 1×1 占位图）
 */
const getAppIcon = async (req, res) => {
    const appId = req.params.appid;
    const { size = 100 } = req.query;

    // 参数校验
    if (!appId || !/^\d+$/.test(appId)) {
        return sendPlaceholder(res);
    }

    // 获取用户地区设置
    const userRegion = await getUserRegion();
    
    let lookupUrl;
    if (userRegion) {
        lookupUrl = `https://itunes.apple.com/${userRegion}/lookup?id=${appId}`;
    } else {
        lookupUrl = `https://itunes.apple.com/lookup?id=${appId}`;
    }

    https
        .get(lookupUrl, (response) => {
            let data = '';

            response.on('data', (chunk) => (data += chunk));
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const app = json.results?.[0];
                    let iconUrl;
                    switch (size) {
                        case 60:
                            iconUrl = app?.artworkUrl60;
                            break;
                        case 100:
                            iconUrl = app?.artworkUrl100;
                            break;
                        case 512:
                            iconUrl = app?.artworkUrl512;
                            break;

                        default:
                            iconUrl =
                                app?.artworkUrl512 ||
                                app?.artworkUrl100 ||
                                app?.artworkUrl60;
                            break;
                    }

                    if (!iconUrl) {
                        return sendPlaceholder(res);
                    }

                    // 代理请求图标
                    https
                        .get(iconUrl, (imgRes) => {
                            // 设置响应头
                            res.writeHead(imgRes.statusCode, {
                                'Content-Type': imgRes.headers['content-type'] || 'image/png',
                                'Cache-Control': 'public, max-age=86400', // 缓存一天
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                                'Cross-Origin-Resource-Policy': 'cross-origin',
                                'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
                            });

                            // 流式传输图像数据
                            imgRes.pipe(res);
                        })
                        .on('error', (err) => {
                            console.error('Error fetching icon:', err);
                            sendPlaceholder(res);
                        });

                } catch (err) {
                    console.error('Error parsing iTunes response:', err);
                    sendPlaceholder(res);
                }
            });
        })
        .on('error', (err) => {
            console.error('HTTPS request failed:', err);
            sendPlaceholder(res);
        });
};

// 获取原始应用图标的URL
const getAppIconUrl = async (req, res) => {
    const appId = req.params.appid;
    const size = req.params.size;
    
    // 获取用户地区设置
    const userRegion = await getUserRegion();
    
    let lookupUrl;
    if (userRegion) {
        lookupUrl = `https://itunes.apple.com/${userRegion}/lookup?id=${appId}`;
    } else {
        lookupUrl = `https://itunes.apple.com/lookup?id=${appId}`;
    }
    https
        .get(lookupUrl, (response) => {
            let data = '';

            response.on('data', (chunk) => (data += chunk));
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const app = json.results?.[0];
                    let iconUrl;
                    switch (size) {
                        case '60':
                            iconUrl = app?.artworkUrl60;
                            break;
                        case '100':
                            iconUrl = app?.artworkUrl100;
                            break;
                        case '512':
                            iconUrl = app?.artworkUrl512;
                            break;

                        default:
                            iconUrl =
                                app?.artworkUrl512 ||
                                app?.artworkUrl100 ||
                                app?.artworkUrl60;
                            break;
                    }

                    if (!iconUrl) {
                        return res.status(404).json({ error: 'Icon URL not found' });
                    }
                    res.json({ iconUrl });
                } catch (err) {
                    console.error('Error parsing iTunes response:', err);
                    res.status(500).json({ error: 'Error parsing iTunes response' });
                }
            });
        })
        .on('error', (err) => {
            console.error('HTTPS request failed:', err);
            res.status(500).json({ error: 'HTTPS request failed' });
        });
};

/**
 * 返回 1×1 GIF 占位图
 */
function sendPlaceholder(res) {
    const imgBuffer = Buffer.from(ONE_PIXEL_GIF_BASE64, 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': imgBuffer.length,
        'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    });
    res.end(imgBuffer);
}

module.exports = { getAppIcon, getAppIconUrl, };
