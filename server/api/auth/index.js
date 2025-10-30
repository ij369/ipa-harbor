const express = require('express');
const router = express.Router();

const loginHandler = require('./login');
const infoHandler = require('./info');
const revokeHandler = require('./revoke');

router.post('/login', loginHandler);
router.post('/info', infoHandler);
router.post('/revoke', revokeHandler);

module.exports = router;
