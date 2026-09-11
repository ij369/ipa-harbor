const { execFile } = require('child_process');
const path = require('path');
const { KEYCHAIN_PASSPHRASE } = require('../config/keychain');

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

module.exports = {
    IPATOOL_PATH,
    IPATOOL_EXEC_ENV,
    execIpatool,
};
