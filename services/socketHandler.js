const fs = require('fs');
const { addLog } = require('./database');
const { serverConfig } = require('../config');
const { handleInterrupt, updateAccumulatedDuration } = require('./utils');
const { getAllUsersState, getUserState, updateUserState } = require('./userManager');

// Socket状态管理
let UserNo = {};
let WatchState = {};
let FileList = {};

/**
 * 设置Socket.IO事件处理
 * @param {Object} io - Socket.IO实例
 */
const setupSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        const userIP = socket.handshake.address;
        
        // 处理消息事件
        socket.on('message', async (srcId, type, args, callback) => {
            try {
                const AllUsers = getAllUsersState();
                if (!AllUsers[srcId]) {
                    throw new Error(`Source user with ID ${srcId} not found`);
                }
                const src = AllUsers[srcId];
                
                if (type === 'online') {
                    await addLog(src, userIP, 'login', `建立 socket 连接`);
                    if (typeof src.online !== 'number') {
                        src.online = 0;
                    }
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
                    };
                }
                io.emit('state', AllUsers);
                callback();
            } catch (error) {
                await addLog({
                    stu_no: null, stu_cno: null
                }, userIP, 'error', `Socket message 错误：${error.message}`);
            }
        });

        // 处理监控事件
        socket.on('watch', async (srcId, dstId) => {
            try {
                const AllUsers = getAllUsersState();
                if (!AllUsers[srcId]) {
                    throw new Error(`Source user with ID ${srcId} not found`);
                }
                if (!AllUsers[dstId]) {
                    throw new Error(`Destination user with ID ${dstId} not found`);
                }
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
                    stu_no: null, stu_cno: null
                }, userIP, 'error', `Socket watch 错误：${error.message}`);
            }
        });

        // 处理断开连接事件
        socket.on('disconnect', async () => {
            try {
                const AllUsers = getAllUsersState();
                if (socket.id in WatchState) {
                    const [srcId, dstId] = WatchState[socket.id];
                    if (!AllUsers[srcId]) {
                        throw new Error(`Source user with ID ${srcId} not found`);
                    }
                    if (!AllUsers[dstId]) {
                        throw new Error(`Destination user with ID ${dstId} not found`);
                    }
                    const src = AllUsers[srcId], dst = AllUsers[dstId];
                    if (dst.watchList[srcId].watchCount > 1) {
                        dst.watchList[srcId].watchCount -= 1;
                    } else {
                        delete dst.watchList[srcId];
                    }
                    await addLog(src, userIP, 'logout', `关闭${dst.stu_no}${dst.stu_name}的监控界面`);
                    delete WatchState[socket.id];
                } else {
                    if (!AllUsers[UserNo[socket.id]]) {
                        throw new Error(`Source user with ID ${UserNo[socket.id]} not found`);
                    }
                    const src = AllUsers[UserNo[socket.id]];
                    if (typeof src.online !== 'number') {
                        src.online = 0;
                    }
                    --src.online;
                    if (typeof src.screenNumber !== 'number') {
                        src.screenNumber = 0;
                    }
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
                    stu_no: null, stu_cno: null
                }, userIP, 'error', `Socket disconnect 错误：${error.message}`);
            }
        });

        // 处理屏幕数量变化事件
        socket.on('screen', async (srcId, number) => {
            try {
                const AllUsers = getAllUsersState();
                if (!AllUsers[srcId]) {
                    throw new Error(`Source user with ID ${srcId} not found`);
                }
                const src = AllUsers[srcId];
                if (number !== src.screenNumber) {
                    await addLog(src, userIP, 'screen_change', `屏幕数量由${src.screenNumber}变为${number}`);
                }
                src.screenNumber = number;
                io.emit('state', AllUsers);
            } catch (error) {
                await addLog({
                    stu_no: null, stu_cno: null
                }, userIP, 'error', `Socket screen 错误：${error.message}`);
            }
        });

        // 处理文件上传事件
        socket.on('file', async (srcId, type, device, time, data) => {
            try {
                const AllUsers = getAllUsersState();
                if (!AllUsers[srcId]) {
                    throw new Error(`Source user with ID ${srcId} not found`);
                }
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
                    stu_no: null, stu_cno: null
                }, userIP, 'error', `Socket file 错误：${error.message}`);
            }
        });
    });
};

module.exports = {
    setupSocketHandlers
};
