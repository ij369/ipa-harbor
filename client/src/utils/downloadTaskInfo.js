/** 从 WS taskList / fileList 推导某应用的下载状态（纯函数，便于测试与组件隔离） */

export function resolveVersionIdForApp(versionId, storeLatestVersionId) {
    if (versionId !== 'latest') {
        return String(versionId);
    }
    return storeLatestVersionId;
}

export function findStorageFileName(taskList, appTrackId, versionId, storeLatestVersionId) {
    const appId = String(appTrackId);
    const resolvedId = resolveVersionIdForApp(versionId, storeLatestVersionId);

    if (!resolvedId) {
        return `${appId}_latest.ipa`;
    }

    const completedTasks = taskList?.completed || [];
    const matchedTask = completedTasks.find((task) => (
        String(task.appId) === appId
        && (task.versionId === resolvedId || String(task.actualVersionId) === resolvedId)
    ));

    if (matchedTask?.fileName) {
        return matchedTask.fileName;
    }

    return `${appId}_${resolvedId}.ipa`;
}

export function getLocalFileForVersion(fileList, appTrackId, versionId, storeLatestVersionId) {
    if (!appTrackId || !versionId) {
        return null;
    }

    const appId = String(appTrackId);
    const resolvedId = resolveVersionIdForApp(versionId, storeLatestVersionId) || versionId;

    return fileList?.files?.find((item) => (
        item.name === `${appId}_${resolvedId}.ipa`
        || (String(item.itemId) === appId && String(item.softwareVersionExternalIdentifier) === String(resolvedId))
    )) ?? null;
}

export function getLatestTaskInfo(taskList, fileList, appTrackId, storeLatestVersionId) {
    if (!appTrackId) {
        return null;
    }

    const appId = String(appTrackId);
    const fromSummary = taskList?.summary?.[appId]?.latest;

    if (fromSummary && fromSummary.status !== 'completed') {
        const task = [...(taskList.running || []), ...(taskList.pending || []), ...(taskList.failed || [])]
            .find((item) => item.id === fromSummary.taskId);

        return {
            ...fromSummary,
            fileName: task?.fileName,
        };
    }

    if (!storeLatestVersionId) {
        return null;
    }

    const file = getLocalFileForVersion(fileList, appTrackId, storeLatestVersionId, storeLatestVersionId);
    if (file) {
        return { status: 'completed', taskId: null, percentage: 100, fileName: file.name };
    }

    return null;
}

export function getVersionTaskInfo(taskList, fileList, appTrackId, versionId, storeLatestVersionId) {
    if (!appTrackId) {
        return null;
    }

    const appId = String(appTrackId);
    const fromTask = taskList?.summary?.[appId]?.[versionId];
    if (fromTask) {
        return fromTask;
    }

    const file = getLocalFileForVersion(fileList, appTrackId, versionId, storeLatestVersionId);
    return file ? { status: 'completed', taskId: null, percentage: 100, fileName: file.name } : null;
}

export function canShowInstallForVersion(taskList, appTrackId, versionId, storeLatestVersionId) {
    const baseName = findStorageFileName(taskList, appTrackId, versionId, storeLatestVersionId).replace(/\.ipa$/i, '');
    return baseName.includes('_');
}
