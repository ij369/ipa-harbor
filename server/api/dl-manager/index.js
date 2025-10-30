const express = require('express');
const router = express.Router();

const tasksHandler = require('./tasks');
const deleteHandler = require('./delete');
const filesHandler = require('./files');
const progressHandler = require('./progress');

router.get('/tasks', tasksHandler);           // 获取任务列表
router.get('/progress', progressHandler);     // 获取实时进度
router.delete('/tasks/delete', deleteHandler);       // 删除任务
router.get('/files', filesHandler);          // 获取文件列表

module.exports = router;
