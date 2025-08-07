/**
 * 默认配置值
 * 这些是安全的默认值，敏感信息通过环境变量或配置文件覆盖
 */

import { AppConfig } from './types';

export const defaultConfig: AppConfig = {
    server: {
        sessionSecret: process.env.SESSION_SECRET || 'default-session-secret-change-in-production',
        savePath: process.env.SAVE_PATH || './recordings',
        certPath: process.env.CERT_PATH || './ssl/cert.crt',
        keyPath: process.env.KEY_PATH || './ssl/private.key',
    },
    
    database: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306'),
        database: process.env.DB_NAME || 'webrtc',
        user: process.env.DB_USER || 'WebRTC',
        password: process.env.DB_PASSWORD || '',
        stulist: (process.env.DB_STULIST as 'monitor' | 'exam') || 'monitor',
        type: (process.env.DB_TYPE as 'valid' | 'all') || 'all',
        term: process.env.DB_TERM || '2022/2023/2',
        cno: process.env.DB_CNO || '100084',
        eno: process.env.DB_ENO || '04',
        endtime: process.env.DB_ENDTIME || '3023-01-01 00:00:00',
    },
    
    video: {
        width: parseInt(process.env.VIDEO_WIDTH || '1920'),
        height: parseInt(process.env.VIDEO_HEIGHT || '1080'),
        frameRate: parseInt(process.env.VIDEO_FRAMERATE || '15'),
        sliceTime: parseInt(process.env.VIDEO_SLICE_TIME || '3000'),
        allowRecord: {
            screen: {
                enabled: process.env.SCREEN_RECORD_ENABLED !== 'false',
                maxDevices: parseInt(process.env.SCREEN_MAX_DEVICES || '3')
            },
            camera: {
                enabled: process.env.CAMERA_RECORD_ENABLED === 'true',
                maxDevices: parseInt(process.env.CAMERA_MAX_DEVICES || '2')
            },
        },
        mimeType: process.env.VIDEO_MIME_TYPE || 'video/webm;codecs=h264',
        videoBitsPerSecond: parseInt(process.env.VIDEO_BITRATE || '2500000'),
        audioBitsPerSecond: parseInt(process.env.AUDIO_BITRATE || '128000'),
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '100'),
    },
    
    network: {
        socketPort: parseInt(process.env.SOCKET_PORT || '7080'),
        turnServerPort: parseInt(process.env.TURN_SERVER_PORT || '7100'),
        turnServerUsername: process.env.TURN_SERVER_USERNAME || 'default-username',
        turnServerCredential: process.env.TURN_SERVER_CREDENTIAL || 'default-credential',
    },
    
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
    }
};
