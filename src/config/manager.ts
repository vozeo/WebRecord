/**
 * 配置管理器
 * 基于 .env 文件的配置管理，支持热更新
 */

import * as fs from 'fs';
import * as path from 'path';

import { EventEmitter } from 'events';
import { AppConfig, ConfigUpdateEvent, ConfigListener } from './types';
import { defaultConfig } from './defaults';
import { logger } from '../services/logger';

class ConfigManager extends EventEmitter {
    private static instance: ConfigManager;
    private config: AppConfig = { ...defaultConfig };
    private envFilePath: string;
    private watchers: fs.FSWatcher[] = [];
    private configListeners: ConfigListener[] = [];
    private envCache: { [key: string]: string } = {};

    private constructor() {
        super();
        this.envFilePath = this.getEnvFilePath();
        this.loadConfig();
        this.setupFileWatcher();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * 获取 .env 文件路径
     */
    private getEnvFilePath(): string {
        const envFileName = process.env.ENV_FILE || '.env';

        // 优先级：环境变量指定 > 项目根目录 > 当前目录
        const possiblePaths = [
            process.env.ENV_PATH ? path.resolve(process.env.ENV_PATH, envFileName) : null,
            path.resolve(process.cwd(), envFileName),
            path.resolve(__dirname, '../../', envFileName),
            path.resolve(__dirname, envFileName),
        ].filter(Boolean) as string[];

        for (const envPath of possiblePaths) {
            if (fs.existsSync(envPath)) {
                logger.system(`使用环境变量文件: ${envPath}`);
                return envPath;
            }
        }

        // 如果没有找到 .env 文件，使用默认路径
        const defaultPath = path.resolve(process.cwd(), envFileName);
        logger.system(`环境变量文件不存在，将使用默认路径: ${defaultPath}`);
        return defaultPath;
    }

    /**
     * 加载配置
     */
    private loadConfig(): void {
        try {
            // 加载 .env 文件
            this.loadEnvFile();

            // 基于环境变量重新构建配置
            this.config = { ...defaultConfig };

            // 验证配置
            this.validateConfig();

            logger.system(`配置加载成功，基于环境变量文件: ${this.envFilePath}`);

        } catch (error) {
            logger.error(`配置加载失败: ${error}`);
            logger.system('使用默认配置');
            this.config = { ...defaultConfig };
        }
    }

    /**
     * 加载 .env 文件
     */
    private loadEnvFile(): void {
        if (fs.existsSync(this.envFilePath)) {
            // 读取 .env 文件内容
            const envContent = fs.readFileSync(this.envFilePath, 'utf8');

            // 解析环境变量
            const envVars = this.parseEnvContent(envContent);

            // 更新 process.env 和缓存
            Object.keys(envVars).forEach(key => {
                process.env[key] = envVars[key];
                this.envCache[key] = envVars[key];
            });

            logger.system(`环境变量文件加载成功: ${this.envFilePath}`);
        } else {
            logger.system(`环境变量文件不存在: ${this.envFilePath}`);
        }
    }

    /**
     * 解析 .env 文件内容
     */
    private parseEnvContent(content: string): { [key: string]: string } {
        const result: { [key: string]: string } = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();

            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // 解析 KEY=VALUE 格式
            const equalIndex = trimmedLine.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmedLine.substring(0, equalIndex).trim();
                let value = trimmedLine.substring(equalIndex + 1).trim();

                // 移除引号
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                result[key] = value;
            }
        }

        return result;
    }



    /**
     * 验证配置
     */
    private validateConfig(): void {
        const requiredFields = [
            'server.sessionSecret',
            'database.host',
            'database.user',
            'database.password',
            'network.socketPort'
        ];

        for (const field of requiredFields) {
            const value = this.getNestedValue(this.config, field);
            if (!value) {
                throw new Error(`必需的配置项缺失: ${field}`);
            }
        }

        // 验证端口号
        if (this.config.network.socketPort < 1 || this.config.network.socketPort > 65535) {
            throw new Error('Socket端口号必须在1-65535之间');
        }

        // 验证数据库端口
        if (this.config.database.port < 1 || this.config.database.port > 65535) {
            throw new Error('数据库端口号必须在1-65535之间');
        }
    }

    /**
     * 获取嵌套对象的值
     */
    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * 设置文件监听器
     */
    private setupFileWatcher(): void {
        if (!fs.existsSync(this.envFilePath)) {
            // 监听目录，等待 .env 文件创建
            const envDir = path.dirname(this.envFilePath);
            if (fs.existsSync(envDir)) {
                const dirWatcher = fs.watch(envDir, (eventType, filename) => {
                    if (filename === path.basename(this.envFilePath) && eventType === 'rename') {
                        if (fs.existsSync(this.envFilePath)) {
                            logger.system('检测到环境变量文件创建，开始监听');
                            this.setupFileWatcher();
                            this.reloadConfig();
                        }
                    }
                });
                this.watchers.push(dirWatcher);
            }
            return;
        }

        // 监听 .env 文件变化
        const fileWatcher = fs.watch(this.envFilePath, (eventType) => {
            if (eventType === 'change') {
                logger.system('检测到环境变量文件变化，重新加载配置');
                setTimeout(() => this.reloadConfig(), 100); // 延迟一点避免文件写入未完成
            }
        });

        this.watchers.push(fileWatcher);
        logger.system(`环境变量文件监听已启动: ${this.envFilePath}`);
    }

    /**
     * 重新加载配置
     */
    private reloadConfig(): void {
        try {
            const oldConfig = { ...this.config };
            this.loadConfig();
            
            // 触发配置更新事件
            this.emitConfigUpdate(oldConfig, this.config);
            
        } catch (error) {
            logger.error(`配置重载失败: ${error}`);
        }
    }

    /**
     * 触发配置更新事件
     */
    private emitConfigUpdate(oldConfig: AppConfig, newConfig: AppConfig): void {
        const sections: (keyof AppConfig)[] = ['server', 'database', 'video', 'network', 'redis'];
        
        for (const section of sections) {
            if (JSON.stringify(oldConfig[section]) !== JSON.stringify(newConfig[section])) {
                const event: ConfigUpdateEvent = {
                    section,
                    oldValue: oldConfig[section],
                    newValue: newConfig[section],
                    timestamp: new Date()
                };
                
                this.emit('configUpdate', event);
                
                // 调用注册的监听器
                this.configListeners.forEach(listener => {
                    try {
                        listener(event);
                    } catch (error) {
                        logger.error(`配置监听器执行失败: ${error}`);
                    }
                });
                
                logger.system(`配置段 ${section} 已更新`);
            }
        }
    }

    /**
     * 获取完整配置
     */
    public getConfig(): AppConfig {
        return { ...this.config };
    }

    /**
     * 获取特定配置段
     */
    public getSection<T extends keyof AppConfig>(section: T): AppConfig[T] {
        return { ...this.config[section] };
    }

    /**
     * 添加配置监听器
     */
    public addConfigListener(listener: ConfigListener): void {
        this.configListeners.push(listener);
    }

    /**
     * 移除配置监听器
     */
    public removeConfigListener(listener: ConfigListener): void {
        const index = this.configListeners.indexOf(listener);
        if (index > -1) {
            this.configListeners.splice(index, 1);
        }
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        this.watchers.forEach(watcher => watcher.close());
        this.watchers = [];
        this.configListeners = [];
        this.removeAllListeners();
    }
}

// 导出单例实例
export const configManager = ConfigManager.getInstance();

// 导出便捷访问函数
export const getConfig = () => configManager.getConfig();
export const getServerConfig = () => configManager.getSection('server');
export const getDatabaseConfig = () => configManager.getSection('database');
export const getVideoConfig = () => configManager.getSection('video');
export const getNetworkConfig = () => configManager.getSection('network');
export const getRedisConfig = () => configManager.getSection('redis');
