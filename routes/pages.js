const express = require('express');
const fs = require('fs');
const { auth, opAuth, noAuth } = require('../middleware/auth');
const { databaseConfig } = require('../config');
const { getMonitorStuList, getMonitorExamStuList } = require('../services/database');
const { getAllUsersState } = require('../services/userManager');

const router = express.Router();

// 获取图片数量
const ImageCount = fs.readdirSync('./images').length;

// 首页
router.get('/', auth, async (req, res) => {
    res.render('index.html', { sessionUser: req.session.user });
});

// 录制页面
router.get('/record', auth, async (req, res) => {
    res.render('record.html', { sessionUser: req.session.user });
});

// 登录页面
router.get('/login', noAuth, async (req, res) => {
    res.render('login.html', { file: `../images/${Math.floor(Math.random() * ImageCount) + 1}.jpg` });
});

// 密码修改页面
router.get('/password', auth, async (req, res) => {
    res.render('password.html', {
        sessionUser: req.session.user, 
        file: `../images/${Math.floor(Math.random() * ImageCount) + 1}.jpg`
    });
});

// 历史记录页面
router.get('/history', auth, opAuth, async (req, res) => {
    const AllUsers = getAllUsersState();
    res.render('history.html', { user: Object.values(AllUsers) });
});

// 监控页面
router.get('/monitor', auth, opAuth, async (req, res) => {
    const stulist = databaseConfig.stulist === 'exam' ? 
        await getMonitorExamStuList(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, req.session.user.stu_no, databaseConfig.endtime, databaseConfig.type) : 
        await getMonitorStuList(req.session.user.stu_no, databaseConfig.type);
    res.render('monitor.html', {
        userList: stulist, 
        sessionUser: req.session.user
    });
});

// 实时视频页面
router.get('/live', auth, opAuth, async (req, res) => {
    const AllUsers = getAllUsersState();
    let stu = AllUsers[req.query.id];
    res.render('video.html', {
        id: stu.stu_no,
        name: stu.stu_name,
        type: req.query.type,
        typeName: `${req.query.type === 'screen' ? '屏幕' : '摄像头'}`
    });
});

// 文件监控页面
router.get('/monitor_file', auth, opAuth, async (req, res) => {
    res.render('monitor_file.html', { sessionUser: req.session.user });
});

module.exports = router;
