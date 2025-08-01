const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const { ExpressPeerServer } = require("peer");
const { Server } = require("socket.io");
require('express-async-errors');

const { serverConfig, networkConfig } = require('./config');

// 导入路由
const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const filesRouter = require('./routes/files');

// 导入服务
const { setupSocketHandlers } = require('./services/socketHandler');
const { initializeUsers, setupTimeChecker } = require('./services/userManager');

/**
 * 创建并配置Express应用
 * @returns {Object} 包含app和server的对象
 */
const createApp = async () => {
    const app = express();
    
    // 创建HTTPS服务器
    const server = https.createServer({
        key: fs.readFileSync(serverConfig.keyPath),
        cert: fs.readFileSync(serverConfig.certPath)
    }, app);

    // 设置模板引擎
    app.engine('html', require('express-art-template'));
    app.set('view options', { debug: false });
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'html');

    // 基础中间件
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '/')));

    // Redis客户端设置
    const redisClient = createClient({
        url: 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    await redisClient.connect();

    // Session配置
    app.use(session({
        store: new RedisStore({ client: redisClient }),
        secret: serverConfig.sessionSecret,
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: true,
            httpOnly: true
        }
    }));

    // WebRTC服务器
    const webRTCServer = ExpressPeerServer(server, {
        path: '/',
    });
    app.use('/webrtc', webRTCServer);

    // Socket.IO服务器
    const io = new Server(server, {
        pingInterval: 10000,
        pingTimeout: 60000,
        maxHttpBufferSize: 1e8
    });

    // 设置Socket处理
    setupSocketHandlers(io);

    // 注入io实例到API路由
    apiRouter.setSocketIO(io);

    // 设置路由
    app.use('/', pagesRouter);
    app.use('/', apiRouter);
    app.use('/', authRouter);
    app.use('/', filesRouter);

    // 错误处理中间件
    app.use(function (err, req, res, next) {
        console.log("=====================ERROR=====================", err);
        res.status(500).send('Something went wrong!');
    });

    return { app, server, io };
};

/**
 * 启动服务器
 * @returns {Object} 服务器实例
 */
const startServer = async () => {
    try {
        // 初始化用户数据
        await initializeUsers();
        
        // 创建应用
        const { app, server, io } = await createApp();
        
        // 设置时间检查器
        setupTimeChecker(io);
        
        // 启动服务器
        server.listen(networkConfig.socketPort, () => {
            console.log(`服务器运行在端口 ${networkConfig.socketPort}`);
        });
        
        return { app, server, io };
    } catch (error) {
        console.error('服务器启动失败:', error);
        throw error;
    }
};

module.exports = {
    createApp,
    startServer
};
