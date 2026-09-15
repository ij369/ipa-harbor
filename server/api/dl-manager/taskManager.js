const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { resolveItemId } = require('../../utils/ipaFileName');
const { parseIpaMetadata, writeSidecarMetadata } = require('../ipa/metadata');
const { resolveExternalVersionId } = require('../../utils/ipaMetadata');
const {
    upsertVersionMetadataRecord,
    tryRefreshVersionMetadata,
} = require('../../utils/versionMetadata');
const database = require('../../utils/database');
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
        this.metadataPipelineGen = new Map(); // 按文件名跟踪 metadata 流程代数，删除/重下时可作废
        this.processQueue();
    }

    // 创建新任务
    createTask(appId, versionId, bundleId, actualVersionId = null) {
        // 清理已存在的相同应用和版本的任务和文件
        this.cleanupExistingTasks(appId, versionId, actualVersionId);

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
    cleanupExistingTasks(appId, versionId, actualVersionId = null) {
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
        this.cleanupDataFiles(appId, versionId, actualVersionId);
    }

    buildTaskFileName(appId, versionId, actualVersionId = null) {
        const resolvedVersionId = actualVersionId && actualVersionId !== 'latest'
            ? actualVersionId
            : versionId;
        return `${appId}_${resolvedVersionId}.ipa`;
    }

    // 清理data目录中的相关文件
    cleanupDataFiles(appId, versionId, actualVersionId = null) {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                return;
            }

            const fileName = this.buildTaskFileName(appId, versionId, actualVersionId);
            const jsonFileName = fileName.replace(/\.ipa$/, '.json');
            const legacyFileName = `${appId}_${versionId}.ipa`;
            const legacyJsonFileName = `${appId}_${versionId}.json`;

            [fileName, legacyFileName].forEach((name) => {
                this.bumpMetadataPipeline(name);
                const ipaPath = path.join(DATA_DIR, name);
                if (fs.existsSync(ipaPath)) {
                    fs.unlinkSync(ipaPath);
                    console.log(`删除已存在的IPA文件: ${name}`);
                }
            });

            [jsonFileName, legacyJsonFileName].forEach((name) => {
                const jsonPath = path.join(DATA_DIR, name);
                if (fs.existsSync(jsonPath)) {
                    fs.unlinkSync(jsonPath);
                    console.log(`删除已存在的JSON文件: ${name}`);
                }
            });
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

        const fileName = this.buildTaskFileName(task.appId, task.versionId, task.actualVersionId);
        const filePath = path.join(DATA_DIR, fileName);

        const command = [
            'download',
            '-b', task.bundleId, // 下载时最好先购买，所以用到bundleId而不用appId
            '--purchase',
            // v2.6.0+ 已经修复了包无法 OTA 安装的问题，默认用 data descriptor，无需 --ota-compat（见 majd/ipatool#540）
            '--keychain-passphrase', KEYCHAIN_PASSPHRASE
        ];

        // 仅历史版本需要 pin 版本号；latest 不传 --external-version-id，
        // 以便 ipatool 走 volumeStore → redownload 空响应修复（majd/ipatool#538/#547）
        if (task.versionId !== 'latest') {
            command.push('--external-version-id', task.versionId);
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

    // 递增代数：开始解析或删除/重下时调用，使进行中的 Apple 阶段失效
    bumpMetadataPipeline(fileName) {
        if (!fileName) {
            return 0;
        }
        const gen = (this.metadataPipelineGen.get(fileName) || 0) + 1;
        this.metadataPipelineGen.set(fileName, gen);
        return gen;
    }

    canWriteMetadata(fileName, gen) {
        return this.metadataPipelineGen.get(fileName) === gen
            && fs.existsSync(path.join(DATA_DIR, fileName));
    }

    // 删除指定文件名的ipa和json文件
    deleteFilesByName(fileName) {
        try {
            let deleted = false;

            this.bumpMetadataPipeline(fileName);

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
    async getFiles() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                return [];
            }

            const ipaFiles = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith('.ipa'));
            const appIds = [];

            const files = ipaFiles.map((file) => {
                const filePath = path.join(DATA_DIR, file);
                const stats = fs.statSync(filePath);

                const fileInfo = {
                    name: file,
                    path: filePath,
                    size: stats.size,
                    createdAt: stats.birthtime.toISOString(),
                    modifiedAt: stats.mtime.toISOString(),
                };

                const jsonFileName = file.replace('.ipa', '.json');
                const jsonFilePath = path.join(DATA_DIR, jsonFileName);

                if (fs.existsSync(jsonFilePath)) {
                    try {
                        const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
                        const metadata = JSON.parse(jsonContent);

                        const itemId = resolveItemId(metadata, file);
                        if (itemId) {
                            fileInfo.itemId = itemId;
                            appIds.push(String(itemId));
                        }
                        if (metadata.bundleDisplayName) fileInfo.bundleDisplayName = metadata.bundleDisplayName;
                        if (metadata.artistName) fileInfo.artistName = metadata.artistName;
                        const appleId = metadata['apple-id'] || metadata.userName;
                        if (appleId) fileInfo.appleId = appleId;
                        if (metadata.bundleShortVersionString) fileInfo.bundleShortVersionString = metadata.bundleShortVersionString;
                        if (metadata.bundleVersion) fileInfo.bundleVersion = metadata.bundleVersion;
                        if (metadata['product-type']) fileInfo.productType = metadata['product-type'];
                        if (metadata.softwareVersionBundleId) fileInfo.softwareVersionBundleId = metadata.softwareVersionBundleId;
                        if (metadata.softwareVersionExternalIdentifier) {
                            fileInfo.softwareVersionExternalIdentifier = metadata.softwareVersionExternalIdentifier;
                        }
                        if (metadata.firstReleaseDate) fileInfo.firstReleaseDate = metadata.firstReleaseDate;
                        if (metadata.appleVersionMetadata?.releaseDate) {
                            fileInfo.releaseDate = metadata.appleVersionMetadata.releaseDate;
                        }
                    } catch (jsonError) {
                        console.error(`解析JSON文件失败: ${jsonFileName}`, jsonError);
                    }
                }

                return fileInfo;
            });

            const metadataRows = await database.getAppVersionMetadataByAppIds(appIds);
            const metadataMap = new Map(
                metadataRows.map((row) => [`${row.app_id}_${row.version_id}`, row])
            );

            files.forEach((fileInfo) => {
                const appId = fileInfo.itemId != null ? String(fileInfo.itemId) : null;
                const versionId = fileInfo.softwareVersionExternalIdentifier != null
                    ? String(fileInfo.softwareVersionExternalIdentifier)
                    : null;

                if (!appId || !versionId) {
                    return;
                }

                const row = metadataMap.get(`${appId}_${versionId}`);
                if (row?.release_date) {
                    fileInfo.releaseDate = row.release_date;
                }
                if (row?.display_version && !fileInfo.bundleShortVersionString) {
                    fileInfo.bundleShortVersionString = row.display_version;
                }
            });

            return files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (error) {
            console.error('获取文件列表失败:', error);
            return [];
        }
    }

    async broadcastFileList() {
        const files = await this.getFiles();
        wsManager.broadcastToDefault('watch', {
            success: true,
            data: {
                files,
                total: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
            },
        });
    }

    // 解析 metadata：先写 IPA plist 并广播，再可选拉 Apple 版本元数据并补广播
    async parseMetadataAndBroadcast(fileName, taskId) {
        const task = this.tasks.get(taskId);
        const gen = this.bumpMetadataPipeline(fileName);
        const warnings = [];
        const resolvedVersionId = resolveExternalVersionId(task, fileName);
        const appId = task?.appId;
        const bundleId = task?.bundleId;

        const notify = async (payload) => {
            await this.broadcastFileList();
            wsManager.broadcastToDefault('task-completed', JSON.stringify(payload));
        };

        try {
            const parseStartedAt = Date.now();
            let ipaMetadata = null;

            try {
                ipaMetadata = await parseIpaMetadata(fileName, { forceReparse: true, skipWrite: true });
            } catch (parseError) {
                warnings.push(`IPA plist 解析失败: ${parseError.message}`);
                console.warn(`IPA plist 解析失败: ${fileName}`, parseError.message);
            }

            if (ipaMetadata && this.canWriteMetadata(fileName, gen)) {
                writeSidecarMetadata(fileName, ipaMetadata);
            }

            await notify({
                success: true,
                phase: 'ipa',
                message: ipaMetadata
                    ? `任务 ${taskId} IPA metadata 已就绪`
                    : `任务 ${taskId} IPA metadata 解析失败`,
                data: ipaMetadata,
                warnings,
                taskId,
                fileName,
            });

            if (ipaMetadata) {
                console.log(`IPA metadata 解析完成并已广播: ${fileName} (${Date.now() - parseStartedAt}ms)`);
            }

            if (!resolvedVersionId || !appId || !this.canWriteMetadata(fileName, gen)) {
                if (resolvedVersionId && appId && !this.canWriteMetadata(fileName, gen)) {
                    console.log(`metadata 流程已取消，跳过 Apple 阶段: ${fileName}`);
                }
                return;
            }

            const refreshed = await tryRefreshVersionMetadata(appId, resolvedVersionId, {
                bundleId,
                ipaMetadata,
                updateSidecar: false,
            });

            if (!this.canWriteMetadata(fileName, gen)) {
                console.log(`metadata 流程已取消，丢弃 Apple 结果: ${fileName}`);
                return;
            }

            let appleVersionMetadata = null;
            if (refreshed) {
                appleVersionMetadata = refreshed.appleMetadata;
                if (ipaMetadata) {
                    writeSidecarMetadata(fileName, {
                        ...ipaMetadata,
                        appleVersionMetadata: {
                            ...appleVersionMetadata,
                            fetchedAt: new Date().toISOString(),
                        },
                    });
                }
            } else {
                warnings.push('Apple 版本元数据获取失败，已跳过');
                console.warn(`可选 Apple 版本元数据获取失败 ${appId}/${resolvedVersionId}`);
            }

            if (ipaMetadata) {
                await upsertVersionMetadataRecord({
                    appId,
                    versionId: resolvedVersionId,
                    bundleId,
                    displayVersion: appleVersionMetadata?.displayVersion
                        || ipaMetadata.bundleShortVersionString
                        || null,
                    releaseDate: appleVersionMetadata?.releaseDate || null,
                    appleMetadata: appleVersionMetadata,
                    ipaMetadata,
                }).catch((dbError) => {
                    console.warn('写入版本元数据缓存失败:', dbError.message);
                });
            }

            await notify({
                success: true,
                phase: 'apple',
                message: warnings.length > 0
                    ? `任务 ${taskId} 下载完成（${warnings.join('；')}）`
                    : `任务 ${taskId} 下载完成，metadata 已全部就绪`,
                data: ipaMetadata,
                appleVersionMetadata,
                warnings,
                taskId,
                fileName,
            });
            console.log(`Apple 版本元数据阶段完成并已补广播: ${fileName}`);
        } catch (error) {
            console.error(`metadata处理异常: ${fileName}`, error);
            await this.broadcastFileList().catch(() => { });
            wsManager.broadcastToDefault('task-completed', JSON.stringify({
                success: true,
                phase: 'error',
                message: `任务 ${taskId} 下载完成，但 metadata 处理异常: ${error.message}`,
                error: error.message,
                warnings,
                taskId,
                fileName,
            }));
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
