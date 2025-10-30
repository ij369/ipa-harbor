const express = require('express');
const router = express.Router();

const setupHandler = require('./setup');
const loginHandler = require('./login');
const logoutHandler = require('./logout');
const statusHandler = require('./status');
const { authenticateToken, optionalAuth } = require('../../middleware/auth');

router.post('/setup', setupHandler);           // 初始设置（创建管理员账户）
router.post('/login', loginHandler);           // 管理员登录
router.post('/logout', authenticateToken, logoutHandler); // 管理员退出登录
router.get('/status', optionalAuth, statusHandler);       // 获取登录状态

module.exports = router;
