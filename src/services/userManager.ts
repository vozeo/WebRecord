import * as fs from 'fs';
import { getAllUsers } from './database';
import { getTime, User, DatabaseUser } from './utils';
import { Server as SocketIOServer } from 'socket.io';
import { serverConfig, databaseConfig } from '../../config';

/**
 * 录制设备状态接口
 */
export interface DeviceRecordState {
    deviceId: string;
    deviceLabel: string;
    state: 'idle' | 'recording' | 'error';
    startTime: number;
    lastActivity: number;
    socketId: string;
    fileCount: number;
    totalSize: number;
    errorCount: number;
    webrtcReady?: boolean;  // WebRTC连接是否就绪
    peerId?: string;        // WebRTC PeerID
}

/**
 * 扩展的用户状态接口 - 支持多设备录制
 */
export interface UserState extends User {
    stu_no: string;
    stu_cno: string;
    stu_name: string;
    stu_grade: string;
    stu_userlevel: string;
    stu_class_sname: string;
    stu_enable: string; // 添加stu_enable字段
    watchList: Record<string, any>;
    recordList: {
        camera: Record<string, DeviceRecordState>;  // 支持多个摄像头
        screen: Record<string, DeviceRecordState>;  // 支持多个屏幕
    };
    online: number;
    screenNumber: number;
    interruptions: number;
    accumulatedDuration: number;
    lastStartTime: number | null;
    loginTime?: string;
    lastIP?: string;
    recordingStats: {
        totalFiles: number;
        totalSize: number;
        activeDevices: number;
        maxDevicesReached: boolean;
    };
}

/**
 * 所有用户状态的类型定义
 */
export type AllUsersState = Record<string, UserState>;

// 全局用户状态管理
let AllUsers: AllUsersState = {};

/**
 * 初始化所有用户数据
 */
export const initializeUsers = async (): Promise<void> => {
    try {
        const allUsersArray = await getAllUsers();
        for (const user of allUsersArray) {
            const path = serverConfig.savePath + '/u' + user.stu_no + '/';
            fs.mkdirSync(path, { recursive: true });
            AllUsers[user.stu_no] = {
                stu_no: user.stu_no,
                stu_cno: user.stu_cno,
                stu_name: user.stu_name,
                stu_grade: user.stu_grade,
                stu_userlevel: user.stu_userlevel,
                stu_class_sname: user.stu_class_sname,
                stu_enable: user.stu_enable || '1', // 必须包含stu_enable字段
                watchList: {},
                recordList: { camera: {}, screen: {} },
                online: 0,
                screenNumber: 0,
                interruptions: 0, // 中断次数
                accumulatedDuration: 0, // 累计时长 (以毫秒为单位)
                lastStartTime: null, // 本次开始时间
                recordingStats: {
                    totalFiles: 0,
                    totalSize: 0,
                    activeDevices: 0,
                    maxDevicesReached: false
                }
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
 * @returns 所有用户对象
 */
export const getAllUsersState = (): AllUsersState => {
    return AllUsers;
};

/**
 * 根据用户ID获取用户
 * @param userId - 用户ID
 * @returns 用户对象或null
 */
export const getUserState = (userId: string): UserState | null => {
    return AllUsers[userId] || null;
};

/**
 * 更新用户状态
 * @param userId - 用户ID
 * @param updates - 要更新的字段
 */
export const updateUserState = (userId: string, updates: Partial<UserState>): void => {
    if (AllUsers[userId]) {
        Object.assign(AllUsers[userId], updates);
    }
};

/**
 * 添加或更新用户到在线用户列表
 * @param user - 用户对象
 * @param userIP - 用户IP地址
 */
export const addUser = (user: DatabaseUser, userIP: string): void => {
    if (AllUsers[user.stu_no]) {
        // 更新现有用户的登录信息，但不重置在线状态
        // 在线状态由Socket连接管理
        AllUsers[user.stu_no].lastIP = userIP;
        AllUsers[user.stu_no].loginTime = new Date().toISOString();
    } else {
        // 创建新用户状态
        const path = serverConfig.savePath + '/u' + user.stu_no + '/';
        fs.mkdirSync(path, { recursive: true });

        AllUsers[user.stu_no] = {
            stu_no: user.stu_no,
            stu_cno: user.stu_cno || '',
            stu_name: user.stu_name,
            stu_grade: user.stu_grade || '',
            stu_userlevel: user.stu_userlevel,
            stu_class_sname: user.stu_class_sname || '',
            stu_enable: user.stu_enable || '1', // 添加stu_enable字段
            watchList: {},
            recordList: { camera: {}, screen: {} },
            online: 1,
            screenNumber: 0,
            interruptions: 0,
            accumulatedDuration: 0,
            lastStartTime: null,
            loginTime: new Date().toISOString(),
            lastIP: userIP,
            recordingStats: {
                totalFiles: 0,
                totalSize: 0,
                activeDevices: 0,
                maxDevicesReached: false
            }
        };
    }
};

/**
 * 删除用户
 * @param userId - 用户ID
 */
export const removeUser = (userId: string): void => {
    delete AllUsers[userId];
};

/**
 * 检查考试结束时间
 * @param io - Socket.IO实例
 * @returns 定时器ID或null
 */
export const setupTimeChecker = (io: SocketIOServer): NodeJS.Timeout | null => {
    if (!databaseConfig.endtime) {
        return null;
    }
    
    const targetTime = new Date(databaseConfig.endtime).getTime();
    
    const checkTime = (): void => {
        const now = Date.now();
        if (now >= targetTime) {
            for (const user in AllUsers) {
                io.emit('disable', AllUsers[user].stu_no);
            }
            clearInterval(endInterval);
        }
    };
    
    const endInterval = setInterval(checkTime, 1000);
    return endInterval;
};
