/**
 * 进度解析工具类
 */
class ProgressParser {
    /**
     * 解析进度文本，提取进度百分比和详细描述
     * @param {string} progressText - 进度文本，例如: "downloading  25% |█████████                             | (24/97 MB, 1.4 MB/s)"
     * @param {string} status - 任务状态
     * @returns {Object} 解析结果
     */
    static parseProgress(progressText, status = null) {
        // 如果是已完成状态，直接返回100%
        if (status === 'completed') {
            return {
                percentage: 100,
                sizeProgress: '已完成',
                downloadSpeed: ''
                // raw: progressText || ''
            };
        }

        if (!progressText || typeof progressText !== 'string') {
            return {
                percentage: 0,
                sizeProgress: '等待开始...',
                downloadSpeed: ''
                // raw: progressText || ''
            };
        }

        try {
            // 提取进度百分比的正则表达式
            const percentageMatch = progressText.match(/(\d+)%/);
            const percentage = percentageMatch ? parseInt(percentageMatch[1], 10) : 0;

            // 提取括号中的详细描述的正则表达式
            const descriptionMatch = progressText.match(/\(([^)]+)\)/);
            const description = descriptionMatch ? descriptionMatch[1] : '';

            // 拆分描述为大小进度和下载速度
            let sizeProgress = '';
            let downloadSpeed = '';

            if (description) {
                const parts = description.split(',').map(part => part.trim());
                sizeProgress = parts[0] || '';
                downloadSpeed = parts[1] || '';
            }

            return {
                percentage,
                sizeProgress,
                downloadSpeed
                // raw: progressText
            };
        } catch (error) {
            console.error('解析进度文本失败:', error);
            return {
                percentage: 0,
                sizeProgress: '解析失败',
                downloadSpeed: ''
                // raw: progressText
            };
        }
    }

    /**
     * 批量解析进度信息
     * @param {Array} progressArray - 包含progressText的对象数组
     * @returns {Array} 增强后的进度信息数组
     */
    static parseProgressArray(progressArray) {
        return progressArray.map(item => {
            const parsed = this.parseProgress(item.progressText);
            return {
                ...item,
                progress: {
                    percentage: parsed.percentage,
                    description: parsed.description,
                    raw: parsed.raw
                }
            };
        });
    }

    /**
     * 为任务对象添加进度信息
     * @param {Object} task - 任务对象
     * @param {string} progressText - 进度文本
     * @returns {Object} 增强后的任务对象
     */
    static enhanceTaskWithProgress(task, progressText = null) {
        const parsed = this.parseProgress(progressText, task.status);

        // 移除processId字段，保留error和errorType字段
        const { processId, ...cleanTask } = task;

        return {
            ...cleanTask,
            progress: {
                percentage: parsed.percentage,
                sizeProgress: parsed.sizeProgress,
                downloadSpeed: parsed.downloadSpeed
                // raw: parsed.raw
            }
        };
    }

    /**
     * 处理任务分组和进度信息的通用方法
     * @param {Array} tasks - 任务数组
     * @param {Map} progressTexts - 进度文本映射
     * @returns {Object} 分组后的任务和摘要信息
     */
    static processTasksWithProgress(tasks, progressTexts) {
        // 按状态分组任务
        const groupedTasks = {
            running: [],
            pending: [],
            completed: [],
            failed: []
        };

        // 创建摘要对象
        const summary = {};

        // 遍历任务，添加进度信息并分组
        tasks.forEach(task => {
            let enhancedTask = { ...task };

            // 如果是运行中或等待中的任务，添加进度信息
            if (task.status === 'running' || task.status === 'pending') {
                const progressText = progressTexts.get(task.id) || '等待开始...';
                enhancedTask = this.enhanceTaskWithProgress(task, progressText);
            } else {
                // 其他状态的任务设置默认进度信息
                enhancedTask = this.enhanceTaskWithProgress(task, null);
            }

            // 根据状态分组
            if (groupedTasks[task.status]) {
                groupedTasks[task.status].push(enhancedTask);
            }

            // 构建摘要信息
            if (!summary[task.appId]) {
                summary[task.appId] = {};
            }
            summary[task.appId][task.versionId] = {
                taskId: task.id,
                percentage: enhancedTask.progress.percentage,
                status: task.status
            };
        });

        return {
            groupedTasks,
            summary
        };
    }
}

module.exports = ProgressParser;
