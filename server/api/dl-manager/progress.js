const { getTaskManager } = require('./taskManager');

/**
 * 获取实时进度
 */
async function progressHandler(req, res) {
    try {
        const taskManager = getTaskManager();
        const progress = taskManager.getProgress();

        return res.json({
            success: true,
            message: '获取进度信息成功',
            data: progress
        });

    } catch (error) {
        console.error('获取进度信息错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = progressHandler;
