const fs = require('fs');
const https = require('https');
const path = require('path');
const { isValidIpaStorageBaseName } = require('./ipaFileName');

const DATA_DIR = path.join(__dirname, '../data');

/** 从 512 逐步降档，114/144 为保底尺寸（57@2x） */
const DESCENDING_ICON_SIZES = [512, 256, 180, 144, 128, 114];

function readSidecarRawIconUrl(fileBase) {
    const normalized = String(fileBase || '').replace(/\.ipa$/i, '');
    if (!isValidIpaStorageBaseName(normalized)) {
        return null;
    }

    const jsonPath = path.join(DATA_DIR, `${normalized}.json`);
    if (!fs.existsSync(jsonPath)) {
        return null;
    }

    try {
        const metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const iconUrl = metadata?.softwareIcon57x57URL;
        return typeof iconUrl === 'string' && iconUrl.startsWith('http') ? iconUrl : null;
    } catch (error) {
        console.warn(`读取 sidecar 图标失败 ${normalized}:`, error.message);
        return null;
    }
}

function parseMzstaticIconUrl(iconUrl) {
    const match = iconUrl.match(/^(.+\/)(\d+)x(\d+)bb\.(jpe?g|png)$/i);
    if (!match) {
        return null;
    }

    return {
        prefix: match[1],
        ext: match[4].toLowerCase().replace('jpeg', 'jpg'),
        originalDim: parseInt(match[2], 10),
    };
}

function buildMzstaticIconUrlAtDimension(parsed, dim) {
    return `${parsed.prefix}${dim}x${dim}bb.${parsed.ext}`;
}

function buildProbeDimensions(requestedSize, originalDim) {
    const sizeNum = parseInt(requestedSize, 10);
    const sizes = [];

    if (Number.isFinite(sizeNum) && sizeNum > 512) {
        sizes.push(1024);
    }

    sizes.push(...DESCENDING_ICON_SIZES);

    if (Number.isFinite(originalDim) && originalDim > 0 && !sizes.includes(originalDim)) {
        sizes.push(originalDim);
    }

    return [...new Set(sizes)];
}

function probeIconUrl(url) {
    return new Promise((resolve) => {
        const request = https.request(url, { method: 'HEAD', timeout: 8000 }, (response) => {
            resolve(response.statusCode >= 200 && response.statusCode < 300);
            response.resume();
        });

        request.on('error', () => resolve(false));
        request.on('timeout', () => {
            request.destroy();
            resolve(false);
        });
        request.end();
    });
}

/**
 * 解析 sidecar 图标 URL：优先 512，不可用则逐步降档直至命中
 */
async function resolveSidecarIconUrl(fileBase, requestedSize) {
    const rawUrl = readSidecarRawIconUrl(fileBase);
    if (!rawUrl) {
        return null;
    }

    const parsed = parseMzstaticIconUrl(rawUrl);
    if (!parsed) {
        return (await probeIconUrl(rawUrl)) ? rawUrl : null;
    }

    const dimensions = buildProbeDimensions(requestedSize, parsed.originalDim);

    for (const dim of dimensions) {
        const candidateUrl = buildMzstaticIconUrlAtDimension(parsed, dim);
        if (await probeIconUrl(candidateUrl)) {
            return candidateUrl;
        }
    }

    return null;
}

module.exports = {
    readSidecarRawIconUrl,
    resolveSidecarIconUrl,
    parseMzstaticIconUrl,
    buildMzstaticIconUrlAtDimension,
    buildProbeDimensions,
};
