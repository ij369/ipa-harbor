const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const searchHandler = require('./search.js');
const purchaseHandler = require('./purchase.js');
const { versionsHandler } = require('./versions.js');
const downloadHandler = require('./download.js');
const detailsHandler = require('./details.js');
const { getAppIcon, getAppIconUrl } = require('./icon.js');

router.get('/search', authenticateToken, searchHandler);
router.get('/icon/:appid', getAppIcon); // 获取图标，不需要管理员认证
router.get('/icon-url/:appid/:size', getAppIconUrl); // 获取图标URL，不需要管理员认证
router.post('/details', authenticateToken, detailsHandler);
router.post('/:bundleId/purchase', authenticateToken, purchaseHandler);
router.post('/:appId/versions', authenticateToken, versionsHandler);
router.post('/:appId/:versionId', authenticateToken, downloadHandler);

module.exports = router;
