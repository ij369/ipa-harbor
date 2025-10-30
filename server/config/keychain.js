// keychain 配置模块
const NODE_ENV = process.env.NODE_ENV || 'development';
const KEYCHAIN_PASSPHRASE = process.env.KEYCHAIN_PASSPHRASE;

// 生产环境下检查 KEYCHAIN_PASSPHRASE
if (NODE_ENV === 'production' && (!KEYCHAIN_PASSPHRASE || KEYCHAIN_PASSPHRASE === '')) {
    console.error('请设置环境变量: KEYCHAIN_PASSPHRASE');
    process.exit(1);
}

module.exports = {
    KEYCHAIN_PASSPHRASE: KEYCHAIN_PASSPHRASE,
    NODE_ENV
};
