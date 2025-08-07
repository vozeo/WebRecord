/**
 * 路由配置文件
 * 统一管理所有路由，移除模板渲染依赖
 */

import { Application } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { errorHandler } from '../middleware/errorHandler';
import { auth, opAuth, noAuth } from '../middleware/auth';

// 导入控制器
import { createApiController } from '../controllers/apiController';
import { createAuthController } from '../controllers/authController';
import { createPageController } from '../controllers/pageController';
import { createFileController } from '../controllers/fileController';

/**
 * 设置所有路由
 */
export const setupRoutes = (app: Application, io: SocketIOServer): void => {
    try {
        // 使用错误处理包装器
        const asyncHandler = errorHandler.asyncHandler;

        // 创建控制器实例
        const apiController = createApiController(io);
        const authController = createAuthController();
        const pageController = createPageController();
        const fileController = createFileController();

        // API路由 - 所有业务逻辑API
        app.get('/api/information', auth, asyncHandler(apiController.getInformation[0]));
        app.get('/api/system-status', auth, opAuth, asyncHandler(apiController.getSystemStatus[0]));
        app.get('/api/stulist', auth, opAuth, asyncHandler(apiController.getStudentList[0]));
        app.get('/api/supervisors', auth, opAuth, asyncHandler(apiController.getSupervisorsList[0]));
        app.get('/api/recorded-files', auth, opAuth, asyncHandler(apiController.getRecordedFiles[0]));
        app.get('/api/recording-status', auth, opAuth, asyncHandler(apiController.getRecordingStatus[0]));
        app.post('/api/user-status', auth, opAuth, asyncHandler(apiController.updateUserStatus[0]));
        app.post('/api/emit', auth, opAuth, asyncHandler(apiController.emitMessage[0]));
        app.post('/api/manage', auth, opAuth, asyncHandler(apiController.manageExam[0]));
        app.post('/api/log-error', asyncHandler(apiController.logError[0])); // 错误日志记录，不需要特殊权限

        // 认证路由
        app.post('/api/login', asyncHandler(authController.login));
        app.post('/api/logout', auth, asyncHandler(authController.logout));
        app.post('/api/change-password', auth, asyncHandler(authController.changePassword));
        app.get('/api/check-auth', asyncHandler(authController.checkAuth));

        // 文件路由
        app.get('/api/download/:studentId/:filename', auth, opAuth, asyncHandler(fileController.downloadFile[0]));
        app.get('/api/play/:studentId/:filename', auth, opAuth, asyncHandler(fileController.playVideo[0]));
        app.head('/api/play/:studentId/:filename', auth, opAuth, asyncHandler(fileController.playVideoHead[0]));
        app.delete('/api/files/:studentId/:filename', auth, opAuth, asyncHandler(fileController.deleteFile[0]));

        // 页面路由 - 返回静态HTML文件
        app.get('/', auth, pageController.index);
        app.get('/login', noAuth, pageController.login);
        app.get('/record', auth, pageController.record);
        app.get('/monitor', auth, opAuth, pageController.monitor);
        app.get('/history', auth, opAuth, pageController.history);
        app.get('/password', auth, pageController.password);
        app.get('/live', auth, opAuth, pageController.live);



        console.log('✅ 路由设置完成');
    } catch (error) {
        console.error('❌ 路由设置失败:', error);
        throw error;
    }
};