const express = require('express');
const fs = require('fs');
const path = require('path');
const { auth, opAuth, getUser } = require('../middleware/auth');
const { videoConfig, networkConfig, serverConfig, databaseConfig } = require('../config');
const { addLog, getUserById, updateById, getMonitorStuList, examStudentManagement, getMonitorExamStuList } = require('../database');
const { isSimplePwd, cryptPwd, formatFileSize } = require('../utils');
const { getAllUsersState, removeUser } = require('../services/userManager');

const router = express.Router();

// Socket.IO实例将在运行时注入
let io = null;

// 设置Socket.IO实例
const setSocketIO = (socketIO) => {
    io = socketIO;
};

// 导出设置函数
router.setSocketIO = setSocketIO;

// 获取配置信息
router.get('/information', auth, async (req, res) => {
    res.send({ 
        videoConfig: videoConfig, 
        networkConfig: networkConfig, 
        sessionUser: req.session.user 
    });
});

// 获取文件列表
router.get('/file', auth, opAuth, async (req, res) => {
    const userIP = req.ip;
    const history = {};
    const AllUsers = getAllUsersState();
    Object.values(AllUsers).forEach(user => {
        if (user.stu_userlevel !== '1') {
            history[user.stu_no] = fs.readdirSync(`${serverConfig.savePath}/u${user.stu_no}/`);
        }
    });
    await addLog(AllUsers[req.session.user.stu_no], userIP, 'watch_video', '查看历史视频');
    res.send(history);
});

// 获取学生列表
router.get('/stulist', auth, opAuth, async (req, res) => {
    const stulist = databaseConfig.stulist === 'exam' ? 
        await getMonitorExamStuList(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, req.session.user.stu_no, databaseConfig.endtime, databaseConfig.type) : 
        await getMonitorStuList(req.session.user.stu_no, databaseConfig.type);
    res.send({ stulist: stulist });
});

// 获取录制文件列表
router.get('/record_file_list', auth, opAuth, async (req, res) => {
    try {
        const stulist = databaseConfig.stulist === 'exam' ? 
            await getMonitorExamStuList(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, req.session.user.stu_no, databaseConfig.endtime, databaseConfig.type) : 
            await getMonitorStuList(req.session.user.stu_no, databaseConfig.type);
        const stu_no_set = new Set(stulist.map(user => user.sno));
        const threshold = 5;
        
        const getLatestWebmInfo = (folderPath) => {
            try {
                const webmFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.webm'));
                if (webmFiles.length === 0) {
                    return null;
                }

                const latestWebm = webmFiles.reduce((latest, current) => {
                    return fs.statSync(path.join(folderPath, current)).mtimeMs > fs.statSync(path.join(folderPath, latest)).mtimeMs ? current : latest;
                });

                const latestWebmPath = path.join(folderPath, latestWebm);
                const modificationTime = fs.statSync(latestWebmPath).mtimeMs / 1000;
                const fileSize = fs.statSync(latestWebmPath).size;

                return { modificationTime, fileSize };
            } catch (error) {
                console.error(`Error reading folder ${folderPath}:`, error);
                return null;
            }
        };
        
        const processFolder = (folderName) => {
            if (folderName.startsWith('u') && folderName.slice(1).match(/^\d{7}$/)) {
                const folderPath = path.join(serverConfig.savePath, folderName);
                if (fs.statSync(folderPath).isDirectory()) {
                    const studentId = folderName.slice(1);
                    if (!stu_no_set.has(studentId)) {
                        return;
                    }
                    const { modificationTime, fileSize } = getLatestWebmInfo(folderPath) || {};
                    if (modificationTime !== undefined) {
                        const currentTime = Date.now() / 1000;
                        const timeDiff = currentTime - modificationTime;
                        const isBelowThreshold = timeDiff < threshold;
                        const modificationTimeStr = new Date(modificationTime * 1000).toISOString().replace('T', ' ').substring(0, 19);
                        return { 
                            studentId, 
                            modificationTimeStr, 
                            timeDiff, 
                            isBelowThreshold, 
                            fileSize: formatFileSize(fileSize) 
                        };
                    }
                }
            }
            return null;
        };
        
        const data = fs.readdirSync(serverConfig.savePath).map(processFolder).filter(Boolean);
        res.json(data);
    } catch (error) {
        console.error('Error fetching monitor data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 禁用用户
router.post('/disable', auth, opAuth, async (req, res) => {
    const user = await getUserById(req.body.id);
    if (!user) {
        return res.send({
            code: -1, message: "未找到该学号！"
        });
    }
    await updateById([{ stu_enable: '0' }, user.stu_no]);
    removeUser(user.stu_no);
    if (io) {
        io.emit('disable', user.stu_no);
        io.emit('state', getAllUsersState());
    }
    res.send({
        code: 0, message: "Success!"
    });
});

// 发送通知/录制指令
router.post('/emit', auth, opAuth, async (req, res) => {
    let message = "Success!";
    switch (req.body.type) {
        case 'record':
            if (io) {
                io.emit('record', req.body.data);
            }
            break;
        case 'notice':
            message = '全体';
            if (req.body.target !== 'all') {
                const user = await getUserById(req.body.target);
                if (!user) {
                    return res.send({
                        code: -1, message: "输入有误或未找到该学号！"
                    })
                }
                message = user.stu_no + user.stu_name;
            }
            message = message + '通知发送成功！';
            if (io) {
                io.emit('notice', req.body.target, req.body.data);
            }
            break;
    }
    res.send({
        code: 0, message: message,
    });
});

// 考试管理
router.post('/manage', auth, opAuth, async (req, res) => {
    let user = await getUserById(req.session.user.stu_no);
    await examStudentManagement(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, user.stu_no, req.body.srcId, req.body.type, req.body.op);
    await addLog(user, req.ip, "manage_exam", `${req.session.user.stu_no}将${req.body.srcId}的${req.body.type}修改为${req.body.op}`);
    res.send({
        code: 0, message: 'success',
    });
});

module.exports = router;
