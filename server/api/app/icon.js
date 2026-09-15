const https = require('https');
const { getEffectiveRegion } = require('../../utils/userRegion');
const { resolveSidecarIconUrl } = require('../../utils/sidecarIcon');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

// 1×1 透明 GIF
const ONE_PIXEL_GIF_BASE64 =
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function pickItunesArtworkUrl(app, size) {
    if (!app) {
        return null;
    }

    const sizeNum = parseInt(size, 10);
    switch (sizeNum) {
        case 60:
            return app.artworkUrl60 || null;
        case 100:
            return app.artworkUrl100 || null;
        case 512:
            return app.artworkUrl512 || null;
        default:
            return app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60 || null;
    }
}

function fetchItunesIconUrl(appId, userRegion, size) {
    return new Promise((resolve, reject) => {
        const lookupUrl = userRegion
            ? `https://itunes.apple.com/${userRegion}/lookup?id=${appId}`
            : `https://itunes.apple.com/lookup?id=${appId}`;

        https
            .get(lookupUrl, (response) => {
                let data = '';

                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(pickItunesArtworkUrl(json.results?.[0], size));
                    } catch (err) {
                        reject(err);
                    }
                });
            })
            .on('error', reject);
    });
}

async function resolveIconUrl({ appId, size, sidecarFile, userRegion }) {
    if (sidecarFile) {
        const sidecarUrl = await resolveSidecarIconUrl(sidecarFile, size);
        if (sidecarUrl) {
            return sidecarUrl;
        }
    }

    try {
        return await fetchItunesIconUrl(appId, userRegion, size);
    } catch (err) {
        console.warn(`iTunes 图标 lookup 失败 ${appId}:`, err.message);
        return null;
    }
}

function proxyRemoteImage(res, iconUrl) {
    https
        .get(iconUrl, (imgRes) => {
            if (imgRes.statusCode < 200 || imgRes.statusCode >= 300) {
                imgRes.resume();
                sendPlaceholder(res);
                return;
            }

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
}

/**
 * GET /icon/:appid?size=60&country=cn&file=324684580_889925843
 * 有 file 时优先 sidecar softwareIcon57x57URL，否则 iTunes Lookup；均无结果则 1×1 占位图
 */
const getAppIcon = async (req, res) => {
    const appId = req.params.appid;
    const { size = 100, country: queryCountry, file: sidecarFile } = req.query;

    if (!appId || !/^\d+$/.test(appId)) {
        return sendPlaceholder(res);
    }

    try {
        const userRegion = queryCountry || await getEffectiveRegion();
        const iconUrl = await resolveIconUrl({ appId, size, sidecarFile, userRegion });

        if (!iconUrl) {
            return sendPlaceholder(res);
        }

        proxyRemoteImage(res, iconUrl);
    } catch (err) {
        console.error('Error resolving app icon:', err);
        sendPlaceholder(res);
    }
};

const getAppIconUrl = async (req, res) => {
    const appId = req.params.appid;
    const size = req.params.size;
    const { country: queryCountry, file: sidecarFile } = req.query;

    try {
        const userRegion = queryCountry || await getEffectiveRegion();
        const iconUrl = await resolveIconUrl({ appId, size, sidecarFile, userRegion });

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
        console.error('获取应用图标 URL 失败:', err);
        return sendError(res, 500, {
            message: '获取应用图标失败',
            errorMessageCode: 'APP_ICON_URL_REQUEST_FAILED',
            error: err.message || 'iTunes lookup 失败',
            errorCode: 'APP_ICON_URL_ITUNES_REQUEST_FAILED',
        });
    }
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
