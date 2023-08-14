const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const session = require('express-session');

const { serverConfig, videoConfig, networkConfig, databaseConfig } = require('./config')
const { addLog, getAllUsers, getUserById, updateById, getMonitorStuList,
    examStudentManagement,
    getMonitorExamStuList } = require('./database')

const app = express();
const server = https.createServer({
    key: fs.readFileSync(serverConfig.keyPath), cert: fs.readFileSync(serverConfig.certPath)
}, app)

app.engine('html', require('express-art-template'));
app.set('view options', {
    debug: true
});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));
app.use(session({
    secret: serverConfig.sessionSecret, resave: false, saveUninitialized: true, cookie: {
        secure: true, maxAge: 1000 * 60 * 60 * 24
    }
}));

// 功能函数

const getTime = (date = new Date()) => `${date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
}).replaceAll('/', '-')}-${date.toLocaleString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
}).replaceAll(':', '-')}`;

const isSimplePwd = (password) => {
    if (password.length < 12) {
        return true;
    }
    return /[a-z]+/.test(password) + /[A-Z]+/.test(password) + /[0-9]+/.test(password) + /[^a-zA-Z0-9]+/.test(password) < 3;
};

// 初始化
let AllUsers = {};

(async () => {
    let allUsersArray = await getAllUsers();
    for (let user of allUsersArray) {
        const path = serverConfig.savePath + '/u' + user.stu_no + '/';
        fs.mkdirSync(path, { recursive: true });
        AllUsers[user.stu_no] = {
            stu_no: user.stu_no,
            stu_cno: user.stu_cno,
            stu_name: user.stu_name,
            stu_grade: user.stu_grade,
            stu_userlevel: user.stu_userlevel,
            stu_class_sname: user.stu_class_sname,
            watchList: {},
            recordList: { camera: {}, screen: {} },
            online: 0,
            screenNumber: 0,
            interruptions: 0, // 中断次数
            accumulatedDuration: 0, // 累计时长 (以毫秒为单位)
            lastStartTime: null, // 本次开始时间
        };
    }
    console.log(getTime() + ' 服务器初始化完成');
})();

function handleInterrupt(user) {
    const currentTime = Date.now(); 
    if (user.lastStartTime) {
        const duration = currentTime - user.lastStartTime;
        user.accumulatedDuration += duration;
        user.interruptions += 1;
        user.lastStartTime = null;
    }
}

function updateAccumulatedDuration(user) {
    if (user.lastStartTime) {
        const currentTime = Date.now();
        const duration = currentTime - user.lastStartTime;
        user.accumulatedDuration += duration;
        user.lastStartTime = currentTime;  // 更新上次开始时间为当前时间
    }
}

// WebRTC的WebSocket服务器

const { ExpressPeerServer } = require("peer");
const webRTCServer = ExpressPeerServer(server, {
    path: '/',
});
app.use('/webrtc', webRTCServer);

// SocketIO服务器

const { Server } = require("socket.io");
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 60000,
    maxHttpBufferSize: 1e8
});

let UserNo = {};
let WatchState = {};
let FileList = {};

io.on('connection', (socket) => {
    const userIP = socket.handshake.address;
    /*
    message: {id, type, state}
    type: 'online', 'camera', 'screen'
    state: true, false
    */
    socket.on('message', async (srcId, type, args, callback) => {
        try {
            const src = AllUsers[srcId];
            if (type === 'online') {
                await addLog(src, userIP, 'login', `建立 socket 连接`);
                ++src.online;
                UserNo[socket.id] = srcId;
            } else if (args === false) {
                if (socket.id in src.recordList[type]) {
                    await addLog(src, userIP, 'end_record', `点击${type === 'screen' ? '屏幕' : '摄像头'}停止录制按钮`);
                    delete src.recordList[type][socket.id];
                    handleInterrupt(src);
                }
            } else {
                const [device, time] = args;
                await addLog(src, userIP, 'start_record', `点击${type === 'screen' ? '屏幕' : '摄像头'}开始录制按钮`);
                AllUsers[srcId].recordList[type][socket.id] = {
                    device: device, time: time,
                }
            }
            io.emit('state', AllUsers);
            callback();
        } catch (error) {
            await addLog({
                stu_no: "none", stu_cno: "none"
            }, userIP, 'error', `Socket message 错误：${error.message}`);
        }
    });
    socket.on('watch', async (srcId, dstId) => {
        try {
            const src = AllUsers[srcId], dst = AllUsers[dstId];
            if (src.stu_userlevel === '1') {
                await addLog(src, userIP, 'monitor_open', `打开${dst.stu_no}${dst.stu_name}的监控界面`);
                if (dst.watchList[srcId]) {
                    dst.watchList[srcId].watchCount += 1;
                } else {
                    dst.watchList[srcId] = {
                        stu_no: src.stu_no, stu_name: src.stu_name, watchCount: 1
                    };
                }
                WatchState[socket.id] = [srcId, dstId];
                io.emit('state', AllUsers);
            }
        } catch (error) {
            await addLog({
                stu_no: "none", stu_cno: "none"
            }, userIP, 'error', `Socket watch 错误：${error.message}`);
        }
    });
    socket.on('disconnect', async () => {
        try {
            if (socket.id in WatchState) {
                const [srcId, dstId] = WatchState[socket.id];
                const src = AllUsers[srcId], dst = AllUsers[dstId];
                if (dst.watchList[srcId].watchCount > 1) {
                    dst.watchList[srcId].watchCount -= 1;
                } else {
                    delete dst.watchList[srcId];
                }
                await addLog(src, userIP, 'logout', `关闭${dst.stu_no}${dst.stu_name}的监控界面`);
                delete WatchState[socket.id];
            } else {
                const src = AllUsers[UserNo[socket.id]];
                --src.online;
                src.screenNumber = 0;
                await addLog(src, userIP, 'disconnect', `断开 socket 连接`);
                for (let type in src.recordList) {
                    if (socket.id in src.recordList[type]) {
                        await addLog(src, userIP, 'interrupt', `${type === 'screen' ? '屏幕' : '摄像头'}录制被中断：${src.recordList[type][socket.id].device}`);
                        delete src.recordList[type][socket.id];
                        handleInterrupt(src);
                    }
                }
            }
            io.emit('state', AllUsers);
        } catch (error) {
            await addLog({
                stu_no: "none", stu_cno: "none"
            }, userIP, 'error', `Socket disconnect 错误：${error.message}`);
        }
    });
    socket.on('screen', async (srcId, number) => {
        try {
            const src = AllUsers[srcId];
            if (number !== src.screenNumber) {
                await addLog(src, userIP, 'screen_change', `屏幕数量由${src.screenNumber}变为${number}`);
            }
            src.screenNumber = number;
            io.emit('state', AllUsers);
        } catch (error) {
            await addLog({
                stu_no: "none", stu_cno: "none"
            }, userIP, 'error', `Socket screen 错误：${error.message}`);
        }
    });
    socket.on('file', async (srcId, type, device, time, data) => {
        try {
            const name = `${srcId}-${type}-${device}`;
            const partName = `u${srcId}-${type}-${time}-${device}.webm`;
            const fullName = `${serverConfig.savePath}/u${srcId}/${partName}`;
            if (partName === FileList[name]) {
                fs.appendFileSync(fullName, data);
                updateAccumulatedDuration(AllUsers[srcId]);
            } else {
                await addLog(AllUsers[srcId], userIP, 'create_file', `创建录制文件：${partName}`);
                fs.writeFileSync(fullName, data);
                FileList[name] = partName;
                AllUsers[srcId].lastStartTime = Date.now();
            }
        } catch (error) {
            await addLog({
                stu_no: "none", stu_cno: "none"
            }, userIP, 'error', `Socket file 错误：${error.message}`);
        }
    });
});

// 权限验证

const crypto = require('crypto');

const cryptPwd = (password) => {
    let md5 = crypto.createHash('md5');
    return md5.update(password).digest('hex');
}

const getUser = async (req) => {
    const sessionUser = req.session.user;
    return sessionUser ? await getUserById(sessionUser.stu_no) : null;
};

const auth = async (req, res, next) => {
    const user = await getUser(req);
    return user ? (cryptPwd(user.stu_no) === user.stu_password && req.path !== '/password' && req.path !== '/logout' ? res.redirect('/password') : next()) : res.redirect('/login');
}

const opAuth = async (req, res, next) => {
    const user = await getUser(req);
    return user && user.stu_userlevel === '1' ? next() : res.redirect('/');
}

const noAuth = async (req, res, next) => {
    const user = await getUser(req);
    return user ? res.redirect('/') : next();
}

// 获取网页

const ImageCount = fs.readdirSync('./images').length;

app.get('/', auth, async (req, res) => {
    res.render('index.html', { sessionUser: req.session.user });
});

app.get('/record', auth, async (req, res) => {
    res.render('record.html', { sessionUser: req.session.user });
});

app.get('/login', noAuth, async (req, res) => {
    res.render('login.html', { file: `../images/${Math.floor(Math.random() * ImageCount) + 1}.jpg` });
});

app.get('/password', auth, async (req, res) => {
    res.render('password.html', {
        sessionUser: req.session.user, file: `../images/${Math.floor(Math.random() * ImageCount) + 1}.jpg`
    });
});

app.get('/history', auth, opAuth, async (req, res) => {
    res.render('history.html', { user: Object.values(AllUsers) });
});

app.get('/monitor', auth, opAuth, async (req, res) => {
    const stulist = databaseConfig === 'exam' ? await getMonitorExamStuList(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, req.session.user.stu_no, databaseConfig.type) : await getMonitorStuList(req.session.user.stu_no, databaseConfig.type);
    res.render('monitor.html', {
        userList: stulist, sessionUser: req.session.user
    });
});

app.get('/live', auth, opAuth, async (req, res) => {
    let stu = AllUsers[req.query.id];
    res.render('video.html', {
        id: stu.stu_no,
        name: stu.stu_name,
        type: req.query.type,
        typeName: `${req.query.type === 'screen' ? '屏幕' : '摄像头'}`
    });
});

// 获取信息

app.get('/information', auth, async (req, res) => {
    res.send({ videoConfig: videoConfig, networkConfig: networkConfig, sessionUser: req.session.user });
});

app.get('/file', auth, opAuth, async (req, res) => {
    const userIP = req.ip;
    const history = {};
    Object.values(AllUsers).forEach(user => {
        if (user.stu_userlevel !== '1') {
            history[user.stu_no] = fs.readdirSync(`${serverConfig.savePath}/u${user.stu_no}/`);
        }
    });
    await addLog(AllUsers[req.session.user.stu_no], userIP, 'watch_video', '查看历史视频');
    res.send(history);
});

const VIDEO_TYPE = 'video/webm';
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

app.get('/video/:name', auth, opAuth, function (req, res) {
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
            'Content-Length': fileSize, 'Content-Type': VIDEO_TYPE,
        };
        res.writeHead(200, head);
        fs.createReadStream(fileName).pipe(res);
    }
});

app.get('/stulist', auth, opAuth, async (req, res) => {
    const stulist = databaseConfig === 'exam' ? await getMonitorExamStuList(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, req.session.user.stu_no, databaseConfig.type) : await getMonitorStuList(req.session.user.stu_no, databaseConfig.type);
    res.send({ stulist: stulist });
});

// 交互功能

app.post('/disable', auth, opAuth, async (req, res) => {
    const user = await getUserById(req.body.id);
    if (!user) {
        return res.send({
            code: -1, message: "未找到该学号！"
        });
    }
    await updateById([{ stu_enable: '0' }, user.stu_no]);
    delete AllUsers[user.stu_no]
    io.emit('disable', user.stu_no);
    io.emit('state', AllUsers);
    res.send({
        code: 0, message: "Success!"
    });
});

app.post('/emit', auth, opAuth, async (req, res) => {
    let message = "Success!";
    switch (req.body.type) {
        case 'record':
            io.emit('record', req.body.data);
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
            io.emit('notice', req.body.target, req.body.data);
            break;
    }
    res.send({
        code: 0, message: message,
    });
});

app.post('/manage', auth, opAuth, async (req, res) => {
    let user = await getUserById(req.session.user.stu_no);
    await examStudentManagement(databaseConfig.term, databaseConfig.cno, databaseConfig.eno, user.stu_no, req.body.srcId, req.body.type, req.body.op);
    await addLog(user, req.ip, "manage_exam", `${req.session.user.stu_no}将${req.body.srcId}的${req.body.type}修改为${req.body.op}`);
    res.send({
        code: 0, message: 'success',
    });
});

// 注册登录

app.post('/password', auth, async (req, res) => {
    let user = await getUserById(req.session.user.stu_no);
    const userIP = req.ip;

    if (req.body.newPassword !== req.body.confirmPassword) {
        await addLog(user, userIP, "password_change_fail", "修改密码失败: 两次输入的新密码不一致");
        return res.send({
            code: -1, message: "两次输入的新密码不一致!"
        });
    }

    if (cryptPwd(req.body.oldPassword) !== user.stu_password) {
        await addLog(user, userIP, "password_mismatch", "修改密码失败: 旧密码错误");
        return res.send({
            code: -2, message: "旧密码错误!"
        });
    }

    if (cryptPwd(req.body.newPassword) === user.stu_password) {
        await addLog(user, userIP, "same_new_old_password", "修改密码失败: 新密码和旧密码相同");
        return res.send({
            code: -3, message: "新密码不能和旧密码相同!"
        });
    }

    if (req.body.newPassword.match(/[^\w\-*=#$%!]+/)) {
        await addLog(user, userIP, "illegal_character", "修改密码失败: 包含了非法字符");
        return res.send({
            code: -4, message: "密码不能包含除数字、小写字母、大写字母或 * = - _ # $ % ! 字符以外的其他字符!"
        });
    }

    if (isSimplePwd(req.body.newPassword)) {
        await addLog(user, userIP, "simple_password", "修改密码失败: 密码不够复杂");
        return res.send({
            code: -5, message: "新密码需包含数字、小写字母、大写字母、其它符号 * = - _ # $ % ! 这四种中的至少三种，且长度大于等于12位！"
        });
    }

    await updateById([{ stu_password: cryptPwd(req.body.newPassword) }, user.stu_no]);
    await addLog(user, userIP, "password_change_success", "修改密码成功");

    res.send({
        code: 0, message: "修改密码成功！"
    });
});

app.post('/login', noAuth, async (req, res) => {
    let user = await getUserById(req.body.username);
    const userIP = req.ip;
    try {
        if (!user) {
            await addLog({
                stu_no: "none", stu_cno: "none"
            }, userIP, "login_fail", `登录失败：用户名不存在：${req.body.username.slice(0, 8)}`);
            return res.send({
                code: -1, message: "用户名不存在!"
            });
        }

        if (cryptPwd(req.body.password) !== user.stu_password) {
            await addLog(user, userIP, "password_mismatch", "登录失败：密码错误");
            return res.send({
                code: -2, message: "密码错误!"
            });
        }

        req.session.user = {
            stu_no: user.stu_no, stu_name: user.stu_name, stu_userlevel: user.stu_userlevel,
        };

        if (req.body.password === user.stu_no) {
            await addLog(user, userIP, "first_time_login", "登录成功：首次登录");
            return res.redirect('/password');
        }

        await addLog(user, userIP, "login_success", "登录成功");
        res.redirect(user.stu_userlevel === '1' ? '/monitor' : '/');
    } catch (error) {
        await addLog({
            stu_no: user ? user.stu_no : "none",
            stu_cno: user ? user.stu_cno : "none"
        }, userIP, "login_error", `登录错误：${error.message}`);
    }
});

app.get('/logout', auth, async (req, res) => {
    const user = await getUserById(req.session.user.stu_no);
    const userIP = req.ip;
    await addLog(user, userIP, "logout", "退出登录");
    req.session.user = null;
    res.redirect('/');
});

server.listen(networkConfig.socketPort);
