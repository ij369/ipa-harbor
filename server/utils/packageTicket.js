const crypto = require('crypto');
const path = require('path');
const { loadJwtSecret } = require('./jwtSecret');
const { isValidIpaStorageFileName, isValidIpaStorageBaseName } = require('./ipaFileName');

const MANIFEST_TICKET_SCOPE = 'manifest';

/** ipa 下载 ticket 有效期，默认 1 天 */
const PACKAGE_TICKET_TTL_MS = parseInt(process.env.PACKAGE_TICKET_TTL_MS, 10) || 24 * 60 * 60 * 1000;
/** OTA manifest.plist ticket 有效期，默认 3 分钟（本机 Safari 安装通常足够） */
const MANIFEST_TICKET_TTL_MS = parseInt(process.env.MANIFEST_TICKET_TTL_MS, 10) || 3 * 60 * 1000;

function signPackageTicket(fileName, ttlMs = PACKAGE_TICKET_TTL_MS) {
    const baseName = path.basename(String(fileName || ''));
    const expiresAt = Math.floor((Date.now() + ttlMs) / 1000);
    const payload = `${baseName}:${expiresAt}`;
    const signature = crypto
        .createHmac('sha256', loadJwtSecret())
        .update(payload)
        .digest('base64url');

    return `${expiresAt}.${signature}`;
}

function verifyPackageTicket(fileName, ticket) {
    const baseName = path.basename(String(fileName || ''));
    if (!isValidIpaStorageFileName(baseName)) {
        return false;
    }

    const ticketText = String(ticket || '');
    const dotIndex = ticketText.indexOf('.');
    if (dotIndex <= 0) {
        return false;
    }

    const expiresAt = parseInt(ticketText.slice(0, dotIndex), 10);
    const signature = ticketText.slice(dotIndex + 1);
    if (!Number.isFinite(expiresAt) || !signature) {
        return false;
    }

    if (Math.floor(Date.now() / 1000) > expiresAt) {
        return false;
    }

    const payload = `${baseName}:${expiresAt}`;
    const expected = crypto
        .createHmac('sha256', loadJwtSecret())
        .update(payload)
        .digest('base64url');

    if (signature.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function buildPackageDownloadPath(fileName) {
    const baseName = path.basename(String(fileName || ''));
    const ticket = signPackageTicket(baseName);
    return `/v1/ipa/getpackage/${encodeURIComponent(baseName)}/${ticket}`;
}

function buildPackageDownloadUrl(req, fileName, { forceHttps = false } = {}) {
    const protocol = forceHttps
        ? 'https'
        : (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = req.get('host');
    return `${protocol}://${host}${buildPackageDownloadPath(fileName)}`;
}

function signManifestTicket(baseName, ttlMs = MANIFEST_TICKET_TTL_MS) {
    const normalizedBaseName = path.basename(String(baseName || '')).replace(/\.ipa$/i, '');
    const expiresAt = Math.floor((Date.now() + ttlMs) / 1000);
    const payload = `${MANIFEST_TICKET_SCOPE}:${normalizedBaseName}:${expiresAt}`;
    const signature = crypto
        .createHmac('sha256', loadJwtSecret())
        .update(payload)
        .digest('base64url');

    return `${expiresAt}.${signature}`;
}

function verifyManifestTicket(baseName, ticket) {
    const normalizedBaseName = path.basename(String(baseName || '')).replace(/\.ipa$/i, '');
    if (!isValidIpaStorageBaseName(normalizedBaseName)) {
        return false;
    }

    const ticketText = String(ticket || '');
    const dotIndex = ticketText.indexOf('.');
    if (dotIndex <= 0) {
        return false;
    }

    const expiresAt = parseInt(ticketText.slice(0, dotIndex), 10);
    const signature = ticketText.slice(dotIndex + 1);
    if (!Number.isFinite(expiresAt) || !signature) {
        return false;
    }

    if (Math.floor(Date.now() / 1000) > expiresAt) {
        return false;
    }

    const payload = `${MANIFEST_TICKET_SCOPE}:${normalizedBaseName}:${expiresAt}`;
    const expected = crypto
        .createHmac('sha256', loadJwtSecret())
        .update(payload)
        .digest('base64url');

    if (signature.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function buildManifestInstallPath(baseName) {
    const normalizedBaseName = path.basename(String(baseName || '')).replace(/\.ipa$/i, '');
    const ticket = signManifestTicket(normalizedBaseName);
    return `/v1/ipa/install-package/${encodeURIComponent(normalizedBaseName)}/${ticket}/manifest.plist`;
}

function buildManifestInstallUrl(req, baseName, { forceHttps = false } = {}) {
    const protocol = forceHttps
        ? 'https'
        : (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = req.get('host');
    return `${protocol}://${host}${buildManifestInstallPath(baseName)}`;
}

module.exports = {
    signPackageTicket,
    verifyPackageTicket,
    buildPackageDownloadPath,
    buildPackageDownloadUrl,
    signManifestTicket,
    verifyManifestTicket,
    buildManifestInstallPath,
    buildManifestInstallUrl,
};
