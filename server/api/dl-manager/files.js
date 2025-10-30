const { getTaskManager } = require('./taskManager');

/**
 * 获取文件列表
 */
async function filesHandler(req, res) {
    try {
        const taskManager = getTaskManager();
        const files = taskManager.getFiles();

        return res.json({
            success: true,
            message: '获取文件列表成功',
            data: {
                files: files,
                total: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0)
            }
        });

    } catch (error) {
        console.error('获取文件列表错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = filesHandler;
