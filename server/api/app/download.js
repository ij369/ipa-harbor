const { getTaskManager } = require('../dl-manager/taskManager');
const { getLatestVersionId } = require('./versions');

/**
 * 下载App - 创建下载任务
 */
async function downloadHandler(req, res) {
    try {
        const { appId, versionId } = req.params;
        const { bundleId } = req.body;

        // 参数验证
        if (!appId || !versionId || !bundleId) {
            return res.status(400).json({
                success: false,
                message: 'App ID、Version ID和Bundle ID是必需的参数',
                error: '请在URL路径中提供appId、versionId和bundleId'
            });
        }

        let actualVersionId = versionId;

        // 如果versionId是"latest"，获取实际的最新版本ID
        if (versionId === 'latest') {
            console.log(`[DEBUG] 检测到latest版本请求，获取应用 ${appId} 的实际最新版本ID`);
            try {
                const latestId = await getLatestVersionId(appId);
                if (latestId) {
                    actualVersionId = latestId;
                    console.log(`[DEBUG] 应用 ${appId} 的实际最新版本ID: ${actualVersionId}`);
                } else {
                    console.log(`[DEBUG] 无法获取应用 ${appId} 的最新版本ID，使用默认值latest`);
                }
            } catch (error) {
                console.error(`获取应用 ${appId} 最新版本ID时出错:`, error);
                // 如果获取失败，继续使用"latest"
            }
        }

        // 创建下载任务
        const taskManager = getTaskManager();
        const taskId = taskManager.createTask(appId, versionId, bundleId, actualVersionId);

        return res.json({
            success: true,
            message: '下载任务已创建',
            taskId: taskId,
            appId: appId,
            versionId: versionId
        });

    } catch (error) {
        console.error('创建下载任务错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = downloadHandler;
