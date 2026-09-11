const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const database = require('./database');
const { normalizeStoredMetadata } = require('./ipaMetadata');
const { KEYCHAIN_PASSPHRASE } = require('../config/keychain');

const IPATOOL_PATH = path.join(__dirname, '../bin/ipatool');
const DATA_DIR = path.join(__dirname, '../data');
const FETCH_CONCURRENCY = 3;

function fetchVersionMetadataFromIpatool(appId, externalVersionId) {
    return new Promise((resolve, reject) => {
        const command = [
            `"${IPATOOL_PATH}"`,
            'get-version-metadata',
            '-i', `"${appId}"`,
            '--external-version-id', `"${externalVersionId}"`,
            '--keychain-passphrase', `"${KEYCHAIN_PASSPHRASE}"`,
            '--non-interactive',
            '--format', 'json',
        ].join(' ');

        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            const output = `${stdout || ''}${stderr || ''}`;

            if (output.includes('password token is expired')) {
                reject(Object.assign(new Error('密码令牌已过期，请重新登录'), { errorType: 'TOKEN_EXPIRED' }));
                return;
            }

            if (output.includes('HTTP 429') || output.includes('rate limited by Apple')) {
                reject(Object.assign(new Error('Apple 请求过于频繁，请稍后再试'), { errorType: 'RATE_LIMITED' }));
                return;
            }

            if (error) {
                reject(new Error(error.message || stderr || 'get-version-metadata 失败'));
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                if (!parsed.success) {
                    reject(new Error(parsed.error || 'get-version-metadata 返回失败'));
                    return;
                }

                resolve({
                    externalVersionID: String(parsed.externalVersionID || externalVersionId),
                    displayVersion: parsed.displayVersion || null,
                    releaseDate: parsed.releaseDate || null,
                });
            } catch (parseError) {
                reject(new Error(`解析 get-version-metadata 响应失败: ${parseError.message}`));
            }
        });
    });
}

async function upsertVersionMetadataRecord({
    appId,
    versionId,
    bundleId = null,
    displayVersion = null,
    releaseDate = null,
    appleMetadata = null,
    ipaMetadata = null,
}) {
    return database.upsertAppVersionMetadata({
        appId: String(appId),
        versionId: String(versionId),
        bundleId,
        displayVersion,
        releaseDate,
        appleMetadata,
        ipaMetadata,
    });
}

async function ensureVersionMetadataCached(appId, versionIds, { fetchMissing = false, maxFetch = 0 } = {}) {
    const normalizedAppId = String(appId);
    const ids = versionIds.map((id) => String(id));
    let cachedRows = await database.getAppVersionMetadataByAppId(normalizedAppId);
    const cacheMap = new Map(cachedRows.map((row) => [String(row.version_id), row]));

    if (fetchMissing) {
        const missing = ids.filter((versionId) => {
            const row = cacheMap.get(versionId);
            if (row?.release_date) {
                return false;
            }
            if (row?.apple_metadata?.fetchFailed) {
                return false;
            }
            return true;
        });

        const toFetch = maxFetch > 0 ? missing.slice(0, maxFetch) : missing;

        for (let index = 0; index < toFetch.length; index += FETCH_CONCURRENCY) {
            const batch = toFetch.slice(index, index + FETCH_CONCURRENCY);
            await Promise.all(batch.map(async (versionId) => {
                try {
                    const appleMetadata = await fetchVersionMetadataFromIpatool(normalizedAppId, versionId);
                    await upsertVersionMetadataRecord({
                        appId: normalizedAppId,
                        versionId,
                        displayVersion: appleMetadata.displayVersion,
                        releaseDate: appleMetadata.releaseDate,
                        appleMetadata,
                    });
                } catch (error) {
                    console.warn(`获取版本 ${normalizedAppId}/${versionId} 元数据失败:`, error.message);
                    await upsertVersionMetadataRecord({
                        appId: normalizedAppId,
                        versionId,
                        appleMetadata: {
                            fetchFailed: true,
                            failedAt: new Date().toISOString(),
                            error: error.message,
                        },
                    });
                }
            }));
        }

        if (toFetch.length > 0) {
            cachedRows = await database.getAppVersionMetadataByAppId(normalizedAppId);
            cachedRows.forEach((row) => cacheMap.set(String(row.version_id), row));
        }
    }

    return ids.map((versionId) => {
        const row = cacheMap.get(versionId);
        return {
            versionId,
            bundleVersion: row?.display_version && row.display_version !== '未知' ? row.display_version : null,
            releaseDate: row?.release_date || null,
        };
    });
}

function mergeAppleMetadataIntoSidecar(appId, versionId, appleMetadata) {
    const jsonPath = path.join(DATA_DIR, `${appId}_${versionId}.json`);
    if (!fs.existsSync(jsonPath)) {
        return false;
    }

    try {
        const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        existing.appleVersionMetadata = {
            ...appleMetadata,
            fetchedAt: new Date().toISOString(),
        };
        fs.writeFileSync(jsonPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
        return true;
    } catch (error) {
        console.warn(`更新 sidecar Apple 元数据失败 ${appId}_${versionId}:`, error.message);
        return false;
    }
}

async function refreshVersionMetadata(appId, versionId, {
    bundleId = null,
    ipaMetadata = null,
    updateSidecar = true,
} = {}) {
    const normalizedAppId = String(appId);
    const normalizedVersionId = String(versionId);
    const appleMetadata = await fetchVersionMetadataFromIpatool(normalizedAppId, normalizedVersionId);

    await upsertVersionMetadataRecord({
        appId: normalizedAppId,
        versionId: normalizedVersionId,
        bundleId,
        displayVersion: appleMetadata.displayVersion,
        releaseDate: appleMetadata.releaseDate,
        appleMetadata,
        ipaMetadata,
    });

    if (updateSidecar) {
        mergeAppleMetadataIntoSidecar(normalizedAppId, normalizedVersionId, appleMetadata);
    }

    return {
        versionId: normalizedVersionId,
        bundleVersion: appleMetadata.displayVersion || null,
        releaseDate: appleMetadata.releaseDate || null,
        appleMetadata,
    };
}

async function tryRefreshVersionMetadata(appId, versionId, options = {}) {
    try {
        return await refreshVersionMetadata(appId, versionId, options);
    } catch (error) {
        console.warn(`可选 Apple 版本元数据获取失败 ${appId}/${versionId}:`, error.message);
        return null;
    }
}

async function migrateExistingJsonSidecars() {
    if (!fs.existsSync(DATA_DIR)) {
        return 0;
    }

    const jsonFiles = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith('.json'));
    let migratedCount = 0;

    for (const jsonFile of jsonFiles) {
        const match = jsonFile.match(/^(\d+)_(.+)\.json$/);
        if (!match) {
            continue;
        }

        const appId = match[1];
        const versionId = match[2];
        const jsonPath = path.join(DATA_DIR, jsonFile);

        try {
            const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const metadata = normalizeStoredMetadata(raw);
            const appleFromSidecar = raw.appleVersionMetadata || null;
            let needsRewrite = Object.prototype.hasOwnProperty.call(raw, 'releaseDate');

            if (needsRewrite) {
                const sidecar = {
                    ...metadata,
                    ...(appleFromSidecar ? { appleVersionMetadata: appleFromSidecar } : {}),
                };
                fs.writeFileSync(jsonPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
            }

            const existing = await database.getAppVersionMetadata(appId, versionId);
            // 仅首次入库；已有记录则跳过（即使 release_date 为空，也不重复 upsert）
            if (!existing) {
                await upsertVersionMetadataRecord({
                    appId,
                    versionId,
                    bundleId: metadata.softwareVersionBundleId || null,
                    displayVersion: appleFromSidecar?.displayVersion || metadata.bundleShortVersionString || null,
                    releaseDate: appleFromSidecar?.releaseDate || null,
                    appleMetadata: appleFromSidecar,
                    ipaMetadata: metadata,
                });
                migratedCount += 1;
            }
        } catch (error) {
            console.warn(`迁移 sidecar 失败 ${jsonFile}:`, error.message);
        }
    }

    if (migratedCount > 0) {
        console.log(`已从 sidecar 迁移 ${migratedCount} 条版本元数据到 SQLite`);
    }

    return migratedCount;
}

module.exports = {
    fetchVersionMetadataFromIpatool,
    upsertVersionMetadataRecord,
    ensureVersionMetadataCached,
    migrateExistingJsonSidecars,
    mergeAppleMetadataIntoSidecar,
    refreshVersionMetadata,
    tryRefreshVersionMetadata,
};
