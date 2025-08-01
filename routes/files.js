const express = require('express');
const fs = require('fs');
const { auth, opAuth } = require('../middleware/auth');
const { serverConfig } = require('../config');

const router = express.Router();

const VIDEO_TYPE = 'video/webm';

/**
 * 处理范围请求
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {string} fileName - 文件名
 * @param {number} fileSize - 文件大小
 */
const handleRangeRequest = (req, res, fileName, fileSize) => {
    const range = req.headers.range;
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    
    if (start >= fileSize) {
        res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
        return;
    }
    
    const chunkSize = (end - start) + 1;
    const file = fs.createReadStream(fileName, { start, end });
    const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': VIDEO_TYPE
    };
    res.writeHead(206, head);
    file.pipe(res);
};

// 视频文件服务
router.get('/video/:name', auth, opAuth, function (req, res) {
    const names = req.params.name.split('-');
    const path = serverConfig.savePath + '/' + names[0] + '/';
    const fileName = path + req.params.name;

    if (!fs.existsSync(fileName)) {
        res.status(404).send('File does not exist!');
        return;
    }

    const stat = fs.statSync(fileName);
    const fileSize = stat.size;

    if (req.headers.range) {
        handleRangeRequest(req, res, fileName, fileSize);
    } else {
        const head = {
            'Content-Length': fileSize, 
            'Content-Type': VIDEO_TYPE,
        };
        res.writeHead(200, head);
        fs.createReadStream(fileName).pipe(res);
    }
});

module.exports = router;
