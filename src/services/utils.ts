import * as crypto from 'crypto';

/**
 * 数据库用户对象接口定义
 */
export interface DatabaseUser {
    stu_no: string;
    stu_cno: string;
    stu_name: string;
    stu_grade: string;
    stu_userlevel: string;
    stu_class_sname: string;
    stu_enable?: string;
    [key: string]: any;
}

/**
 * 运行时用户对象接口定义
 */
export interface User extends DatabaseUser {
    lastStartTime?: number | null;
    accumulatedDuration: number;
    interruptions: number;
}

/**
 * 获取格式化的时间字符串
 * @param date - 日期对象，默认为当前时间
 * @returns 格式化的时间字符串
 */
export const getTime = (date: Date = new Date()): string => `${date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
}).replace(/\//g, '-')}-${date.toLocaleString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
}).replace(/:/g, '-')}`;

/**
 * 检查密码是否过于简单
 * @param password - 密码
 * @returns 如果密码简单返回true，否则返回false
 */
export const isSimplePwd = (password: string): boolean => {
    if (password.length < 8) {
        return true;
    }
    const hasLower = /[a-z]+/.test(password) ? 1 : 0;
    const hasUpper = /[A-Z]+/.test(password) ? 1 : 0;
    const hasNumber = /[0-9]+/.test(password) ? 1 : 0;
    const hasSpecial = /[^a-zA-Z0-9]+/.test(password) ? 1 : 0;
    return hasLower + hasUpper + hasNumber + hasSpecial < 3;
};

/**
 * 使用MD5加密密码
 * @param password - 原始密码
 * @returns MD5加密后的密码
 */
export const cryptPwd = (password: string): string => {
    const md5 = crypto.createHash('md5');
    return md5.update(password).digest('hex');
};

/**
 * 处理用户录制中断
 * @param user - 用户对象
 */
export const handleInterrupt = (user: User): void => {
    const currentTime = Date.now();
    if (user.lastStartTime) {
        const duration = currentTime - user.lastStartTime;
        user.accumulatedDuration += duration;
        user.interruptions += 1;
        user.lastStartTime = null;
    }
};

/**
 * 更新用户累计录制时长 - 基于设备级别的真实录制状态和文件上传活动
 * @param user - 用户对象
 */
export const updateAccumulatedDuration = (user: any): void => {
    let totalDuration = 0;
    const currentTime = Date.now();
    
    // 遍历所有设备的录制状态，只计算真正在录制且有文件活动的时间
    ['screen', 'camera'].forEach(type => {
        if (user.recordList && user.recordList[type]) {
            Object.values(user.recordList[type]).forEach((deviceState: any) => {
                if (deviceState.state === 'recording' && deviceState.startTime) {
                    // 检查是否有实际的录制活动（基于文件上传）
                    const timeSinceLastActivity = currentTime - (deviceState.lastActivity || deviceState.startTime);
                    const isActivelyRecording = timeSinceLastActivity < 30000; // 30秒内有活动视为活跃录制
                    
                    if (isActivelyRecording) {
                        // 计算这个设备的录制时长
                        const deviceDuration = currentTime - deviceState.startTime;
                        totalDuration += deviceDuration;
                        // 只在开发环境输出详细录制信息
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`📊 设备 ${deviceState.deviceId} 录制时长: ${Math.floor(deviceDuration / 1000)}秒`);
                        }
                    } else {
                        // 只在开发环境输出暂停信息
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`⏸️ 设备 ${deviceState.deviceId} 录制暂停中（无文件活动超过30秒）`);
                        }
                    }
                    
                    // 更新设备的最后活动时间
                    deviceState.lastActivity = currentTime;
                }
            });
        }
    });
    
    // 使用设备录制时长作为用户的累计时长
    user.accumulatedDuration = totalDuration;
};

/**
 * 格式化文件大小
 * @param size - 文件大小（字节）
 * @returns 格式化的文件大小字符串
 */
export const formatFileSize = (size: number): string => {
    if (size < 1024) {
        return `${size} B`;
    } else if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(2)} KB`;
    } else if (size < 1024 * 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    } else {
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
};
