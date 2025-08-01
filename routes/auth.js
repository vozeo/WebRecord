const express = require('express');
const { auth, noAuth, getUser } = require('../middleware/auth');
const { addLog, getUserById, updateById } = require('../database');
const { isSimplePwd, cryptPwd } = require('../utils');

const router = express.Router();

// 修改密码
router.post('/password', auth, async (req, res) => {
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

    if (req.body.newPassword.match(/[^\w\-*=#$%!@.]+/)) {
        await addLog(user, userIP, "illegal_character", "修改密码失败: 包含了非法字符");
        return res.send({
            code: -4, message: "密码不能包含除数字、小写字母、大写字母或 * = - _ # $ % ! . @ 字符以外的其他字符!"
        });
    }

    if (isSimplePwd(req.body.newPassword)) {
        await addLog(user, userIP, "simple_password", "修改密码失败: 密码不够复杂");
        return res.send({
            code: -5, message: "新密码需包含数字、小写字母、大写字母、其它符号 * = - _ # $ % ! . @ 这四种中的至少三种，且长度大于等于8位！"
        });
    }

    await updateById([{ stu_password: cryptPwd(req.body.newPassword) }, user.stu_no]);
    await addLog(user, userIP, "password_change_success", "修改密码成功");

    res.send({
        code: 0, message: "修改密码成功！"
    });
});

// 用户登录
router.post('/login', noAuth, async (req, res) => {
    let user = await getUserById(req.body.username);
    const userIP = req.ip;
    try {
        if (!user) {
            await addLog({
                stu_no: null, stu_cno: null
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
            stu_no: user.stu_no, 
            stu_name: user.stu_name, 
            stu_userlevel: user.stu_userlevel,
        };

        if (req.body.password === user.stu_no) {
            await addLog(user, userIP, "first_time_login", "登录成功：首次登录");
            return res.redirect('/password');
        }

        await addLog(user, userIP, "login_success", "登录成功");
        res.redirect(user.stu_userlevel === '1' ? '/monitor' : '/');
    } catch (error) {
        await addLog({
            stu_no: user ? user.stu_no : null,
            stu_cno: user ? user.stu_cno : null
        }, userIP, "login_error", `登录错误：${error.message}`);
    }
});

// 用户登出
router.get('/logout', auth, async (req, res) => {
    const user = await getUserById(req.session.user.stu_no);
    const userIP = req.ip;
    await addLog(user, userIP, "logout", "退出登录");
    req.session.user = null;
    res.redirect('/');
});

// 页面会话管理
let scheduledDestroy = {};

router.post('/pageOpened', (req, res) => {
    req.session.pageCount = (req.session.pageCount || 0) + 1;
    if (scheduledDestroy[req.sessionID]) {
        clearTimeout(scheduledDestroy[req.sessionID]);
        delete scheduledDestroy[req.sessionID];
    }
    res.sendStatus(200);
});

router.post('/pageClosed', (req, res) => {
    req.session.pageCount--;
    if (req.session.pageCount <= 0) {
        scheduledDestroy[req.sessionID] = setTimeout(() => {
            req.session.destroy();
            delete scheduledDestroy[req.sessionID];
        }, 3000);
    }
    res.sendStatus(200);
});

module.exports = router;
