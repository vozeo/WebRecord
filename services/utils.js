const crypto = require('crypto');

/**
 * 获取格式化的时间字符串
 * @param {Date} date - 日期对象，默认为当前时间
 * @returns {string} 格式化的时间字符串
 */
const getTime = (date = new Date()) => `${date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
}).replaceAll('/', '-')}-${date.toLocaleString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
}).replaceAll(':', '-')}`;

/**
 * 检查密码是否过于简单
 * @param {string} password - 密码
 * @returns {boolean} 如果密码简单返回true，否则返回false
 */
const isSimplePwd = (password) => {
    if (password.length < 8) {
        return true;
    }
    return /[a-z]+/.test(password) + /[A-Z]+/.test(password) + /[0-9]+/.test(password) + /[^a-zA-Z0-9]+/.test(password) < 3;
};

/**
 * 使用MD5加密密码
 * @param {string} password - 原始密码
 * @returns {string} MD5加密后的密码
 */
const cryptPwd = (password) => {
    let md5 = crypto.createHash('md5');
    return md5.update(password).digest('hex');
};

/**
 * 处理用户录制中断
 * @param {Object} user - 用户对象
 */
const handleInterrupt = (user) => {
    const currentTime = Date.now();
    if (user.lastStartTime) {
        const duration = currentTime - user.lastStartTime;
        user.accumulatedDuration += duration;
        user.interruptions += 1;
        user.lastStartTime = null;
    }
};

/**
 * 更新用户累计录制时长
 * @param {Object} user - 用户对象
 */
const updateAccumulatedDuration = (user) => {
    if (user.lastStartTime) {
        const currentTime = Date.now();
        const duration = currentTime - user.lastStartTime;
        user.accumulatedDuration += duration;
        user.lastStartTime = currentTime;  // 更新上次开始时间为当前时间
    }
};

/**
 * 格式化文件大小
 * @param {number} size - 文件大小（字节）
 * @returns {string} 格式化的文件大小字符串
 */
const formatFileSize = (size) => {
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

module.exports = {
    getTime,
    isSimplePwd,
    cryptPwd,
    handleInterrupt,
    updateAccumulatedDuration,
    formatFileSize
};
