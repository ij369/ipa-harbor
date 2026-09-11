const { getTaskManager } = require('./taskManager');
const ProgressParser = require('../../utils/progressParser');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 获取任务列表
 */
async function tasksHandler(req, res) {
    try {
        const taskManager = getTaskManager();
        const tasks = taskManager.getTasks();

        // 使用公共方法处理任务分组和进度信息
        const { groupedTasks, summary } = ProgressParser.processTasksWithProgress(tasks, taskManager.progressTexts);

        return sendSuccess(res, {
            message: '获取任务列表成功',
            errorMessageCode: 'DL_TASKS_LIST_SUCCESS',
            data: {
                ...groupedTasks,
                summary
            }
        });

    } catch (error) {
        console.error('获取任务列表错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = tasksHandler;
