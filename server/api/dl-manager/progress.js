const { getTaskManager } = require('./taskManager');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 获取实时进度
 */
async function progressHandler(req, res) {
    try {
        const taskManager = getTaskManager();
        const progress = taskManager.getProgress();

        return sendSuccess(res, {
            message: '获取进度信息成功',
            errorMessageCode: 'DL_PROGRESS_FETCH_SUCCESS',
            data: progress
        });

    } catch (error) {
        console.error('获取进度信息错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = progressHandler;
