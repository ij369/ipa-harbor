const fs = require('fs');
const path = require('path');
const { countryCodeFromStoreFront } = require('./storefront');
const { getIpatoolAccount } = require('./ipatoolAccount');

const manualRegionsFile = path.join(__dirname, '../data/.ipatool/manual-regions.json');

// 用户手动指定的地区覆盖（email -> region）
global.userRegions = global.userRegions || new Map();

function loadManualRegions() {
    try {
        const raw = fs.readFileSync(manualRegionsFile, 'utf8');
        const stored = JSON.parse(raw);
        if (stored && typeof stored === 'object') {
            global.userRegions = new Map(Object.entries(stored));
        }
    } catch {
        // 文件不存在或损坏时忽略
    }
}

function persistManualRegions() {
    try {
        const dir = path.dirname(manualRegionsFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(manualRegionsFile, `${JSON.stringify(Object.fromEntries(global.userRegions), null, 2)}\n`);
    } catch (error) {
        console.warn('保存手动地区设置失败:', error.message);
    }
}

loadManualRegions();

async function getStoreRegionFromAccount() {
    const account = await getIpatoolAccount();
    if (!account) {
        return null;
    }

    const storeFront = account.storeFront || account.storefront;
    return countryCodeFromStoreFront(storeFront);
}

function getManualRegion(email) {
    if (!email) {
        return undefined;
    }

    return global.userRegions.get(email);
}

function setManualRegion(email, region) {
    if (!email) {
        return;
    }

    if (region) {
        global.userRegions.set(email, region);
    } else {
        global.userRegions.delete(email);
    }

    persistManualRegions();
}

/** 解析手动地区：keychain 可能无 email，单账号时回退到 Map 中唯一项 */
function resolveManualRegion(resolvedEmail) {
    if (resolvedEmail) {
        const manualRegion = getManualRegion(resolvedEmail);
        if (manualRegion) {
            return manualRegion;
        }
    }

    if (global.userRegions.size === 1) {
        return global.userRegions.values().next().value;
    }

    return undefined;
}

/**
 * 获取当前有效地区：手动指定优先，否则使用 Apple ID storefront
 */
async function getEffectiveRegion(email) {
    const account = await getIpatoolAccount();
    const resolvedEmail = email || account?.email || null;
    const storeRegion = countryCodeFromStoreFront(account?.storeFront || account?.storefront);
    const manualRegion = resolveManualRegion(resolvedEmail);

    if (manualRegion) {
        return manualRegion;
    }

    return storeRegion || null;
}

/**
 * 为 auth info / login 响应补充 region、storeRegion、regionSource
 */
async function enrichUserData(userData = {}) {
    const account = await getIpatoolAccount();
    const email = userData.email || account?.email || null;
    const storeRegion = countryCodeFromStoreFront(account?.storeFront || account?.storefront);
    const manualRegion = resolveManualRegion(email);
    const effectiveRegion = manualRegion || storeRegion || null;

    return {
        ...userData,
        email: email || userData.email,
        name: userData.name || account?.name,
        storeRegion: storeRegion || null,
        region: effectiveRegion,
        regionSource: manualRegion ? 'manual' : (storeRegion ? 'storefront' : null),
    };
}

module.exports = {
    enrichUserData,
    getEffectiveRegion,
    getStoreRegionFromAccount,
    getManualRegion,
    setManualRegion,
};
