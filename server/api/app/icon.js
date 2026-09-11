const https = require('https');
const { getEffectiveRegion } = require('../../utils/userRegion');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

// 1×1 透明 GIF
const ONE_PIXEL_GIF_BASE64 =
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

/**
 * GET /icon/:appid?size=60
 * 从 iTunes Lookup API 获取 App 图标（找不到则返回 1×1 占位图）
 */
const getAppIcon = async (req, res) => {
    const appId = req.params.appid;
    const { size = 100, country: queryCountry } = req.query;

    if (!appId || !/^\d+$/.test(appId)) {
        return sendPlaceholder(res);
    }

    const userRegion = queryCountry || await getEffectiveRegion();
    
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
                    const sizeNum = parseInt(size, 10);
                    switch (sizeNum) {
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

                    https
                        .get(iconUrl, (imgRes) => {
                            res.writeHead(imgRes.statusCode, {
                                'Content-Type': imgRes.headers['content-type'] || 'image/png',
                                'Cache-Control': 'public, max-age=86400',
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                                'Cross-Origin-Resource-Policy': 'cross-origin',
                                'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
                            });

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

const getAppIconUrl = async (req, res) => {
    const appId = req.params.appid;
    const size = req.params.size;
    const userRegion = await getEffectiveRegion();
    
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
                        return sendError(res, 404, {
                            message: '未找到应用图标URL',
                            errorMessageCode: 'APP_ICON_URL_NOT_FOUND',
                            error: '指定应用可能没有图标',
                            errorCode: 'APP_ICON_URL_NOT_FOUND_DETAIL',
                        });
                    }
                    return sendSuccess(res, {
                        message: '获取图标URL成功',
                        errorMessageCode: 'APP_ICON_URL_FETCH_SUCCESS',
                        data: { iconUrl },
                    });
                } catch (err) {
                    console.error('解析iTunes响应失败:', err);
                    return sendError(res, 500, {
                        message: '解析iTunes响应失败',
                        errorMessageCode: 'APP_ICON_URL_PARSE_FAILED',
                        error: err.message || 'iTunes API 响应解析失败',
                        errorCode: 'APP_ICON_URL_PARSE_ERROR_DETAIL',
                    });
                }
            });
        })
        .on('error', (err) => {
            console.error('iTunes HTTPS请求失败:', err);
            return sendError(res, 500, {
                message: 'iTunes请求失败',
                errorMessageCode: 'APP_ICON_URL_REQUEST_FAILED',
                error: err.message || 'HTTPS 请求 iTunes 失败',
                errorCode: 'APP_ICON_URL_ITUNES_REQUEST_FAILED',
            });
        });
};

function sendPlaceholder(res) {
    const imgBuffer = Buffer.from(ONE_PIXEL_GIF_BASE64, 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': imgBuffer.length,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    });
    res.end(imgBuffer);
}

module.exports = { getAppIcon, getAppIconUrl, };
