/**
 * WebRTC监控系统主应用文件
 * 重构后的简化架构，移除模板渲染，使用纯API模式
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import express, { Application } from 'express';
import session from 'express-session';
import { default as RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import { ExpressPeerServer } from 'peer';
import { Server as SocketIOServer } from 'socket.io';
import 'express-async-errors';

import { serverConfig, networkConfig, videoConfig, databaseConfig } from '../config';
import { errorHandler } from './middleware/errorHandler';
import { setupRoutes } from './routes';
import { setupSocketHandlers } from './services/socketHandler';
import { initializeUsers, setupTimeChecker } from './services/userManager';

/**
 * 应用实例接口
 */
interface AppInstance {
    app: Application;
    server: https.Server;
    io: SocketIOServer;
}

/**
 * 创建并配置Express应用
 */
const createApp = async (): Promise<AppInstance> => {
    const app: Application = express();

    // 创建HTTPS服务器
    const server = https.createServer({
        key: fs.readFileSync(serverConfig.keyPath),
        cert: fs.readFileSync(serverConfig.certPath),
        // 添加WebSocket支持的选项
        requestCert: false,
        rejectUnauthorized: false
    }, app);

    // 基础中间件
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // 静态文件服务 - 必须在路由设置之前
    // 动态计算项目根目录路径（兼容开发和生产环境）
    // 在生产环境中，__dirname是 /path/to/project/dist/src
    // 在开发环境中，__dirname是 /path/to/project/src
    const projectRoot = __dirname.includes('dist')
        ? path.resolve(__dirname, '../..') // 生产环境：从 dist/src 回到项目根目录
        : path.resolve(__dirname, '..'); // 开发环境：从 src 回到项目根目录

    console.log('项目根目录:', projectRoot);
    console.log('当前目录:', __dirname);

    app.use('/assets', express.static(path.join(projectRoot, 'assets')));
    app.use('/images', express.static(path.join(projectRoot, 'images')));
    app.use('/public', express.static(path.join(projectRoot, 'public')));
    app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));

    // Redis客户端设置
    const redisClient = createClient({
        url: 'redis://127.0.0.1:6379'
    });

    redisClient.on('error', (err) => {
        errorHandler.expressErrorHandler(err as Error, {} as any, {} as any, () => {});
    });
    
    await redisClient.connect();

    // Session配置
    app.use(session({
        store: new RedisStore({ client: redisClient }),
        secret: serverConfig.sessionSecret,
        resave: false,
        saveUninitialized: false, // 只有在session被修改时才保存
        cookie: {
            secure: true, // HTTPS环境必须设置为true
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24小时
            sameSite: 'lax' // 允许同站点请求携带cookie
        }
    }));

    // WebRTC服务器
    const webRTCServer = ExpressPeerServer(server, {
        path: '/',
        allow_discovery: true
    });
    app.use('/webrtc', webRTCServer);

    // Socket.IO服务器
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
        console.log('🔌 正在创建Socket.IO服务器...');
    }

    const io = new SocketIOServer(server, {
        pingInterval: 25000,
        pingTimeout: 60000,
        maxHttpBufferSize: 1e8,
        transports: ['polling', 'websocket'],
        cors: {
            origin: true, // 允许所有来源，因为是同域访问
            credentials: true,
            methods: ["GET", "POST"],
            allowedHeaders: ["*"]
        },
        allowEIO3: true,
        upgradeTimeout: 30000,
        httpCompression: false
    });

    if (isDevelopment) {
        console.log('✅ Socket.IO服务器创建完成');
    }

    // 仅在开发环境添加调试事件监听
    if (isDevelopment) {
        io.engine.on('connection_error', (err) => {
            console.error('❌ Socket.IO引擎连接错误:', err);
        });

        io.engine.on('connection', (socket) => {
            console.log('🔗 Engine.IO连接建立:', {
                id: socket.id,
                transport: socket.transport.name,
                readyState: socket.readyState
            });

            socket.on('upgrade', () => {
                console.log('⬆️ 传输升级到WebSocket:', socket.id);
            });

            socket.on('upgradeError', (err: any) => {
                console.error('❌ WebSocket升级失败:', err);
            });
        });
    }

    // 设置Socket处理和错误处理
    setupSocketHandlers(io);
    errorHandler.socketErrorHandler(io);

    // 设置路由
    setupRoutes(app, io);

    // 健康检查路由
    app.get('/health', (req, res) => {
        const health = errorHandler.getHealthStatus();
        res.status(health.status === 'healthy' ? 200 : 503).json({
            ...health,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    // 全局错误处理中间件（必须在最后）
    app.use(errorHandler.expressErrorHandler);

    return { app, server, io };
};

/**
 * 设置配置文件监控
 */
const setupConfigWatcher = (): void => {
    const configPath = path.resolve(__dirname, '../config.ts');
    
    console.log('📁 正在设置配置文件监控:', configPath);
    
    fs.watchFile(configPath, (curr, prev) => {
        console.log('🔄 检测到配置文件变化，正在重载配置...');
        
        try {
            // 清除require缓存
            delete require.cache[configPath];
            
            // 重新加载配置
            const newConfig = require('../config');
            
            // 更新内存中的配置对象
            Object.assign(serverConfig, newConfig.serverConfig);
            Object.assign(databaseConfig, newConfig.databaseConfig);
            Object.assign(videoConfig, newConfig.videoConfig);
            Object.assign(networkConfig, newConfig.networkConfig);
            
            console.log('✅ 配置文件重载成功！');
            console.log('🔄 新配置已生效，需要重启服务器以应用网络配置变化');
        } catch (error) {
            console.error('❌ 配置文件重载失败:', error);
            console.error('⚠️ 请检查配置文件语法是否正确');
        }
    });
};

/**
 * 启动服务器
 */
const startServer = async (): Promise<AppInstance> => {
    try {
        console.log('正在初始化数据库连接...');
        await initializeUsers();

        console.log('正在创建应用实例...');
        const { app, server, io } = await createApp();

        console.log('正在设置定时任务...');
        setupTimeChecker(io);
        
        // 设置配置文件监控
        setupConfigWatcher();

        console.log(`正在启动HTTPS服务器，端口: ${networkConfig.socketPort}`);
        server.listen(networkConfig.socketPort, () => {
            console.log(`✅ WebRTC监控系统启动成功！`);
            console.log(`🌐 HTTPS服务器运行在: https://127.0.0.1:${networkConfig.socketPort}`);
            console.log(`🔍 健康检查: https://127.0.0.1:${networkConfig.socketPort}/health`);
            console.log(`📁 配置文件监控已启用，修改config.ts将自动重载`);
        });

        return { app, server, io };
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        throw error;
    }
};

/**
 * 优雅关闭
 */
const gracefulShutdown = (signal: string) => {
    console.log(`\n收到 ${signal} 信号，正在优雅关闭服务器...`);
    
    // 这里可以添加清理逻辑
    setTimeout(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    }, 1000);
};

// 注册优雅关闭信号处理
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * 启动应用程序
 */
async function main(): Promise<void> {
    try {
        console.log('🚀 正在启动WebRTC监控系统...');
        await startServer();
    } catch (error) {
        console.error('💥 启动失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件，则启动应用
if (require.main === module) {
    main();
}

export { main, createApp, startServer };