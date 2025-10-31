const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { parseIpaMetadata } = require('../ipa/metadata');
const wsManager = require('../../utils/websocketServer');

// 配置
const IPATOOL_PATH = path.join(__dirname, '../../bin/ipatool');
const DATA_DIR = path.join(__dirname, '../../data');
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS) || 2;
const { KEYCHAIN_PASSPHRASE } = require('../../config/keychain');
const ENABLE_MORE_LOGS = process.env.ENABLE_MORE_LOGS === 'true';

// 任务状态
const TASK_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

class TaskManager {
    constructor() {
        this.tasks = new Map();
        this.runningTasks = new Map();
        this.queue = [];
        this.progressTexts = new Map(); // 存储实时进度文本
        this.processQueue();
    }

    // 创建新任务
    createTask(appId, versionId, bundleId, actualVersionId = null) {
        // 清理已存在的相同应用和版本的任务和文件
        this.cleanupExistingTasks(appId, versionId);

        const taskId = uuidv4();
        const task = {
            id: taskId,
            appId,
            versionId,
            bundleId,
            actualVersionId: actualVersionId,
            status: TASK_STATUS.PENDING,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            progress: 0,
            processId: null,
            fileName: null,
            error: null,
            errorType: null
        };

        this.tasks.set(taskId, task);
        this.queue.push(taskId);

        console.log(`创建下载任务: ${taskId} (App: ${appId}, Version: ${versionId}, Bundle: ${bundleId}, ActualVersion: ${task.actualVersionId})`);
        return taskId;
    }

    // 清理已存在的相同应用和版本的任务和文件
    cleanupExistingTasks(appId, versionId) {
        // 查找所有相同appId和versionId的任务
        const existingTasks = Array.from(this.tasks.values()).filter(
            task => task.appId === appId && task.versionId === versionId
        );

        if (existingTasks.length > 0) {
            console.log(`发现 ${existingTasks.length} 个相同的任务，开始清理...`);

            // 删除所有相同的任务
            existingTasks.forEach(task => {
                console.log(`删除已存在的任务: ${task.id} (App: ${appId}, Version: ${versionId})`);
                this.deleteTask(task.id);
            });
        }

        // 清理data目录中的相关文件
        this.cleanupDataFiles(appId, versionId);
    }

    // 清理data目录中的相关文件
    cleanupDataFiles(appId, versionId) {
        try {
            // 确保data目录存在
            if (!fs.existsSync(DATA_DIR)) {
                return;
            }

            // 生成可能的文件名
            const fileName = `${appId}_${versionId}.ipa`;
            const jsonFileName = `${appId}_${versionId}.json`;

            const ipaPath = path.join(DATA_DIR, fileName);
            const jsonPath = path.join(DATA_DIR, jsonFileName);

            // 删除IPA文件
            if (fs.existsSync(ipaPath)) {
                fs.unlinkSync(ipaPath);
                console.log(`删除已存在的IPA文件: ${fileName}`);
            }

            // 删除JSON文件
            if (fs.existsSync(jsonPath)) {
                fs.unlinkSync(jsonPath);
                console.log(`删除已存在的JSON文件: ${jsonFileName}`);
            }
        } catch (error) {
            console.error('清理data目录文件失败:', error);
        }
    }

    // 处理队列
    processQueue() {
        setInterval(() => {
            if (this.runningTasks.size < MAX_CONCURRENT && this.queue.length > 0) {
                const taskId = this.queue.shift();
                this.startDownload(taskId);
            }
        }, 1000);
    }

    // 开始下载
    startDownload(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== TASK_STATUS.PENDING) {
            return;
        }

        task.status = TASK_STATUS.RUNNING;
        task.updatedAt = new Date().toISOString();

        // 确保data目录存在
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // 生成文件名
        const fileName = `${task.appId}_${task.versionId}.ipa`;
        const filePath = path.join(DATA_DIR, fileName);

        const command = [
            'download',
            '-b', task.bundleId, // 下载时最好先购买，所以用到bundleId而不用appId
            '--purchase',
            '--keychain-passphrase', KEYCHAIN_PASSPHRASE
        ];

        // 添加--external-version-id参数
        // 如果是latest版本且有实际版本ID，使用实际版本ID
        // 否则如果不是latest版本，使用原版本ID
        if (task.versionId === 'latest' && task.actualVersionId && task.actualVersionId !== 'latest') {
            command.push('--external-version-id', task.actualVersionId);
            // console.log(`[DEBUG] latest版本使用实际版本ID: ${task.actualVersionId}`);
        } else if (task.versionId !== 'latest') {
            command.push('--external-version-id', task.versionId);
            // console.log(`[DEBUG] 指定版本使用版本ID: ${task.versionId}`);
        } else {
            // console.log(`[DEBUG] latest版本未获取到实际版本ID，不添加--external-version-id参数`);
        }

        command.push('-o', filePath, '--format', 'json');

        // 预设文件名
        task.fileName = fileName;

        // 用于调试 输出完整的执行命令
        // console.log(`[DEBUG] 执行命令: ${IPATOOL_PATH} ${command.join(' ')}`);

        console.log(`开始下载任务: ${taskId}`);

        const process = spawn(IPATOOL_PATH, command);
        task.processId = process.pid;
        this.runningTasks.set(taskId, process);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;

            // 提取进度信息并存储
            const lines = output.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();

                // 调试日志 - 输出所有非空行
                if (trimmedLine && ENABLE_MORE_LOGS) {
                    console.log(`[DEBUG] stdout ${taskId}: ${trimmedLine}`);
                }

                if (trimmedLine && trimmedLine.includes('downloading')) {
                    this.progressTexts.set(taskId, trimmedLine);
                }

                // 检测错误情况 - 匹配JSON格式的错误信息
                if (trimmedLine.includes('password token is expired') || trimmedLine.includes('"error":"password token is expired"')) {
                    task.status = TASK_STATUS.FAILED;
                    task.error = '密码令牌已过期，请重新登录';
                    task.errorType = 'TOKEN_EXPIRED';
                    task.updatedAt = new Date().toISOString();
                    console.log(`实时检测到错误: ${taskId}, 密码令牌已过期`);

                    // 杀死进程
                    if (process && !process.killed) {
                        process.kill('SIGTERM');
                    }
                    return;
                }

                if (trimmedLine.includes('license is required') || trimmedLine.includes('"error":"license is required"')) {
                    task.status = TASK_STATUS.FAILED;
                    task.error = '需要先领取该应用的许可证';
                    task.errorType = 'LICENSE_REQUIRED';
                    task.updatedAt = new Date().toISOString();
                    console.log(`实时检测到错误: ${taskId}, 需要领取应用许可证`);

                    // 杀死进程
                    if (process && !process.killed) {
                        process.kill('SIGTERM');
                    }
                    return;
                }
            }
        });

        process.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;

            // stderr中也可能包含进度信息
            const lines = output.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();

                // // 调试日志 - 输出所有非空行
                // if (trimmedLine) {
                //     console.log(`[DEBUG] stderr ${taskId}: ${trimmedLine}`);
                // }

                if (trimmedLine && trimmedLine.includes('downloading')) {
                    this.progressTexts.set(taskId, trimmedLine);
                }

                // 检测错误情况 - 匹配JSON格式的错误信息
                if (trimmedLine.includes('password token is expired') || trimmedLine.includes('"error":"password token is expired"')) {
                    task.status = TASK_STATUS.FAILED;
                    task.error = '密码令牌已过期，请重新登录';
                    task.errorType = 'TOKEN_EXPIRED';
                    task.updatedAt = new Date().toISOString();
                    console.log(`实时检测到错误: ${taskId}, 密码令牌已过期`);

                    // 杀死进程
                    if (process && !process.killed) {
                        process.kill('SIGTERM');
                    }
                    return;
                }

                if (trimmedLine.includes('license is required') || trimmedLine.includes('"error":"license is required"')) {
                    task.status = TASK_STATUS.FAILED;
                    task.error = '需要先领取该应用的许可证';
                    task.errorType = 'LICENSE_REQUIRED';
                    task.updatedAt = new Date().toISOString();
                    console.log(`实时检测到错误: ${taskId}, 需要领取应用许可证`);

                    // 杀死进程
                    if (process && !process.killed) {
                        process.kill('SIGTERM');
                    }
                    return;
                }
            }
        });

        process.on('close', (code) => {
            this.runningTasks.delete(taskId);
            this.progressTexts.delete(taskId); // 清理进度文本
            task.processId = null;

            // 如果任务状态已经被设置为失败（由于特定错误），则不再更新状态
            if (task.status === TASK_STATUS.FAILED && task.errorType && task.errorType !== 'GENERAL_ERROR') {
                console.log(`任务 ${taskId} 已经设置了特定错误类型: ${task.errorType}`);
                return;
            }

            task.updatedAt = new Date().toISOString();

            if (code === 0) {
                task.status = TASK_STATUS.COMPLETED;
                task.progress = 100;

                console.log(`下载完成: ${taskId}, 文件: ${task.fileName}`);

                // 自动解析metadata
                this.parseMetadataAndBroadcast(task.fileName, taskId);
            } else {
                task.status = TASK_STATUS.FAILED;

                // 检查stdout和stderr中是否包含特定错误信息
                const allOutput = stdout + stderr;
                // console.log(`[DEBUG] 进程关闭检查 ${taskId}:`);
                // console.log(`[DEBUG] stdout内容: ${stdout}`);
                // console.log(`[DEBUG] stderr内容: ${stderr}`);
                // console.log(`[DEBUG] 退出码: ${code}`);

                if (allOutput.includes('password token is expired')) {
                    task.error = '密码令牌已过期，请重新登录';
                    task.errorType = 'TOKEN_EXPIRED';
                    // console.log(`[DEBUG] 检测到TOKEN_EXPIRED错误`);
                } else if (allOutput.includes('license is required')) {
                    task.error = '需要先领取该应用的许可证';
                    task.errorType = 'LICENSE_REQUIRED';
                    // console.log(`[DEBUG] 检测到LICENSE_REQUIRED错误`);
                } else {
                    task.error = stderr || stdout || `进程退出码: ${code}`;
                    task.errorType = 'GENERAL_ERROR';
                    // console.log(`[DEBUG] 设置为GENERAL_ERROR`);
                }

                console.log(`下载失败: ${taskId}, 错误类型: ${task.errorType}, 错误: ${task.error}`);
            }
        });

        process.on('error', (error) => {
            this.runningTasks.delete(taskId);
            this.progressTexts.delete(taskId); // 清理进度文本
            task.status = TASK_STATUS.FAILED;
            task.error = error.message;
            task.processId = null;
            task.updatedAt = new Date().toISOString();
            // console.log(`下载进程错误: ${taskId}, 错误: ${error.message}`);
        });
    }

    // 删除任务
    deleteTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return { success: false, message: '任务不存在' };
        }

        // 根据任务状态进行不同的清理操作
        switch (task.status) {
            case TASK_STATUS.RUNNING:
                // 如果任务正在运行，先杀死进程
                const process = this.runningTasks.get(taskId);
                if (process) {
                    process.kill('SIGTERM');
                    this.runningTasks.delete(taskId);
                }
                break;

            case TASK_STATUS.PENDING:
                // 从队列中移除
                const index = this.queue.indexOf(taskId);
                if (index > -1) {
                    this.queue.splice(index, 1);
                }
                break;

            case TASK_STATUS.FAILED:
            case TASK_STATUS.COMPLETED:
                // 失败和完成的任务直接删除，无需额外操作
                break;
        }

        // 如果任务有对应的文件，删除文件
        if (task.fileName) {
            this.deleteFilesByName(task.fileName);
        }

        // 清理进度文本
        this.progressTexts.delete(taskId);

        // 从任务列表中删除
        this.tasks.delete(taskId);

        // console.log(`删除任务: ${taskId} (状态: ${task.status})`);
        return { success: true, message: '任务已删除' };
    }

    // 按文件名删除任务和文件
    deleteByFileName(fileName) {
        try {
            // 查找所有匹配该文件名的任务
            const matchingTasks = Array.from(this.tasks.values()).filter(
                task => task.fileName === fileName
            );

            // 删除所有匹配的任务
            let deletedTaskCount = 0;
            matchingTasks.forEach(task => {
                const result = this.deleteTask(task.id);
                if (result.success) {
                    deletedTaskCount++;
                }
            });

            // 删除对应的文件
            const fileDeleted = this.deleteFilesByName(fileName);

            if (fileDeleted || deletedTaskCount > 0) {
                return {
                    success: true,
                    message: `成功删除 ${deletedTaskCount} 个任务和对应文件`,
                    deletedTaskCount,
                    fileDeleted
                };
            } else {
                return {
                    success: false,
                    message: '未找到匹配的任务或文件'
                };
            }
        } catch (error) {
            console.error('按文件名删除失败:', error);
            return {
                success: false,
                message: `删除失败: ${error.message}`
            };
        }
    }

    // 清空所有任务和文件
    clearAllTasks() {
        try {
            let deletedTaskCount = 0;

            // 停止所有正在运行的任务
            for (const [taskId, process] of this.runningTasks.entries()) {
                if (process && !process.killed) {
                    process.kill('SIGTERM');
                }
                this.runningTasks.delete(taskId);
            }

            // 清空队列
            this.queue.length = 0;

            // 删除所有任务
            deletedTaskCount = this.tasks.size;
            this.tasks.clear();

            // 清理所有进度文本
            this.progressTexts.clear();

            // 删除data目录下的所有ipa和json文件
            const filesDeleted = this.deleteAllFiles();

            console.log(`清空所有任务: 删除了 ${deletedTaskCount} 个任务和 ${filesDeleted} 个文件`);

            return {
                success: true,
                message: `成功清空所有任务和文件`,
                deletedCount: deletedTaskCount,
                filesDeleted
            };
        } catch (error) {
            console.error('清空所有任务失败:', error);
            return {
                success: false,
                message: `清空失败: ${error.message}`
            };
        }
    }

    // 删除指定文件名的ipa和json文件
    deleteFilesByName(fileName) {
        try {
            let deleted = false;

            // 生成对应的文件路径
            const ipaPath = path.join(DATA_DIR, fileName);
            const jsonFileName = fileName.replace('.ipa', '.json');
            const jsonPath = path.join(DATA_DIR, jsonFileName);

            // 删除IPA文件
            if (fs.existsSync(ipaPath)) {
                fs.unlinkSync(ipaPath);
                console.log(`删除IPA文件: ${fileName}`);
                deleted = true;
            }

            // 删除JSON文件
            if (fs.existsSync(jsonPath)) {
                fs.unlinkSync(jsonPath);
                console.log(`删除JSON文件: ${jsonFileName}`);
                deleted = true;
            }

            // 删除ipa.tmp文件
            const tmpPath = path.join(DATA_DIR, `${fileName}.tmp`);
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
                console.log(`删除ipa.tmp文件: ${fileName}`);
                deleted = true;
            }

            return deleted;
        } catch (error) {
            console.error(`删除文件失败: ${fileName}`, error);
            return false;
        }
    }

    // 删除data目录下的所有ipa和json文件
    deleteAllFiles() {
        try {
            let deletedCount = 0;

            if (!fs.existsSync(DATA_DIR)) {
                return deletedCount;
            }

            const files = fs.readdirSync(DATA_DIR);

            files.forEach(file => {
                const filePath = path.join(DATA_DIR, file);
                const stats = fs.statSync(filePath);

                // 只删除文件，不删除目录
                if (stats.isFile() && (file.endsWith('.ipa') || file.endsWith('.json') || file.endsWith('.tmp'))) {
                    fs.unlinkSync(filePath);
                    console.log(`删除文件: ${file}`);
                    deletedCount++;
                }
            });

            return deletedCount;
        } catch (error) {
            console.error('删除所有文件失败:', error);
            return 0;
        }
    }

    // 获取任务列表
    getTasks() {
        return Array.from(this.tasks.values()).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    // 获取单个任务
    getTask(taskId) {
        return this.tasks.get(taskId);
    }

    // 获取实时进度信息
    getProgress() {
        const progressArray = [];

        // 遍历所有正在运行的任务
        for (const [taskId, task] of this.tasks.entries()) {
            if (task.status === TASK_STATUS.RUNNING || task.status === TASK_STATUS.PENDING) {
                const progressText = this.progressTexts.get(taskId) || '等待开始...';
                progressArray.push({
                    taskId: taskId,
                    appId: task.appId,
                    versionId: task.versionId,
                    status: task.status,
                    progressText: progressText,
                    updatedAt: task.updatedAt
                });
            }
        }

        return progressArray;
    }

    // 获取文件列表
    getFiles() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                return [];
            }

            const files = fs.readdirSync(DATA_DIR)
                .filter(file => file.endsWith('.ipa'))
                .map(file => {
                    const filePath = path.join(DATA_DIR, file);
                    const stats = fs.statSync(filePath);

                    // 基础文件信息
                    const fileInfo = {
                        name: file,
                        path: filePath,
                        size: stats.size,
                        createdAt: stats.birthtime.toISOString(),
                        modifiedAt: stats.mtime.toISOString()
                    };

                    // 尝试读取对应的JSON metadata文件
                    const jsonFileName = file.replace('.ipa', '.json');
                    const jsonFilePath = path.join(DATA_DIR, jsonFileName);

                    if (fs.existsSync(jsonFilePath)) {
                        try {
                            const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
                            const metadata = JSON.parse(jsonContent);

                            // 添加需要的metadata字段
                            if (metadata.itemId) fileInfo.itemId = metadata.itemId;
                            if (metadata.bundleDisplayName) fileInfo.bundleDisplayName = metadata.bundleDisplayName;
                            if (metadata.artistName) fileInfo.artistName = metadata.artistName;
                            if (metadata.bundleShortVersionString) fileInfo.bundleShortVersionString = metadata.bundleShortVersionString;
                            if (metadata.bundleVersion) fileInfo.bundleVersion = metadata.bundleVersion;
                            if (metadata['product-type']) fileInfo.productType = metadata['product-type'];
                            if (metadata.softwareVersionBundleId) fileInfo.softwareVersionBundleId = metadata.softwareVersionBundleId;
                            if (metadata.softwareVersionExternalIdentifier) fileInfo.softwareVersionExternalIdentifier = metadata.softwareVersionExternalIdentifier;
                            if (metadata.releaseDate) fileInfo.releaseDate = metadata.releaseDate;

                        } catch (jsonError) {
                            console.error(`解析JSON文件失败: ${jsonFileName}`, jsonError);
                        }
                    }

                    return fileInfo;
                })
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return files;
        } catch (error) {
            console.error('获取文件列表失败:', error);
            return [];
        }
    }

    // 解析metadata并广播
    async parseMetadataAndBroadcast(fileName, taskId) {
        try {
            console.log(`开始解析metadata: ${fileName}`);
            const metadata = await parseIpaMetadata(fileName);

            // 构建广播数据，格式与metadata接口返回一致
            const broadcastData = {
                success: true,
                message: `任务 ${taskId} 下载完成，metadata解析成功`,
                data: metadata,
                taskId: taskId,
                fileName: fileName
            };

            // 广播task-completed消息
            wsManager.broadcastToDefault('task-completed', JSON.stringify(broadcastData));

            console.log(`metadata解析完成并已广播: ${fileName}`);
        } catch (error) {
            console.error(`metadata解析失败: ${fileName}`, error);

            // 即使解析失败也要广播完成消息
            const errorData = {
                success: false,
                message: `任务 ${taskId} 下载完成，但metadata解析失败`,
                error: error.message,
                taskId: taskId,
                fileName: fileName
            };

            wsManager.broadcastToDefault('task-completed', JSON.stringify(errorData));
        }
    }
}

// 单例模式
let taskManagerInstance = null;

function getTaskManager() {
    if (!taskManagerInstance) {
        taskManagerInstance = new TaskManager();
    }
    return taskManagerInstance;
}

module.exports = { getTaskManager, TASK_STATUS };
