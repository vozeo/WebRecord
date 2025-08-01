/**
 * WebRTC监控系统主入口文件
 * 负责启动服务器和协调各个模块
 */

const { startServer } = require('./server');

/**
 * 启动应用程序
 */
async function main() {
    try {
        console.log('正在启动WebRTC监控系统...');
        await startServer();
        console.log('WebRTC监控系统启动成功！');
    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

// 启动应用
main();
