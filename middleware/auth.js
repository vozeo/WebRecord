const { getUserById } = require('../services/database');
const { cryptPwd } = require('../services/utils');

/**
 * 获取当前会话用户
 * @param {Object} req - Express请求对象
 * @returns {Object|null} 用户对象或null
 */
const getUser = async (req) => {
    const sessionUser = req.session.user;
    return sessionUser ? await getUserById(sessionUser.stu_no) : null;
};

/**
 * 认证中间件 - 检查用户是否已登录
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 */
const auth = async (req, res, next) => {
    const user = await getUser(req);
    return user ? (cryptPwd(user.stu_no) === user.stu_password && req.path !== '/password' && req.path !== '/logout' ? res.redirect('/password') : next()) : res.redirect('/login');
};

/**
 * 管理员权限认证中间件 - 检查用户是否为管理员
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 */
const opAuth = async (req, res, next) => {
    const user = await getUser(req);
    return user && user.stu_userlevel === '1' ? next() : res.redirect('/');
};

/**
 * 未认证中间件 - 检查用户是否未登录
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 */
const noAuth = async (req, res, next) => {
    const user = await getUser(req);
    return user ? res.redirect('/') : next();
};

module.exports = {
    getUser,
    auth,
    opAuth,
    noAuth
};
