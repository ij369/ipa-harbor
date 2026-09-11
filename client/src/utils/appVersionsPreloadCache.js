/** Dialog 会话内按 appId 缓存版本列表预加载结果，关闭 Dialog 后销毁 */

const versionsPreloadCache = new Map();

function toCacheKey(trackId) {
    return String(trackId);
}

export function getVersionsPreloadEntry(trackId) {
    if (trackId == null || trackId === '') {
        return null;
    }
    return versionsPreloadCache.get(toCacheKey(trackId)) ?? null;
}

export function isVersionsPreloadConsumed(trackId) {
    return getVersionsPreloadEntry(trackId)?.consumed === true;
}

export function markVersionsPreloadConsumed(trackId, consumed = true) {
    const entry = getVersionsPreloadEntry(trackId);
    if (entry) {
        entry.consumed = consumed;
    }
}

/** 显式刷新后写回缓存（标记 consumed） */
export function commitVersionsPreloadFetch(trackId, appVersion, { parsed = null, error = null } = {}) {
    if (trackId == null || trackId === '') {
        return;
    }

    const key = toCacheKey(trackId);
    const existing = versionsPreloadCache.get(key);

    versionsPreloadCache.set(key, {
        trackId: key,
        appVersion: existing?.appVersion ?? appVersion,
        promise: existing?.promise ?? null,
        parsed,
        error,
        consumed: true,
    });
}

/**
 * 同一 appId 只发起一次预加载；appVersion 变化时 invalidate 并重新加载
 * @param {() => Promise<*|null|undefined>} loadFn 返回 parsed 结果；返回空值表示跳过写入
 */
export function ensureVersionsPreload(trackId, appVersion, loadFn) {
    if (trackId == null || trackId === '') {
        return null;
    }

    const key = toCacheKey(trackId);
    let entry = versionsPreloadCache.get(key);

    if (entry && entry.appVersion !== appVersion) {
        versionsPreloadCache.delete(key);
        entry = null;
    }

    if (entry) {
        return entry;
    }

    entry = {
        trackId: key,
        appVersion,
        parsed: null,
        error: null,
        consumed: false,
        promise: null,
    };

    entry.promise = (async () => {
        try {
            const parsed = await loadFn();
            if (parsed != null) {
                entry.parsed = parsed;
            }
        } catch (error) {
            entry.error = error;
        }
    })();

    versionsPreloadCache.set(key, entry);
    return entry;
}

export function clearVersionsPreloadCache() {
    versionsPreloadCache.clear();
}
