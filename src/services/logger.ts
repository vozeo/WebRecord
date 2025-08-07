/**
 * 统一日志管理工具
 * 根据环境变量控制日志输出级别
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

class Logger {
    private static instance: Logger;
    private isProduction: boolean;

    private constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * 调试日志 - 只在开发环境输出
     */
    public debug(message: string, ...args: any[]): void {
        if (!this.isProduction) {
            console.log(`🔍 [DEBUG] ${message}`, ...args);
        }
    }

    /**
     * 信息日志 - 只在开发环境输出
     */
    public info(message: string, ...args: any[]): void {
        if (!this.isProduction) {
            console.log(`ℹ️ [INFO] ${message}`, ...args);
        }
    }

    /**
     * 警告日志 - 所有环境都输出
     */
    public warn(message: string, ...args: any[]): void {
        console.warn(`⚠️ [WARN] ${message}`, ...args);
    }

    /**
     * 错误日志 - 所有环境都输出
     */
    public error(message: string, ...args: any[]): void {
        console.error(`❌ [ERROR] ${message}`, ...args);
    }

    /**
     * 系统日志 - 重要的系统事件，所有环境都输出
     */
    public system(message: string, ...args: any[]): void {
        console.log(`🚀 [SYSTEM] ${message}`, ...args);
    }

    /**
     * 网络日志 - Socket连接等网络事件，只在开发环境输出详细信息
     */
    public network(message: string, ...args: any[]): void {
        if (this.isProduction) {
            // 生产环境只输出简化信息
            console.log(`🔗 ${message.split(':')[0]}`);
        } else {
            console.log(`🔗 [NETWORK] ${message}`, ...args);
        }
    }

    /**
     * 业务日志 - 用户操作等业务事件，只在开发环境输出
     */
    public business(message: string, ...args: any[]): void {
        if (!this.isProduction) {
            console.log(`📋 [BUSINESS] ${message}`, ...args);
        }
    }

    /**
     * 性能日志 - 性能相关信息，只在开发环境输出
     */
    public performance(message: string, ...args: any[]): void {
        if (!this.isProduction) {
            console.log(`⚡ [PERF] ${message}`, ...args);
        }
    }

    /**
     * 检查是否为生产环境
     */
    public isProductionMode(): boolean {
        return this.isProduction;
    }
}

// 导出单例实例
export const logger = Logger.getInstance();

// 导出便捷函数
export const log = {
    debug: (message: string, ...args: any[]) => logger.debug(message, ...args),
    info: (message: string, ...args: any[]) => logger.info(message, ...args),
    warn: (message: string, ...args: any[]) => logger.warn(message, ...args),
    error: (message: string, ...args: any[]) => logger.error(message, ...args),
    system: (message: string, ...args: any[]) => logger.system(message, ...args),
    network: (message: string, ...args: any[]) => logger.network(message, ...args),
    business: (message: string, ...args: any[]) => logger.business(message, ...args),
    performance: (message: string, ...args: any[]) => logger.performance(message, ...args),
};
