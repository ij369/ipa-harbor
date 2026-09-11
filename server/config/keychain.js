// keychain 配置模块
const NODE_ENV = process.env.NODE_ENV || 'development';
const KEYCHAIN_PASSPHRASE = process.env.KEYCHAIN_PASSPHRASE;

// 生产环境下检查 KEYCHAIN_PASSPHRASE
if (NODE_ENV === 'production' && (!KEYCHAIN_PASSPHRASE || KEYCHAIN_PASSPHRASE === '')) {
    console.error('Please set environment variable: KEYCHAIN_PASSPHRASE');
    console.error(`For security, generate a random string, e.g.:\nopenssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10; echo\n`);
    console.error(`Then set environment variable: KEYCHAIN_PASSPHRASE=<generated-string>\n`);
    process.exit(1);
}

module.exports = {
    KEYCHAIN_PASSPHRASE: KEYCHAIN_PASSPHRASE,
    NODE_ENV
};
