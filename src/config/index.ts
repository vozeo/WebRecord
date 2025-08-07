/**
 * 配置模块入口
 * 提供统一的配置访问接口
 */

// 导入dotenv以支持.env文件
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 导出配置管理器和便捷访问函数
export {
    configManager,
    getConfig,
    getServerConfig,
    getDatabaseConfig,
    getVideoConfig,
    getNetworkConfig,
    getRedisConfig
} from './manager';

// 导出类型定义
export * from './types';

// 导出默认配置（用于测试和参考）
export { defaultConfig } from './defaults';

// 为了向后兼容，导出传统的配置对象
import { 
    getServerConfig, 
    getDatabaseConfig, 
    getVideoConfig, 
    getNetworkConfig,
    getRedisConfig,
    configManager 
} from './manager';

// 传统配置对象（向后兼容）
export const serverConfig = getServerConfig();
export const databaseConfig = getDatabaseConfig();
export const videoConfig = getVideoConfig();
export const networkConfig = getNetworkConfig();
export const redisConfig = getRedisConfig();

// MySQL连接配置（向后兼容）
export const mysqlConnectionConfig = {
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.database,
    user: databaseConfig.user,
    password: databaseConfig.password,
};

// 配置更新监听器
configManager.addConfigListener((event) => {
    // 当配置更新时，更新导出的配置对象
    switch (event.section) {
        case 'server':
            Object.assign(serverConfig, event.newValue);
            break;
        case 'database':
            Object.assign(databaseConfig, event.newValue);
            // 同时更新MySQL连接配置
            Object.assign(mysqlConnectionConfig, {
                host: event.newValue.host,
                port: event.newValue.port,
                database: event.newValue.database,
                user: event.newValue.user,
                password: event.newValue.password,
            });
            break;
        case 'video':
            Object.assign(videoConfig, event.newValue);
            break;
        case 'network':
            Object.assign(networkConfig, event.newValue);
            break;
        case 'redis':
            Object.assign(redisConfig, event.newValue);
            break;
    }
});


