const express = require('express');
const router = express.Router();

const setupHandler = require('./setup');
const loginHandler = require('./login');
const logoutHandler = require('./logout');
const statusHandler = require('./status');
const checkUpdateHandler = require('./checkUpdate');
const updateSettingsHandler = require('./settings');
const { authenticateToken, optionalAuth } = require('../../middleware/auth');
const setupRateLimit = require('../../middleware/setupRateLimit');

router.post('/setup', setupRateLimit, setupHandler);           // 初始设置（创建管理员账户）
router.post('/login', loginHandler);           // 管理员登录
router.post('/logout', authenticateToken, logoutHandler); // 管理员退出登录
router.get('/status', optionalAuth, statusHandler);       // 获取登录状态
router.get('/check-update', optionalAuth, checkUpdateHandler); // 检查 ipa-harbor 新版本
router.put('/settings', authenticateToken, updateSettingsHandler); // 更新应用设置

module.exports = router;
