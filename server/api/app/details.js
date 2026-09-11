const https = require('https');
const path = require('path');
const { normalizeItunesLang } = require('../../utils/itunesLang');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

// ipatool二进制文件路径
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');

/**
 * 获取应用详情
 */
async function detailsHandler(req, res) {
    try {
        const { ids } = req.body;
        const lang = normalizeItunesLang(req.query.lang || req.body.lang || 'en-US');

        if (!ids) {
            return sendError(res, 400, {
                message: '应用ID列表是必需的参数',
                errorMessageCode: 'APP_DETAILS_IDS_REQUIRED',
                error: '请在请求体中提供ids数组',
                errorCode: 'APP_DETAILS_IDS_MISSING_IN_BODY',
            });
        }

        let idArray;
        if (Array.isArray(ids)) {
            idArray = ids;
        } else {
            return sendError(res, 400, {
                message: 'ID参数格式错误',
                errorMessageCode: 'APP_DETAILS_IDS_INVALID_FORMAT',
                error: 'ids必须是数组格式',
                errorCode: 'APP_DETAILS_IDS_MUST_BE_ARRAY',
            });
        }

        if (idArray.length === 0) {
            return sendError(res, 400, {
                message: '至少需要提供一个应用ID',
                errorMessageCode: 'APP_DETAILS_IDS_EMPTY',
                error: 'ids数组不能为空',
                errorCode: 'APP_DETAILS_IDS_ARRAY_EMPTY',
            });
        }

        const { getEffectiveRegion } = require('../../utils/userRegion');
        const userRegion = await getEffectiveRegion();

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

            if (data?.results?.length > 0) {
                return sendSuccess(res, {
                    message: '获取应用详情成功',
                    errorMessageCode: 'APP_DETAILS_FETCH_SUCCESS',
                    data: data.results,
                });
            }

            return sendError(res, 404, {
                message: '未找到应用详情',
                errorMessageCode: 'APP_DETAILS_NOT_FOUND',
                error: '指定的应用ID可能不存在',
                errorCode: 'APP_DETAILS_IDS_NOT_FOUND',
            });
        } catch (apiError) {
            console.error('调用iTunes API时出错:', apiError);
            return sendError(res, 500, {
                message: '获取应用详情时发生错误',
                errorMessageCode: 'APP_DETAILS_FETCH_FAILED',
                error: apiError.message || '调用iTunes API失败',
                errorCode: 'APP_DETAILS_ITUNES_API_FAILED',
            });
        }
    } catch (error) {
        console.error('应用详情错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

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
