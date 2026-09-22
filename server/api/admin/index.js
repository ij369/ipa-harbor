const express = require('express');
const router = express.Router();

const setupHandler = require('./setup');
const recoverHandler = require('./recover');
const changePasswordHandler = require('./changePassword');
const loginHandler = require('./login');
const logoutHandler = require('./logout');
const statusHandler = require('./status');
const checkUpdateHandler = require('./checkUpdate');
const updateSettingsHandler = require('./settings');
const { authRouter: passkeyAuthRouter, manageRouter: passkeyManageRouter } = require('./passkey');
const {
    getLanHttpsHandler,
    updateLanHttpsHandler,
    renewLanHttpsHandler,
    downloadCaCertHandler,
} = require('./lanHttps');
const { authenticateToken, optionalAuth } = require('../../middleware/auth');
const setupRateLimit = require('../../middleware/setupRateLimit');

router.post('/setup', setupRateLimit, setupHandler);           // 初始设置（创建管理员账户）
router.post('/recover', setupRateLimit, recoverHandler);       // 管理员恢复（需 ADMIN_RECOVERY_ENABLED）
router.post('/change-password', authenticateToken, changePasswordHandler); // 修改登录密码
router.post('/login', loginHandler);           // 管理员登录
router.post('/logout', authenticateToken, logoutHandler); // 管理员退出登录
router.get('/status', optionalAuth, statusHandler);       // 获取登录状态
router.get('/check-update', optionalAuth, checkUpdateHandler); // 检查 ipa-harbor 新版本
router.put('/settings', authenticateToken, updateSettingsHandler); // 更新应用设置
router.get('/lan-https', optionalAuth, getLanHttpsHandler); // 获取 LAN HTTPS 状态
router.get('/lan-https/ca.crt', authenticateToken, downloadCaCertHandler); // 下载 LAN HTTPS CA 证书
router.put('/lan-https', authenticateToken, updateLanHttpsHandler); // 更新 LAN HTTPS 配置
router.post('/lan-https/renew', authenticateToken, renewLanHttpsHandler); // 续期 LAN HTTPS 证书
router.use('/passkey', passkeyAuthRouter);
router.use('/passkeys', passkeyManageRouter);

module.exports = router;
