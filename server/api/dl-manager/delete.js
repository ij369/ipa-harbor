const { getTaskManager } = require('./taskManager');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 删除任务
 */
async function deleteHandler(req, res) {
    try {
        const { taskId, fileName, clearAll } = req.body;

        const taskManager = getTaskManager();
        let result;

        // 如果是清空所有任务
        if (clearAll) {
            result = taskManager.clearAllTasks();

            if (result.success) {
                return sendSuccess(res, {
                    message: result.message,
                    errorMessageCode: 'DL_DELETE_CLEAR_ALL_SUCCESS',
                    data: {
                        cleared: true,
                        deletedCount: result.deletedCount
                    }
                });
            } else {
                return sendError(res, 400, {
                    message: result.message,
                    errorMessageCode: 'DL_DELETE_CLEAR_ALL_FAILED',
                    error: `清空所有任务失败: ${result.message}`,
                    errorCode: 'DL_DELETE_CLEAR_ALL_ERROR',
                });
            }
        }

        // 如果提供了fileName，按文件名删除
        if (fileName) {
            result = taskManager.deleteByFileName(fileName);

            if (result.success) {
                return sendSuccess(res, {
                    message: result.message,
                    errorMessageCode: 'DL_DELETE_BY_FILENAME_SUCCESS',
                    data: {
                        fileName: fileName,
                        deleted: true
                    }
                });
            } else {
                return sendError(res, 400, {
                    message: result.message,
                    errorMessageCode: 'DL_DELETE_BY_FILENAME_FAILED',
                    error: `按文件名删除失败: ${result.message}`,
                    errorCode: 'DL_DELETE_BY_FILENAME_ERROR',
                });
            }
        }

        // 如果提供了taskId，按任务ID删除
        if (taskId) {
            result = taskManager.deleteTask(taskId);

            if (result.success) {
                return sendSuccess(res, {
                    message: result.message,
                    errorMessageCode: 'DL_DELETE_BY_TASK_ID_SUCCESS',
                    data: {
                        taskId: taskId,
                        deleted: true
                    }
                });
            } else {
                return sendError(res, 400, {
                    message: result.message,
                    errorMessageCode: 'DL_DELETE_BY_TASK_ID_FAILED',
                    error: `删除任务失败: ${result.message}`,
                    errorCode: 'DL_DELETE_BY_TASK_ID_ERROR',
                });
            }
        }

        // 如果没有提供任何参数
        return sendError(res, 400, {
            message: '请提供taskId、fileName或clearAll参数',
            errorMessageCode: 'DL_DELETE_PARAMS_REQUIRED',
            error: '缺少必要参数',
            errorCode: 'DL_DELETE_PARAMS_MISSING',
        });

    } catch (error) {
        console.error('删除任务错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = deleteHandler;
