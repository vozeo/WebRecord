/**
 * 配置类型定义
 */

/**
 * 服务器配置接口
 */
export interface ServerConfig {
    sessionSecret: string;
    savePath: string;
    certPath: string;
    keyPath: string;
}

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    stulist: 'monitor' | 'exam';
    type: 'valid' | 'all';
    term?: string;
    cno?: string;
    eno?: string;
    endtime?: string;
}

/**
 * MySQL连接配置接口
 */
export interface MysqlConnectionConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

/**
 * 视频配置接口 - 支持多设备录制
 */
export interface VideoConfig {
    width: number;
    height: number;
    frameRate: number;
    sliceTime: number;
    allowRecord: {
        screen: {
            enabled: boolean;
            maxDevices: number;  // 0表示禁用，>0表示最大设备数
        };
        camera: {
            enabled: boolean;
            maxDevices: number;  // 0表示禁用，>0表示最大设备数
        };
    };
    mimeType: string;
    videoBitsPerSecond?: number;
    audioBitsPerSecond?: number;
    maxFileSize?: number;        // 单个文件最大大小(MB)
}

/**
 * 网络配置接口
 */
export interface NetworkConfig {
    socketPort: number;
    turnServerPort: number;
    turnServerUsername: string;
    turnServerCredential: string;
}

/**
 * Redis配置接口
 */
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
}

/**
 * 应用配置接口
 */
export interface AppConfig {
    server: ServerConfig;
    database: DatabaseConfig;
    video: VideoConfig;
    network: NetworkConfig;
    redis: RedisConfig;
}

/**
 * 配置更新事件类型
 */
export type ConfigUpdateEvent = {
    section: keyof AppConfig;
    oldValue: any;
    newValue: any;
    timestamp: Date;
};

/**
 * 配置监听器类型
 */
export type ConfigListener = (event: ConfigUpdateEvent) => void | Promise<void>;
