const { getTaskManager } = require('./taskManager');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 获取文件列表
 */
async function filesHandler(req, res) {
    try {
        const taskManager = getTaskManager();
        const files = await taskManager.getFiles();

        return sendSuccess(res, {
            message: '获取文件列表成功',
            errorMessageCode: 'DL_FILES_LIST_SUCCESS',
            data: {
                files: files,
                total: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0)
            }
        });

    } catch (error) {
        console.error('获取文件列表错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = filesHandler;
