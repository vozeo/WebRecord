const fs = require('fs');
const { getAllUsers } = require('./database');
const { serverConfig, databaseConfig } = require('../config');
const { getTime } = require('./utils');

// 全局用户状态管理
let AllUsers = {};

/**
 * 初始化所有用户数据
 */
const initializeUsers = async () => {
    try {
        const allUsersArray = await getAllUsers();
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
    } catch (error) {
        console.error('用户初始化失败:', error);
        throw error;
    }
};

/**
 * 获取所有用户
 * @returns {Object} 所有用户对象
 */
const getAllUsersState = () => {
    return AllUsers;
};

/**
 * 根据用户ID获取用户
 * @param {string} userId - 用户ID
 * @returns {Object|null} 用户对象或null
 */
const getUserState = (userId) => {
    return AllUsers[userId] || null;
};

/**
 * 更新用户状态
 * @param {string} userId - 用户ID
 * @param {Object} updates - 要更新的字段
 */
const updateUserState = (userId, updates) => {
    if (AllUsers[userId]) {
        Object.assign(AllUsers[userId], updates);
    }
};

/**
 * 删除用户
 * @param {string} userId - 用户ID
 */
const removeUser = (userId) => {
    delete AllUsers[userId];
};

/**
 * 检查考试结束时间
 * @param {Function} io - Socket.IO实例
 */
const setupTimeChecker = (io) => {
    if (!databaseConfig.endtime) {
        return null;
    }
    
    const targetTime = new Date(databaseConfig.endtime).getTime();
    
    const checkTime = () => {
        const now = Date.now();
        if (now >= targetTime) {
            for (let user in AllUsers) {
                io.emit('disable', AllUsers[user].stu_no);
            }
            clearInterval(endInterval);
        }
    };
    
    const endInterval = setInterval(checkTime, 1000);
    return endInterval;
};

module.exports = {
    initializeUsers,
    getAllUsersState,
    getUserState,
    updateUserState,
    removeUser,
    setupTimeChecker
};
