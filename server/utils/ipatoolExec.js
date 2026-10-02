const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { KEYCHAIN_PASSPHRASE } = require('../config/keychain');

const execFileAsync = promisify(execFile);

const IPATOOL_PATH = path.join(__dirname, '../bin/ipatool');

/** Linux Docker 无 GUI keyring 时避免 dbus 阻塞 */
const IPATOOL_EXEC_ENV = {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || 'unix:path=/nonexistent',
};

function appendCommonArgs(args) {
    return [
        ...args,
        '--keychain-passphrase', KEYCHAIN_PASSPHRASE ?? '',
        '--non-interactive',
        '--format', 'json',
    ];
}

/**
 * 以参数数组执行 ipatool（不经过 shell）
 * @param {string[]} args - 子命令及参数（不含公共 flag）
 * @param {{ timeout?: number, env?: NodeJS.ProcessEnv, maxBuffer?: number }} options
 * @returns {Promise<{ error: Error | null, stdout: string, stderr: string }>}
 */
function execIpatool(args, options = {}) {
    const {
        timeout = 30000,
        env = IPATOOL_EXEC_ENV,
        maxBuffer = 10 * 1024 * 1024,
    } = options;

    return new Promise((resolve) => {
        execFile(
            IPATOOL_PATH,
            appendCommonArgs(args),
            { timeout, env, maxBuffer },
            (error, stdout, stderr) => {
                resolve({
                    error: error || null,
                    stdout: stdout ?? '',
                    stderr: stderr ?? '',
                });
            }
        );
    });
}

/** @type {string | null} 启动时探测 ipatool --version 后缓存 */
let ipatoolVersion = null;

async function probeIpatoolVersion() {
    try {
        const { stdout, stderr } = await execFileAsync(IPATOOL_PATH, ['--version'], {
            env: IPATOOL_EXEC_ENV,
            timeout: 15000,
            maxBuffer: 8192,
        });
        const line = (stdout || stderr || '').trim().split('\n').find(Boolean) || '';
        ipatoolVersion = line.match(/version\s+(\S+)/i)?.[1] || line || null;
        if (process.env.ENABLE_MORE_LOGS === 'true') {
            console.log('\x1b[32mipatool -v:\x1b[33m', ipatoolVersion, '\x1b[0m');
        }
        if (!ipatoolVersion) {
            throw new Error('empty version');
        }
    } catch {
        ipatoolVersion = null;
        console.error('\x1b[31mFailed to verify ipatool dependency\x1b[0m');
    }
    return ipatoolVersion;
}

function getIpatoolVersion() {
    return ipatoolVersion;
}

module.exports = {
    IPATOOL_PATH,
    IPATOOL_EXEC_ENV,
    execIpatool,
    probeIpatoolVersion,
    getIpatoolVersion,
};
