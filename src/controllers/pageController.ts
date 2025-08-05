/**
 * 页面控制器
 * 提供静态HTML文件，移除模板渲染依赖
 */

import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 页面控制器
 */
export const createPageController = () => {
    const viewsPath = path.join(__dirname, '../../views');

    /**
     * 发送HTML文件
     */
    const sendHtmlFile = (filename: string) => {
        return (req: Request, res: Response) => {
            const filePath = path.join(viewsPath, filename);
            
            if (!fs.existsSync(filePath)) {
                res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>页面未找到</title>
                        <meta charset="utf-8">
                    </head>
                    <body>
                        <h1>404 - 页面未找到</h1>
                        <p>请求的页面 ${filename} 不存在</p>
                    </body>
                    </html>
                `);
                return;
            }

            res.sendFile(filePath);
        };
    };

    return {
        /**
         * 首页 - 根据用户权限自动跳转
         */
        index: (req: Request, res: Response) => {
            // 从session中获取用户信息
            const session = (req as any).session;
            const user = session?.user;

            if (!user) {
                // 未登录用户跳转到登录页
                res.redirect('/login');
                return;
            }

            const userLevel = parseInt(user.stu_userlevel || '0');

            if (userLevel >= 1) {
                // 管理员跳转到监控页面
                res.redirect('/monitor');
            } else {
                // 普通用户跳转到录制页面
                res.redirect('/record');
            }
        },

        /**
         * 登录页面
         */
        login: sendHtmlFile('login.html'),

        /**
         * 录制页面
         */
        record: sendHtmlFile('record.html'),

        /**
         * 监控页面
         */
        monitor: sendHtmlFile('monitor.html'),

        /**
         * 历史记录页面
         */
        history: sendHtmlFile('history.html'),

        /**
         * 密码修改页面
         */
        password: sendHtmlFile('password.html'),

        /**
         * 实时监控页面 - 新的多设备监控界面
         */
        live: sendHtmlFile('live.html'),




    };
};