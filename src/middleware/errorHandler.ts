/**
 * 全局错误处理中间件
 * 确保任何错误都不会导致服务器崩溃
 */

import { Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';

/**
 * 日志接口
 */
interface ErrorLog {
    timestamp: string;
    error: string;
    stack?: string;
    url?: string;
    method?: string;
    ip?: string;
    userAgent?: string;
}

/**
 * 错误处理类
 */
export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorLogs: ErrorLog[] = [];
    private maxLogs = 1000; // 最大保存错误日志数量

    private constructor() {
        this.setupGlobalErrorHandlers();
    }

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * 设置全局错误处理器
     */
    private setupGlobalErrorHandlers(): void {
        // 捕获未处理的Promise拒绝
        process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
            this.logError(new Error(`Unhandled Promise Rejection: ${reason}`), {
                source: 'unhandledRejection',
                promise: promise.toString()
            });
        });

        // 捕获未捕获的异常
        process.on('uncaughtException', (error: Error) => {
            this.logError(error, { source: 'uncaughtException' });
        });


    }

    /**
     * 记录错误
     */
    private logError(error: Error, context: any = {}): void {
        const errorLog: ErrorLog = {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            ...context
        };

        this.errorLogs.push(errorLog);

        // 保持日志数量在限制内
        if (this.errorLogs.length > this.maxLogs) {
            this.errorLogs = this.errorLogs.slice(-this.maxLogs);
        }

        // 控制台输出错误（生产环境简化输出）
        if (process.env.NODE_ENV === 'production') {
            // 生产环境只输出关键错误信息
            console.error(`[${errorLog.timestamp}] ERROR: ${errorLog.error}`);
            if (context.url) {
                console.error(`URL: ${context.url}`);
            }
        } else {
            // 开发环境输出详细错误信息
            console.error('=== 错误处理器 ===');
            console.error('时间:', errorLog.timestamp);
            console.error('错误:', errorLog.error);
            if (errorLog.stack) {
                console.error('堆栈:', errorLog.stack);
            }
            if (context.url) {
                console.error('URL:', context.url);
            }
            console.error('上下文:', context);
            console.error('==================');
        }
    }

    /**
     * Express错误处理中间件
     */
    public expressErrorHandler = (error: Error, req: Request, res: Response, next: NextFunction): void => {
        this.logError(error, {
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: req.body,
            query: req.query,
            params: req.params
        });

        // 如果响应已经发送，交给Express默认错误处理器
        if (res.headersSent) {
            return next(error);
        }

        // 根据错误类型返回不同的状态码，但保留具体的错误信息
        let statusCode = 500;
        let message = error.message || '服务器内部错误';

        if (error.name === 'ValidationError') {
            statusCode = 400;
            // 使用具体的错误信息，而不是通用消息
            message = error.message || '请求参数错误';
        } else if (error.name === 'UnauthorizedError') {
            statusCode = 401;
            // 使用具体的错误信息，而不是通用消息
            message = error.message || '未授权访问';
        } else if (error.name === 'NotFoundError') {
            statusCode = 404;
            // 使用具体的错误信息，而不是通用消息
            message = error.message || '资源不存在';
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });
    };

    /**
     * 异步函数包装器，确保异步错误被捕获
     */
    public asyncHandler = (fn: Function) => {
        return (req: Request, res: Response, next: NextFunction) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    };

    /**
     * Socket.IO错误处理
     */
    public socketErrorHandler = (io: SocketIOServer): void => {
        io.on('connection', (socket) => {
            socket.on('error', (error: Error) => {
                this.logError(error, {
                    source: 'socket.io',
                    socketId: socket.id,
                    userId: (socket as any).userId || 'unknown'
                });
            });

            // 包装socket事件处理器
            const originalOn = socket.on.bind(socket);
            socket.on = (event: string, handler: Function) => {
                const wrappedHandler = (...args: any[]) => {
                    try {
                        const result = handler(...args);
                        if (result instanceof Promise) {
                            result.catch((error: Error) => {
                                this.logError(error, {
                                    source: 'socket.io-promise',
                                    event,
                                    socketId: socket.id
                                });
                            });
                        }
                        return result;
                    } catch (error) {
                        this.logError(error as Error, {
                            source: 'socket.io-sync',
                            event,
                            socketId: socket.id
                        });
                    }
                };
                return originalOn(event, wrappedHandler);
            };
        });
    };

    /**
     * 获取错误日志
     */
    public getErrorLogs(): ErrorLog[] {
        return [...this.errorLogs];
    }

    /**
     * 清除错误日志
     */
    public clearErrorLogs(): void {
        this.errorLogs = [];
    }

    /**
     * 检查服务器健康状态
     */
    public getHealthStatus(): { status: string; errorCount: number; lastError?: ErrorLog } {
        const recentErrors = this.errorLogs.filter(
            log => new Date(log.timestamp).getTime() > Date.now() - 60000 // 最近1分钟
        );

        return {
            status: recentErrors.length > 10 ? 'unhealthy' : 'healthy',
            errorCount: this.errorLogs.length,
            lastError: this.errorLogs[this.errorLogs.length - 1]
        };
    }
}

// 导出单例实例
export const errorHandler = ErrorHandler.getInstance();