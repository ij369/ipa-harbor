import { getDownloadItemDisplayName, getDownloadItemSearchFields } from './downloadItem.js';

/** 同一 App 的分组键 */
export function getAppGroupKey(item) {
    if (item.id != null && item.id !== '') {
        return `app:${item.id}`;
    }
    if (item.itemId != null && item.itemId !== '') {
        return `app:${item.itemId}`;
    }
    if (item.softwareVersionBundleId) {
        return `bundle:${item.softwareVersionBundleId}`;
    }
    return `file:${item.name}`;
}

/** 版本按最新优先排序 */
export function compareVersionsNewestFirst(a, b) {
    const dateA = a.releaseDate || a.createdAt;
    const dateB = b.releaseDate || b.createdAt;

    if (dateA && dateB) {
        const compared = new Date(dateB).getTime() - new Date(dateA).getTime();
        if (compared !== 0) {
            return compared;
        }
    } else if (dateB && !dateA) {
        return 1;
    } else if (dateA && !dateB) {
        return -1;
    }

    const buildA = Number(a.bundleVersion) || 0;
    const buildB = Number(b.bundleVersion) || 0;
    if (buildB !== buildA) {
        return buildB - buildA;
    }

    const extA = Number(a.softwareVersionExternalIdentifier) || 0;
    const extB = Number(b.softwareVersionExternalIdentifier) || 0;
    if (extB !== extA) {
        return extB - extA;
    }

    return String(b.name ?? '').localeCompare(String(a.name ?? ''));
}

/** 将下载条目按 App 聚合 */
export function groupDownloadItemsByApp(items) {
    const map = new Map();

    for (const item of items) {
        const groupKey = getAppGroupKey(item);
        let group = map.get(groupKey);

        if (!group) {
            group = {
                groupKey,
                appId: item.id || item.itemId,
                displayName: getDownloadItemDisplayName(item),
                artistName: item.artistName ?? null,
                versions: [],
            };
            map.set(groupKey, group);
        }

        if (item.bundleDisplayName && !group.displayName) {
            group.displayName = item.bundleDisplayName;
        }
        if (item.artistName && !group.artistName) {
            group.artistName = item.artistName;
        }
        if (!group.appId && (item.id || item.itemId)) {
            group.appId = item.id || item.itemId;
        }

        group.versions.push(item);
    }

    for (const group of map.values()) {
        group.versions.sort(compareVersionsNewestFirst);
        if (!group.displayName && group.versions[0]) {
            group.displayName = getDownloadItemDisplayName(group.versions[0]);
        }
    }

    return Array.from(map.values());
}

function appGroupSortProxy(group) {
    return {
        bundleDisplayName: group.displayName,
        name: group.displayName,
        artistName: group.artistName,
    };
}

/** 搜索 + 排序 App 分组 */
export function searchAppGroups(groups, rawQuery, searchContext) {
    const trimmed = rawQuery.trim();
    let filtered = groups;

    if (trimmed) {
        const queryNormalized = searchContext.strategy.normalizeQuery(trimmed);

        filtered = groups.filter((group) => {
            const groupFields = [
                group.displayName,
                group.artistName,
                group.appId,
            ].filter(Boolean).map(String);

            const strategy = searchContext.strategy;
            const groupMatched = strategy.id === 'zh'
                ? strategy.itemMatches(groupFields, trimmed)
                : strategy.itemMatches(groupFields, trimmed, queryNormalized);

            if (groupMatched) {
                return true;
            }

            return group.versions.some((version) => {
                const fields = getDownloadItemSearchFields(version);
                if (strategy.id === 'zh') {
                    return strategy.itemMatches(fields, trimmed);
                }
                return strategy.itemMatches(fields, trimmed, queryNormalized);
            });
        });
    }

    return [...filtered].sort((a, b) => {
        const keyA = searchContext.strategy.getSortKey(appGroupSortProxy(a));
        const keyB = searchContext.strategy.getSortKey(appGroupSortProxy(b));
        const compared = searchContext.collator.compare(keyA, keyB);
        if (compared !== 0) {
            return compared;
        }
        return searchContext.collator.compare(a.displayName ?? '', b.displayName ?? '');
    });
}

/** App 分组索引字母 */
export function getAppGroupIndexLetter(group, searchContext) {
    return searchContext.getIndexLetter(appGroupSortProxy(group));
}
