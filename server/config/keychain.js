// keychain 配置模块
const NODE_ENV = process.env.NODE_ENV || 'development';
const KEYCHAIN_PASSPHRASE = process.env.KEYCHAIN_PASSPHRASE;

// 生产环境下检查 KEYCHAIN_PASSPHRASE
if (NODE_ENV === 'production' && (!KEYCHAIN_PASSPHRASE || KEYCHAIN_PASSPHRASE === '')) {
    console.error('请设置环境变量: KEYCHAIN_PASSPHRASE');
    console.error(`出于安全考虑，建议随机生成一个字符串，可以执行: \nopenssl rand -base64 15 | tr -dc 'A-Za-z0-9' | head -c10; echo\n`);
    console.error(`然后设置环境变量: KEYCHAIN_PASSPHRASE=随机生成的字符串\n`);
    process.exit(1);
}

module.exports = {
    KEYCHAIN_PASSPHRASE: KEYCHAIN_PASSPHRASE,
    NODE_ENV
};
