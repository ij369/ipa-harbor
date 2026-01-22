const express = require('express');
const router = express.Router();

const loginHandler = require('./login');
const infoHandler = require('./info');
const revokeHandler = require('./revoke');
const regionHandler = require('./region');

router.post('/login', loginHandler);
router.post('/info', infoHandler);
router.post('/revoke', revokeHandler);
router.post('/region', regionHandler);

module.exports = router;
