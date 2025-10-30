const { getTaskManager } = require('./taskManager');

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
                return res.json({
                    success: true,
                    message: result.message,
                    data: {
                        cleared: true,
                        deletedCount: result.deletedCount
                    }
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    error: `清空所有任务失败: ${result.message}`
                });
            }
        }

        // 如果提供了fileName，按文件名删除
        if (fileName) {
            result = taskManager.deleteByFileName(fileName);

            if (result.success) {
                return res.json({
                    success: true,
                    message: result.message,
                    data: {
                        fileName: fileName,
                        deleted: true
                    }
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    error: `按文件名删除失败: ${result.message}`
                });
            }
        }

        // 如果提供了taskId，按任务ID删除
        if (taskId) {
            result = taskManager.deleteTask(taskId);

            if (result.success) {
                return res.json({
                    success: true,
                    message: result.message,
                    data: {
                        taskId: taskId,
                        deleted: true
                    }
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    error: `删除任务失败: ${result.message}`
                });
            }
        }

        // 如果没有提供任何参数
        return res.status(400).json({
            success: false,
            message: '请提供taskId、fileName或clearAll参数',
            error: '缺少必要参数'
        });

    } catch (error) {
        console.error('删除任务错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = deleteHandler;
