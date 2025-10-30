const { getTaskManager } = require('./taskManager');
const ProgressParser = require('../../utils/progressParser');

/**
 * 获取任务列表
 */
async function tasksHandler(req, res) {
    try {
        const taskManager = getTaskManager();
        const tasks = taskManager.getTasks();

        // 使用公共方法处理任务分组和进度信息
        const { groupedTasks, summary } = ProgressParser.processTasksWithProgress(tasks, taskManager.progressTexts);

        return res.json({
            success: true,
            message: '获取任务列表成功',
            data: {
                ...groupedTasks,
                summary
            }
        });

    } catch (error) {
        console.error('获取任务列表错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = tasksHandler;
