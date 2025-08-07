/**
 * 认证控制器
 * 处理用户认证相关的API请求
 */

import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse, ValidationError, UnauthorizedError } from '../types';
import { getUserById, updateById, addLog } from '../services/database';
import { isSimplePwd, cryptPwd } from '../services/utils';
import { addUser } from '../services/userManager';

/**
 * 创建认证控制器
 */
export const createAuthController = () => {
    return {
        /**
         * 用户登录 (API版本)
         */
        login: async (req: AuthenticatedRequest, res: Response) => {
            const { stu_no, password } = req.body;

            if (!stu_no || !password) {
                throw new ValidationError('学号和密码不能为空');
            }

            const user = await getUserById(stu_no);
            if (!user) {
                throw new UnauthorizedError('学号不存在');
            }

            if (user.stu_enable !== '1') {
                throw new UnauthorizedError('账户已被禁用');
            }

            const hashedPassword = cryptPwd(password);
            if (user.stu_password !== hashedPassword) {
                throw new UnauthorizedError('密码错误');
            }

            // 设置session
            req.session.user = {
                stu_no: user.stu_no,
                stu_name: user.stu_name,
                stu_userlevel: user.stu_userlevel
            };

            // 添加用户到在线用户列表
            addUser(user, req.ip || '');

            // 检查是否是首次登录（密码等于学号）
            let redirectUrl = '/';
            if (password === user.stu_no) {
                await addLog(user, req.ip || '', 'first_time_login', '登录成功：首次登录');
                redirectUrl = '/password';
            } else {
                await addLog(user, req.ip || '', 'login_success', '登录成功');

                // 所有用户登录后都跳转到主页，让用户自己选择功能
                redirectUrl = '/';
            }

            const response: ApiResponse = {
                success: true,
                message: '登录成功',
                data: {
                    user: req.session.user,
                    redirectUrl: redirectUrl
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        },



        /**
         * 用户登出
         */
        logout: async (req: AuthenticatedRequest, res: Response) => {
            if (req.session.user) {
                // 记录登出日志
                const user = await getUserById(req.session.user.stu_no);
                if (user) {
                    await addLog(user, req.ip || '', 'logout', '用户登出');
                }
            }

            // 销毁session
            req.session.destroy((err: any) => {
                if (err) {
                    // 错误日志在生产环境也需要输出，便于监控
                    console.error('销毁session时出错:', err);
                }
            });

            const response: ApiResponse = {
                success: true,
                message: '登出成功',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        },

        /**
         * 修改密码
         */
        changePassword: async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new UnauthorizedError('请先登录');
            }

            const { oldPassword, newPassword } = req.body;
            
            if (!oldPassword || !newPassword) {
                throw new ValidationError('旧密码和新密码不能为空');
            }

            if (isSimplePwd(newPassword)) {
                throw new ValidationError('新密码过于简单，请使用复杂密码');
            }

            const user = await getUserById(req.session.user.stu_no);
            if (!user) {
                throw new UnauthorizedError('用户不存在');
            }

            const hashedOldPassword = cryptPwd(oldPassword);
            if (user.stu_password !== hashedOldPassword) {
                throw new UnauthorizedError('旧密码错误');
            }

            const hashedNewPassword = cryptPwd(newPassword);
            await updateById([{ stu_password: hashedNewPassword }, user.stu_no]);

            // 记录密码修改日志
            await addLog(user, req.ip || '', 'change_password', '修改密码');

            const response: ApiResponse = {
                success: true,
                message: '密码修改成功',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        },

        /**
         * 获取当前用户信息
         */
        getCurrentUser: async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new UnauthorizedError('请先登录');
            }

            const response: ApiResponse = {
                success: true,
                message: '获取用户信息成功',
                data: {
                    user: req.session.user
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        },

        /**
         * 检查登录状态
         */
        checkAuth: async (req: AuthenticatedRequest, res: Response) => {
            const isAuthenticated = !!req.session.user;
            
            const response: ApiResponse = {
                success: true,
                message: isAuthenticated ? '已登录' : '未登录',
                data: {
                    isAuthenticated,
                    user: req.session.user || null
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }
    };
};