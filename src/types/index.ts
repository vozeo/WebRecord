/**
 * 全局类型定义
 */

import { Request } from 'express';

/**
 * 用户信息接口
 */
export interface User {
    stu_no: string;
    stu_name: string;
    stu_userlevel: string;
    stu_enable: string;
    stu_password: string;
    [key: string]: any;
}

/**
 * 扩展Request接口，包含session
 */
export interface AuthenticatedRequest extends Request {
    session: any;
}

/**
 * API响应接口
 */
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    timestamp: string;
}

/**
 * 配置接口
 */
export interface VideoConfig {
    width: number;
    height: number;
    frameRate: number;
    sliceTime: number;
}

export interface NetworkConfig {
    socketPort: number;
    [key: string]: any;
}

export interface ServerConfig {
    keyPath: string;
    certPath: string;
    savePath: string;
    sessionSecret: string;
}

export interface DatabaseConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    stulist: string;
    term?: string;
    cno?: string;
    eno?: string;
    type: string;
}

/**
 * 文件信息接口
 */
export interface FileInfo {
    modificationTime: number;
    fileSize: number;
}

/**
 * 学生录制文件信息接口
 */
export interface StudentRecordInfo {
    studentId: string;
    modificationTimeStr: string;
    timeDiff: number;
    isBelowThreshold: boolean;
    fileSize: string;
}

/**
 * 用户状态接口
 */
export interface UserState {
    stu_no: string;
    stu_name: string;
    stu_userlevel: string;
    online: number;
    screen: string;
    camera: string;
    [key: string]: any;
}

/**
 * Socket事件类型
 */
export type SocketEventType = 'record' | 'notice' | 'disable' | 'state';

/**
 * 错误类型
 */
export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 400);
        this.name = 'ValidationError';
    }
}

/**
 * 未授权错误
 */
export class UnauthorizedError extends AppError {
    constructor(message: string = '未授权访问') {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}

/**
 * 资源不存在错误
 */
export class NotFoundError extends AppError {
    constructor(message: string = '资源不存在') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}