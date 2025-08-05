
import { getUserById } from '../services/database';
import { cryptPwd, DatabaseUser } from '../services/utils';

/**
 * 扩展Express Request接口以包含session
 */
interface AuthenticatedRequest {
    session: {
        user?: {
            stu_no: string;
            [key: string]: any;
        };
        [key: string]: any;
    };
    path: string;
}

/**
 * 获取当前会话用户
 * @param req - Express请求对象
 * @returns 用户对象或null
 */
export const getUser = async (req: AuthenticatedRequest): Promise<DatabaseUser | null> => {
    const sessionUser = req.session.user;
    return sessionUser ? await getUserById(sessionUser.stu_no) : null;
};

/**
 * 认证中间件 - 检查用户是否已登录
 * @param req - Express请求对象
 * @param res - Express响应对象
 * @param next - 下一个中间件函数
 */
export const auth = async (req: any, res: any, next: any): Promise<void> => {
    // 跳过静态文件路径和无需认证的API
    if (req.path.startsWith('/node_modules/') ||
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/images/') ||
        req.path.startsWith('/public/') ||
        req.path.startsWith('/api/login')) {
        return next();
    }

    const user = await getUser(req);
    if (!user) {
        // 区分API请求和页面请求
        if (req.path.startsWith('/api/')) {
            res.status(401).json({
                success: false,
                message: '未授权访问',
                timestamp: new Date().toISOString()
            });
        } else {
            res.redirect('/login');
        }
        return;
    }

    // 检查密码是否需要修改
    if (cryptPwd(user.stu_no) === user.stu_password &&
        req.path !== '/password' &&
        req.path !== '/logout' &&
        req.path !== '/api/change-password') {
        // 区分API请求和页面请求
        if (req.path.startsWith('/api/')) {
            res.status(403).json({
                success: false,
                message: '请先修改默认密码',
                timestamp: new Date().toISOString()
            });
        } else {
            res.redirect('/password');
        }
        return;
    }

    next();
};

/**
 * 管理员权限认证中间件 - 检查用户是否为管理员
 * 0: 学生，1: 普通管理员，>=5: 超级管理员
 * @param req - Express请求对象
 * @param res - Express响应对象
 * @param next - 下一个中间件函数
 */
export const opAuth = async (req: any, res: any, next: any): Promise<void> => {
    const user = await getUser(req);
    if (user && parseInt(user.stu_userlevel) >= 1) {
        next();
    } else {
        // 区分API请求和页面请求
        if (req.path.startsWith('/api/')) {
            res.status(403).json({
                success: false,
                message: '权限不足：需要管理员权限',
                timestamp: new Date().toISOString()
            });
        } else {
            res.redirect('/');
        }
    }
};

/**
 * 超级管理员权限认证中间件 - 检查用户是否为超级管理员
 * @param req - Express请求对象
 * @param res - Express响应对象
 * @param next - 下一个中间件函数
 */
export const superAdminAuth = async (req: any, res: any, next: any): Promise<void> => {
    const user = await getUser(req);
    if (user && parseInt(user.stu_userlevel) >= 5) {
        next();
    } else {
        res.redirect('/');
    }
};

/**
 * 普通用户权限认证中间件 - 检查用户是否为普通用户（userlevel=0）
 * @param req - Express请求对象
 * @param res - Express响应对象
 * @param next - 下一个中间件函数
 */
export const studentAuth = async (req: any, res: any, next: any): Promise<void> => {
    const user = await getUser(req);
    if (user && parseInt(user.stu_userlevel) === 0) {
        next();
    } else {
        // 区分API请求和页面请求
        if (req.path.startsWith('/api/')) {
            res.status(403).json({
                success: false,
                message: '权限不足：只有普通用户才能访问',
                timestamp: new Date().toISOString()
            });
        } else {
            res.redirect('/');
        }
    }
};

/**
 * 未认证中间件 - 检查用户是否未登录
 * @param req - Express请求对象
 * @param res - Express响应对象
 * @param next - 下一个中间件函数
 */
export const noAuth = async (req: any, res: any, next: any): Promise<void> => {
    const user = await getUser(req);
    if (user) {
        // 已登录用户跳转到主页
        res.redirect('/');
    } else {
        next();
    }
};
