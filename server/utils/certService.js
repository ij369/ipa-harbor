const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
    getCaDir,
    getSubnetIps,
    getLanConfig,
    isAllowLanAccessEnabled,
    formatLanUrl,
} = require('./lanConfig');

const CA_VALID_DAYS = 50 * 365;
const SERVER_VALID_DAYS = 365;
const RENEW_BEFORE_DAYS = 30;

function isAutoCertEnabled() {
    return process.env.ENABLE_AUTO_CERT === 'true';
}

function getPaths() {
    const caDir = getCaDir();
    return {
        caDir,
        caKey: path.join(caDir, 'ca.key'),
        caCrt: path.join(caDir, 'ca.crt'),
        serverKey: path.join(caDir, 'server.key'),
        serverCrt: path.join(caDir, 'server.crt'),
        serverMeta: path.join(caDir, 'server.meta.json'),
        opensslCnf: path.join(caDir, 'server-openssl.cnf'),
    };
}

function ensureCaDir() {
    const { caDir } = getPaths();
    if (!fs.existsSync(caDir)) {
        fs.mkdirSync(caDir, { recursive: true, mode: 0o755 });
    }
}

function runOpenSsl(args) {
    execFileSync('openssl', args, { stdio: 'pipe' });
}

function getCaFingerprint() {
    const { caCrt } = getPaths();
    if (!fs.existsSync(caCrt)) {
        return null;
    }
    const fingerprint = execFileSync('openssl', ['x509', '-in', caCrt, '-noout', '-fingerprint', '-sha256'], {
        encoding: 'utf8',
    }).trim();
    return fingerprint.replace(/^sha256 Fingerprint=/i, '');
}

function ensureRootCa() {
    ensureCaDir();
    const { caKey, caCrt } = getPaths();

    if (fs.existsSync(caKey) && fs.existsSync(caCrt)) {
        return { created: false, fingerprint: getCaFingerprint() };
    }

    runOpenSsl(['genrsa', '-out', caKey, '4096']);
    fs.chmodSync(caKey, 0o600);

    runOpenSsl([
        'req', '-x509', '-new', '-nodes',
        '-key', caKey,
        '-sha256',
        '-days', String(CA_VALID_DAYS),
        '-out', caCrt,
        '-subj', '/CN=IPA Harbor LAN CA/O=IPA Harbor',
    ]);

    const fingerprint = getCaFingerprint();
    console.log('已生成局域网 Root CA 证书：');
    console.log(`  路径: ${caCrt}`);
    console.log(`  SHA-256: ${fingerprint}`);
    console.log('  请在 iPhone / Mac 上安装并信任此 CA 后，再访问 HTTPS 局域网地址。');

    return { created: true, fingerprint };
}

function buildOpenSslConfig(lanIp, lanHostname) {
    const altNames = [];
    let dnsIndex = 1;
    let ipIndex = 1;

    if (lanHostname && lanHostname !== 'localhost') {
        altNames.push(`DNS.${dnsIndex} = ${lanHostname}`);
        dnsIndex += 1;
    }
    altNames.push(`DNS.${dnsIndex} = localhost`);

    for (const ip of getSubnetIps(lanIp)) {
        altNames.push(`IP.${ipIndex} = ${ip}`);
        ipIndex += 1;
    }

    return `[ req ]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[ dn ]
CN = IPA Harbor LAN

[ req_ext ]
subjectAltName = @alt_names

[ alt_names ]
${altNames.join('\n')}
`;
}

function readServerMeta() {
    const { serverMeta } = getPaths();
    if (!fs.existsSync(serverMeta)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(serverMeta, 'utf8'));
    } catch {
        return null;
    }
}

function writeServerMeta(lanIp, lanHostname) {
    const { serverMeta } = getPaths();
    fs.writeFileSync(serverMeta, `${JSON.stringify({
        lanIp,
        lanHostname,
        issuedAt: new Date().toISOString(),
    }, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
}

function getServerCertInfo() {
    const { serverCrt } = getPaths();
    if (!fs.existsSync(serverCrt)) {
        return null;
    }

    const cert = new crypto.X509Certificate(fs.readFileSync(serverCrt, 'utf8'));
    const validTo = new Date(cert.validTo);
    const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    return {
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        daysRemaining,
        subjectAltName: cert.subjectAltName,
    };
}

function shouldRenewServerCert(lanIp, lanHostname) {
    const { serverCrt, serverKey } = getPaths();
    if (!fs.existsSync(serverCrt) || !fs.existsSync(serverKey)) {
        return true;
    }

    const meta = readServerMeta();
    if (!meta || meta.lanIp !== lanIp || meta.lanHostname !== lanHostname) {
        return true;
    }

    const info = getServerCertInfo();
    if (!info) {
        return true;
    }

    return info.daysRemaining <= RENEW_BEFORE_DAYS;
}

function generateServerCert(lanIp, lanHostname) {
    ensureRootCa();
    const paths = getPaths();
    const opensslConfig = buildOpenSslConfig(lanIp, lanHostname);
    fs.writeFileSync(paths.opensslCnf, opensslConfig, { encoding: 'utf8', mode: 0o644 });

    runOpenSsl(['genrsa', '-out', paths.serverKey, '2048']);
    fs.chmodSync(paths.serverKey, 0o600);

    runOpenSsl([
        'req', '-new',
        '-key', paths.serverKey,
        '-out', path.join(paths.caDir, 'server.csr'),
        '-config', paths.opensslCnf,
    ]);

    runOpenSsl([
        'x509', '-req',
        '-in', path.join(paths.caDir, 'server.csr'),
        '-CA', paths.caCrt,
        '-CAkey', paths.caKey,
        '-CAcreateserial',
        '-out', paths.serverCrt,
        '-days', String(SERVER_VALID_DAYS),
        '-sha256',
        '-extfile', paths.opensslCnf,
        '-extensions', 'req_ext',
    ]);

    writeServerMeta(lanIp, lanHostname);

    const info = getServerCertInfo();
    console.log('已签发局域网 TLS 服务器证书：');
    console.log(`  路径: ${paths.serverCrt}`);
    console.log(`  主机名: ${lanHostname}`);
    console.log(`  LAN IP: ${lanIp}`);
    console.log(`  有效期至: ${info?.validTo || 'unknown'}`);
    console.log(`  SAN: DNS ${lanHostname}, /24 (${getSubnetIps(lanIp).length} IPs)`);

    return getServerCertMaterial();
}

function bootstrapAutoCert() {
    if (!isAutoCertEnabled()) {
        return null;
    }

    const { lanIp, lanHostname } = getLanConfig();
    if (!lanIp) {
        return null;
    }

    ensureRootCa();

    if (shouldRenewServerCert(lanIp, lanHostname)) {
        return generateServerCert(lanIp, lanHostname);
    }

    return getServerCertMaterial();
}

function getServerCertMaterial() {
    const { serverKey, serverCrt } = getPaths();
    if (!fs.existsSync(serverKey) || !fs.existsSync(serverCrt)) {
        return null;
    }

    return {
        key: fs.readFileSync(serverKey),
        cert: fs.readFileSync(serverCrt),
    };
}

function getCaCertPem() {
    const { caCrt } = getPaths();
    if (!fs.existsSync(caCrt)) {
        return null;
    }
    return fs.readFileSync(caCrt, 'utf8');
}

function getLanHttpsStatus() {
    const { lanHostname, lanIp } = getLanConfig();
    const enabled = isAutoCertEnabled();
    const certInfo = getServerCertInfo();
    const httpsPort = Number(process.env.HTTPS_PORT || 3443);
    const httpPort = Number(process.env.PORT || 3080);

    const buildUrl = (protocol) => {
        if (!lanIp) {
            return null;
        }
        return formatLanUrl(protocol, lanIp, protocol === 'https' ? httpsPort : httpPort);
    };

    const buildHostnameUrl = (protocol) => {
        if (!lanHostname || lanHostname === 'localhost') {
            return null;
        }
        return formatLanUrl(protocol, lanHostname, protocol === 'https' ? httpsPort : httpPort);
    };

    return {
        enableAutoCert: enabled,
        allowLanAccess: isAllowLanAccessEnabled(),
        lanHostname,
        lanIp,
        httpsPort,
        httpPort,
        caReady: Boolean(getCaCertPem()),
        serverCertReady: Boolean(getServerCertMaterial()),
        caFingerprint: getCaFingerprint(),
        certInfo,
        needsRenew: lanIp ? shouldRenewServerCert(lanIp, lanHostname) : false,
        httpUrl: buildUrl('http'),
        httpsUrl: buildUrl('https'),
        httpsHostnameUrl: buildHostnameUrl('https'),
    };
}

module.exports = {
    isAutoCertEnabled,
    bootstrapAutoCert,
    generateServerCert,
    getServerCertMaterial,
    getCaCertPem,
    getCaFingerprint,
    getLanHttpsStatus,
    shouldRenewServerCert,
    getServerCertInfo,
    RENEW_BEFORE_DAYS,
};
