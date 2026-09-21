/** 下载管理条目可搜索字段与展示名 */

export function getDownloadItemDisplayName(item) {
    if (item.bundleDisplayName) {
        return item.bundleDisplayName;
    }
    if (item.name) {
        return item.name.replace(/\.ipa$/i, '');
    }
    return item.name ?? '';
}

export function getDownloadItemSearchFields(item) {
    const fields = [
        item.bundleDisplayName,
        item.artistName,
        item.name,
        item.bundleId,
        item.softwareVersionBundleId,
        item.bundleShortVersionString,
        item.bundleVersion,
        item.appleId,
        item.id,
        item.itemId,
        item.softwareVersionExternalIdentifier,
        item.taskId,
    ];

    return [...new Set(
        fields
            .filter((value) => value != null && value !== '')
            .map(String),
    )];
}
