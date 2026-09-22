const fs = require('fs');
const path = require('path');

const ipatoolDir = path.join(__dirname, '../data/.ipatool');
const lanHostnameFile = path.join(ipatoolDir, 'LAN_HOSTNAME');
const lanIpFile = path.join(ipatoolDir, 'LAN_IP');

const DEFAULT_HOSTNAME = 'localhost';

function ensureDir() {
    if (!fs.existsSync(ipatoolDir)) {
        fs.mkdirSync(ipatoolDir, { recursive: true });
    }
}

function isValidPort(port) {
    const value = Number(port);
    return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isValidIpv4(ip) {
    const parts = String(ip).trim().split('.');
    if (parts.length !== 4) {
        return false;
    }
    return parts.every((part) => {
        const value = Number(part);
        return Number.isInteger(value) && value >= 0 && value <= 255;
    });
}

function readFileValue(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    const stored = fs.readFileSync(filePath, 'utf8').trim();
    return stored || null;
}

function writeFileValue(filePath, value) {
    ensureDir();
    fs.writeFileSync(filePath, `${value}\n`, { encoding: 'utf8', mode: 0o644 });
}

function loadLanHostname() {
    const fromEnv = (process.env.LAN_HOSTNAME || '').trim();
    if (fromEnv) {
        writeFileValue(lanHostnameFile, fromEnv);
        return fromEnv;
    }

    const fromFile = readFileValue(lanHostnameFile);
    if (fromFile) {
        return fromFile;
    }

    writeFileValue(lanHostnameFile, DEFAULT_HOSTNAME);
    return DEFAULT_HOSTNAME;
}

function loadLanIp() {
    const fromEnv = (process.env.LAN_IP || '').trim();
    if (fromEnv) {
        if (!isValidIpv4(fromEnv)) {
            return null;
        }
        writeFileValue(lanIpFile, fromEnv);
        return fromEnv;
    }

    const fromFile = readFileValue(lanIpFile);
    if (fromFile && isValidIpv4(fromFile)) {
        return fromFile;
    }

    return null;
}

function getLanConfig() {
    return {
        lanHostname: loadLanHostname(),
        lanIp: loadLanIp(),
    };
}

function saveLanConfig({ lanHostname, lanIp }) {
    if (lanHostname != null) {
        const hostname = String(lanHostname).trim() || DEFAULT_HOSTNAME;
        writeFileValue(lanHostnameFile, hostname);
        process.env.LAN_HOSTNAME = hostname;
    }

    if (lanIp != null) {
        const ip = String(lanIp).trim();
        if (!isValidIpv4(ip)) {
            const err = new Error('LAN_IP 格式无效');
            err.code = 'LAN_IP_INVALID';
            throw err;
        }
        writeFileValue(lanIpFile, ip);
        process.env.LAN_IP = ip;
    }

    return getLanConfig();
}

/** 根据 LAN_IP 生成 /24 网段 IP 列表（1-254） */
function getSubnetIps(lanIp) {
    const parts = lanIp.split('.').map(Number);
    const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
    const ips = [];
    for (let host = 1; host <= 254; host += 1) {
        ips.push(`${prefix}${host}`);
    }
    return ips;
}

function warnIfLanIpMissing() {
    const { lanIp } = getLanConfig();
    if (!lanIp) {
        console.warn('需要设置主机名（LAN_HOSTNAME）以及主机 IP（LAN_IP）后，才能启用局域网自动 HTTPS 证书。');
        return false;
    }
    return true;
}

function normalizeHostname(hostname) {
    return String(hostname || '').trim().toLowerCase();
}

function hostnameMatches(actual, expected) {
    if (!expected) {
        return false;
    }
    return normalizeHostname(actual) === normalizeHostname(expected);
}

function defaultPortForProtocol(protocol) {
    return protocol === 'https:' ? '443' : '80';
}

/** 比较 Origin 是否等价（主机名不区分大小写，mDNS .local 常见大小写差异） */
function originsMatch(actualOrigin, allowedOrigin) {
    try {
        const actual = new URL(actualOrigin);
        const allowed = new URL(allowedOrigin);
        const actualPort = actual.port || defaultPortForProtocol(actual.protocol);
        const allowedPort = allowed.port || defaultPortForProtocol(allowed.protocol);
        return actual.protocol === allowed.protocol
            && normalizeHostname(actual.hostname) === normalizeHostname(allowed.hostname)
            && actualPort === allowedPort;
    } catch {
        return actualOrigin === allowedOrigin;
    }
}

function isOriginAllowed(origin, allowedOrigins) {
    return allowedOrigins.some((allowed) => originsMatch(origin, allowed));
}

function buildLanHttpsWebAuthnRpId(lanHostname) {
    const hostname = String(lanHostname || '').trim();
    if (hostname && hostname !== 'localhost') {
        return hostname.replace(/\.local$/i, '');
    }
    return 'localhost';
}

function formatLanUrl(protocol, host, port) {
    const value = Number(port);
    const isDefault = (protocol === 'http' && value === 80)
        || (protocol === 'https' && value === 443);
    if (isDefault) {
        return `${protocol}://${host}`;
    }
    return `${protocol}://${host}:${value}`;
}

function buildLanHttpsWebAuthnOrigins({
    lanIp,
    lanHostname,
    httpPort,
    httpsPort,
} = {}) {
    const config = getLanConfig();
    const ip = lanIp || config.lanIp;
    const hostname = lanHostname != null ? lanHostname : config.lanHostname;
    const http = httpPort || Number(process.env.PORT || 3080);
    const https = httpsPort || Number(process.env.HTTPS_PORT || 3443);

    const origins = [
        formatLanUrl('http', '127.0.0.1', http),
        formatLanUrl('http', 'localhost', http),
        formatLanUrl('https', '127.0.0.1', https),
        formatLanUrl('https', 'localhost', https),
    ];

    if (ip) {
        origins.push(formatLanUrl('http', ip, http), formatLanUrl('https', ip, https));
    }
    if (hostname && hostname !== 'localhost') {
        origins.push(formatLanUrl('http', hostname, http), formatLanUrl('https', hostname, https));
    }

    return origins.join(',');
}

function applyLanHttpsWebAuthnEnv(options = {}) {
    process.env.WEBAUTHN_ALLOWED_ORIGINS = buildLanHttpsWebAuthnOrigins(options);
    const hostname = options.lanHostname != null
        ? options.lanHostname
        : getLanConfig().lanHostname;
    process.env.WEBAUTHN_RP_ID = buildLanHttpsWebAuthnRpId(hostname);
}

function getWebAuthnAllowedOrigins() {
    return (process.env.WEBAUTHN_ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function isAllowLanAccessEnabled() {
    return process.env.ALLOW_LAN_ACCESS === 'true';
}

module.exports = {
    DEFAULT_HOSTNAME,
    getLanConfig,
    saveLanConfig,
    getSubnetIps,
    isValidIpv4,
    isValidPort,
    warnIfLanIpMissing,
    normalizeHostname,
    hostnameMatches,
    originsMatch,
    isOriginAllowed,
    buildLanHttpsWebAuthnRpId,
    formatLanUrl,
    buildLanHttpsWebAuthnOrigins,
    applyLanHttpsWebAuthnEnv,
    getWebAuthnAllowedOrigins,
    isAllowLanAccessEnabled,
    getCaDir: () => path.join(ipatoolDir, 'ca'),
};
