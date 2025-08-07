/**
 * 统一日志管理系统
 * 自动根据环境切换日志级别，生产环境下减少不必要的输出
 */

class Logger {
    constructor() {
        // 判断是否为开发环境
        this.isDevelopment = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname.includes('dev') ||
                           window.location.search.includes('debug=true');
        
        // 设置日志级别
        this.logLevel = this.isDevelopment ? 'debug' : 'error';
        
        // 日志级别权重
        this.levels = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };
        
        console.log(`🔧 Logger initialized - Environment: ${this.isDevelopment ? 'Development' : 'Production'}, Level: ${this.logLevel}`);
    }

    /**
     * 检查是否应该输出日志
     */
    shouldLog(level) {
        return this.levels[level] >= this.levels[this.logLevel];
    }

    /**
     * 格式化日志输出
     */
    formatMessage(level, component, ...args) {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        
        if (component) {
            return [`${prefix} [${component}]`, ...args];
        }
        return [prefix, ...args];
    }

    /**
     * 调试级别日志
     */
    debug(component, ...args) {
        if (this.shouldLog('debug')) {
            console.log(...this.formatMessage('debug', component, ...args));
        }
    }

    /**
     * 信息级别日志
     */
    info(component, ...args) {
        if (this.shouldLog('info')) {
            console.info(...this.formatMessage('info', component, ...args));
        }
    }

    /**
     * 警告级别日志
     */
    warn(component, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(...this.formatMessage('warn', component, ...args));
        }
    }

    /**
     * 错误级别日志（始终输出）
     */
    error(component, ...args) {
        console.error(...this.formatMessage('error', component, ...args));
        
        // 生产环境下可以发送到错误监控服务
        if (!this.isDevelopment) {
            this.sendToErrorService(component, args);
        }
    }

    /**
     * 发送错误到监控服务
     */
    sendToErrorService(component, errorData) {
        // 这里可以集成第三方错误监控服务（如Sentry）
        try {
            // 示例：发送到服务器的错误收集API
            if (window.fetch) {
                fetch('/api/log-error', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        component,
                        error: errorData,
                        userAgent: navigator.userAgent,
                        timestamp: new Date().toISOString(),
                        url: window.location.href
                    }),
                    credentials: 'same-origin'
                }).catch(() => {
                    // 静默处理错误上报失败
                });
            }
        } catch (e) {
            // 静默处理，避免日志系统本身出错
        }
    }

    /**
     * 性能日志
     */
    perf(component, operation, duration) {
        if (this.isDevelopment) {
            console.log(`⏱️ [PERF] [${component}] ${operation}: ${duration}ms`);
        }
    }

    /**
     * 网络请求日志
     */
    network(component, method, url, status, duration) {
        if (this.isDevelopment) {
            const statusColor = status >= 200 && status < 300 ? '✅' : '❌';
            console.log(`🌐 [NETWORK] [${component}] ${statusColor} ${method} ${url} - ${status} (${duration}ms)`);
        }
    }

    /**
     * WebRTC相关日志
     */
    webrtc(component, event, details) {
        if (this.shouldLog('info')) {
            console.log(`📡 [WebRTC] [${component}] ${event}:`, details);
        }
    }

    /**
     * Socket.IO相关日志
     */
    socket(component, event, details) {
        if (this.shouldLog('info')) {
            console.log(`🔌 [Socket] [${component}] ${event}:`, details);
        }
    }

    /**
     * 录制相关日志
     */
    record(component, event, details) {
        if (this.shouldLog('info')) {
            console.log(`🎥 [Record] [${component}] ${event}:`, details);
        }
    }
}

// 创建全局日志实例
const logger = new Logger();

// 挂载到全局对象供其他脚本使用
window.logger = logger;

// 兼容旧代码的简化接口
window.log = {
    debug: (...args) => logger.debug('Legacy', ...args),
    info: (...args) => logger.info('Legacy', ...args),
    warn: (...args) => logger.warn('Legacy', ...args),
    error: (...args) => logger.error('Legacy', ...args)
};

// 拦截全局console（可选，谨慎使用）
if (!logger.isDevelopment) {
    const originalConsole = { ...console };

    console.log = (...args) => logger.debug('Console', ...args);
    console.info = (...args) => logger.info('Console', ...args);
    console.warn = (...args) => logger.warn('Console', ...args);
    // 注释掉console.error的拦截以避免无限递归
    // console.error = (...args) => logger.error('Console', ...args);

    // 保留原始console用于紧急调试
    window.originalConsole = originalConsole;
}