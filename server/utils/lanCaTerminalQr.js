const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { saveLanConfig, isValidIpv4, getCaDir, formatLanUrl } = require('./lanConfig');

const TERMINAL_QR_FILENAME = 'LAN_CA_TERMINAL_QR.txt';

function getTerminalQrFilePath() {
    return path.join(getCaDir(), TERMINAL_QR_FILENAME);
}

function buildCaInstallPageUrl({ lanIp, httpPort }) {
    const ip = String(lanIp || '').trim();
    const port = Number(httpPort) || Number(process.env.PORT || 3080);
    if (!isValidIpv4(ip)) {
        return null;
    }
    return `${formatLanUrl('http', ip, port)}/lan-ca`;
}

function generateTerminalQrText(text) {
    return new Promise((resolve, reject) => {
        try {
            qrcode.generate(text, { small: true }, (qr) => resolve(qr));
        } catch (error) {
            reject(error);
        }
    });
}

function ensureCaDir() {
    const caDir = getCaDir();
    if (!fs.existsSync(caDir)) {
        fs.mkdirSync(caDir, { recursive: true });
    }
}

function writeTerminalQrFile(qrText) {
    ensureCaDir();
    fs.writeFileSync(getTerminalQrFilePath(), `${qrText}\n`, { encoding: 'utf8', mode: 0o644 });
}

function removeTerminalQrFile() {
    const filePath = getTerminalQrFilePath();
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

async function refreshLanCaTerminalQr({ lanIp, lanHostname, httpPort }) {
    const ip = String(lanIp || '').trim();
    if (!isValidIpv4(ip)) {
        removeTerminalQrFile();
        return null;
    }

    const installUrl = buildCaInstallPageUrl({ lanIp: ip, httpPort });
    if (!installUrl) {
        removeTerminalQrFile();
        return null;
    }

    const qrText = await generateTerminalQrText(installUrl);
    writeTerminalQrFile(qrText);

    return {
        installUrl,
        qrText,
        lanIp: ip,
        lanHostname: lanHostname != null ? String(lanHostname).trim() : undefined,
    };
}

async function renderAndPersistLanCaTerminalQr({ lanIp, lanHostname, httpPort }) {
    const ip = String(lanIp || '').trim();
    const hostname = lanHostname != null ? String(lanHostname).trim() : '';

    if (!isValidIpv4(ip)) {
        return null;
    }

    saveLanConfig({
        lanIp: ip,
        ...(hostname ? { lanHostname: hostname } : {}),
    });

    return refreshLanCaTerminalQr({
        lanIp: ip,
        lanHostname: hostname,
        httpPort,
    });
}

function getDefaultHttpPort() {
    return Number(process.env.PORT || 3080);
}

function parseCliArgs(argv) {
    const options = {};
    for (let index = 2; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--lan-ip' && next && !next.startsWith('--')) {
            options.lanIp = next;
            index += 1;
            continue;
        }
        if (arg === '--lan-hostname') {
            if (next && !next.startsWith('--')) {
                options.lanHostname = next;
                index += 1;
            } else {
                options.lanHostname = '';
            }
            continue;
        }
        if (arg === '--http-port' && next && !next.startsWith('--')) {
            options.httpPort = next;
            index += 1;
        }
    }
    return options;
}

async function runCli() {
    const { lanIp, lanHostname, httpPort } = parseCliArgs(process.argv);
    if (!lanIp || !httpPort) {
        process.exitCode = 1;
        return;
    }

    const result = await renderAndPersistLanCaTerminalQr({
        lanIp,
        lanHostname,
        httpPort,
    });

    if (!result) {
        process.exitCode = 1;
        return;
    }

    process.stdout.write(`URL: ${result.installUrl}\n\n${result.qrText}\n`);
}

module.exports = {
    refreshLanCaTerminalQr,
    getDefaultHttpPort,
};

if (require.main === module) {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    runCli().catch((error) => {
        console.error('生成终端 QR 失败:', error);
        process.exitCode = 1;
    });
}
