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

import {
    configManager,
    getServerConfig,
    getNetworkConfig,
    getVideoConfig,
    getDatabaseConfig,
    getRedisConfig
} from './config';
import { errorHandler } from './middleware/errorHandler';
import { setupRoutes } from './routes';
import { setupSocketHandlers } from './services/socketHandler';
import { initializeUsers, setupTimeChecker } from './services/userManager';
import { recreatePool } from './services/database';

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

    // 获取当前配置
    const serverConfig = getServerConfig();
    const networkConfig = getNetworkConfig();
    const redisConfig = getRedisConfig();

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
    // 计算项目根目录路径（现在src直接编译到dist，所以都是回到上一级）
    const projectRoot = path.resolve(__dirname, '..');

    console.log('项目根目录:', projectRoot);
    console.log('当前目录:', __dirname);

    app.use('/assets', express.static(path.join(projectRoot, 'assets')));
    app.use('/images', express.static(path.join(projectRoot, 'images')));
    app.use('/public', express.static(path.join(projectRoot, 'public')));
    app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));

    // Redis客户端设置
    const redisUrl = redisConfig.password
        ? `redis://:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
        : `redis://${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`;

    const redisClient = createClient({
        url: redisUrl
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
 * 设置配置更新监听器
 */
const setupConfigWatcher = (): void => {
    // 使用新的配置管理器的监听功能
    configManager.addConfigListener((event) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔄 配置段 ${event.section} 已更新`);
        }

        // 根据配置类型执行相应的更新操作
        switch (event.section) {
            case 'database':
                // 数据库配置更新时重新创建连接池
                try {
                    recreatePool();
                    if (process.env.NODE_ENV !== 'production') {
                        console.log('✅ 数据库连接池已重新创建');
                    }
                } catch (error) {
                    console.error('❌ 数据库连接池重新创建失败:', error);
                }
                break;
            case 'network':
                console.log('⚠️ 网络配置更改需要重启服务器才能生效');
                break;
            case 'server':
                console.log('⚠️ 服务器配置更改需要重启服务器才能生效');
                break;
            default:
                if (process.env.NODE_ENV !== 'production') {
                    console.log('✅ 配置已热更新');
                }
                break;
        }
    });

    if (process.env.NODE_ENV !== 'production') {
        console.log('📁 配置文件监控已启用');
    }
};

/**
 * 启动服务器
 */
const startServer = async (): Promise<AppInstance> => {
    try {
        if (process.env.NODE_ENV !== 'production') {
            console.log('正在初始化数据库连接...');
        }
        await initializeUsers();

        if (process.env.NODE_ENV !== 'production') {
            console.log('正在创建应用实例...');
        }
        const { app, server, io } = await createApp();

        if (process.env.NODE_ENV !== 'production') {
            console.log('正在设置定时任务...');
        }
        setupTimeChecker(io);

        // 设置配置文件监控
        setupConfigWatcher();

        const networkConfig = getNetworkConfig();
        if (process.env.NODE_ENV !== 'production') {
            console.log(`正在启动HTTPS服务器，端口: ${networkConfig.socketPort}`);
        }
        server.listen(networkConfig.socketPort, '0.0.0.0', () => {
            console.log(`✅ WebRTC监控系统启动成功！`);
            console.log(`🌐 HTTPS服务器运行在: https://0.0.0.0:${networkConfig.socketPort}`);
            console.log(`🔍 健康检查: https://0.0.0.0:${networkConfig.socketPort}/health`);
            console.log(`📁 配置文件监控已启用，修改配置文件将自动重载`);
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
    console.log(`\n收到 ${signal} 信号，正在关闭服务器...`);
    
    // 这里可以添加清理逻辑
    setTimeout(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    }, 1000);
};

/**
 * 启动应用程序
 */
async function main(): Promise<void> {
    try {
        // 输出环境信息
        const nodeEnv = process.env.NODE_ENV || "";
        console.log(`📋 当前环境: ${nodeEnv}`);

        // 注册优雅关闭信号处理（只在主进程中注册）
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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