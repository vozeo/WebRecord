/**
 * 简化的错误处理系统 - 专注于考试监控系统的稳定性
 * 只提供用户友好的错误提示，不做复杂的网络监控和自动恢复
 */

class SimpleErrorHandler {
    constructor() {
        this.init();
    }

    init() {
        if (window.logger) {
            window.logger.debug('ErrorHandler', '错误处理系统初始化完成');
        }

        // 监听全局未捕获的错误
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error, event.filename, event.lineno);
        });

        // 监听Promise未捕获的拒绝
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError(event.reason, 'Promise', 0);
        });
    }

    /**
     * 处理录制相关错误
     */
    handleRecordingError(type, error, context = {}) {
        if (window.logger) {
            window.logger.error('ErrorHandler', `录制错误 [${type}]:`, error);
        }

        let userMessage;

        // 根据浏览器错误类型给出用户友好提示
        switch (error.name) {
            case 'NotAllowedError':
                userMessage = this.getRecordingPermissionMessage(type);
                break;

            case 'NotFoundError':
                userMessage = `未找到可用的${type === 'screen' ? '屏幕' : '摄像头'}设备，请检查设备连接`;
                break;

            case 'NotReadableError':
            case 'TrackStartError':
                userMessage = `${type === 'screen' ? '屏幕' : '摄像头'}设备正在被其他应用使用，请关闭其他应用后重试`;
                break;

            case 'OverconstrainedError':
                userMessage = `设备不支持当前录制配置，请尝试刷新页面`;
                break;

            default:
                userMessage = `录制发生错误: ${error.message}`;
        }

        this.showError(userMessage);
        this.logErrorEvent('recording_error', { type, error: error.message, context });

        return userMessage;
    }

    /**
     * 处理Socket连接错误
     */
    handleSocketError(error, context = {}) {
        if (window.logger) {
            window.logger.error('ErrorHandler', 'Socket连接错误:', error);
        }

        let userMessage = '网络连接异常，系统会自动无限重连，录制会持续进行';

        // 根据错误类型给出不同提示
        if (error.message && error.message.includes('timeout')) {
            userMessage = '网络连接超时，系统会持续重试连接，录制不会中断';
        }

        // 只在开发环境显示错误，生产环境不打扰用户
        if (window.logger && window.logger.isDevelopment) {
            this.showError(userMessage);
        }

        this.logErrorEvent('socket_error', { error: error.message, context });

        return userMessage;
    }

    /**
     * 处理WebRTC连接错误
     */
    handleWebRTCError(error, context = {}) {
        if (window.logger) {
            window.logger.error('ErrorHandler', 'WebRTC连接错误:', error);
        }

        let userMessage = '视频连接失败，Socket重连后会自动恢复';

        if (error.message && error.message.includes('peer')) {
            userMessage = '目标用户不在线或未开启录制，网络恢复后会自动重试';
        }

        // 只在开发环境或者是严重错误时显示给用户
        if (window.logger && window.logger.isDevelopment) {
            this.showError(userMessage);
        }

        this.logErrorEvent('webrtc_error', { error: error.message, context });

        return userMessage;
    }

    /**
     * 处理文件上传错误
     */
    handleFileUploadError(error, fileInfo = {}) {
        if (window.logger) {
            window.logger.error('ErrorHandler', '文件上传错误:', error);
        }

        let userMessage = '文件上传失败，系统会自动重试';

        if (error.message && error.message.includes('quota')) {
            userMessage = '存储空间不足，请联系管理员';
        } else if (error.message && error.message.includes('size')) {
            userMessage = '录制文件过大，请联系管理员';
        }

        this.showError(userMessage);
        this.logErrorEvent('file_upload_error', { error: error.message, fileInfo });

        return userMessage;
    }

    /**
     * 显示用户友好的错误提示
     */
    showError(message) {
        // 优先使用模板系统的错误提示
        if (window.templateSystem && window.templateSystem.showError) {
            window.templateSystem.showError(message);
        } else if (window.Notification && window.Notification.permission === 'granted') {
            // 使用浏览器通知
            new Notification('系统提示', {
                body: message,
                icon: '/assets/favicon.ico'
            });
        } else {
            // 最后降级到alert
            console.warn('无法显示错误提示，降级到控制台:', message);
        }
    }

    /**
     * 处理全局错误
     */
    handleGlobalError(error, filename, lineno) {
        if (window.logger) {
            window.logger.error('ErrorHandler', '全局错误:', {
                error: error.message || error,
                filename,
                lineno,
                stack: error.stack
            });
        }

        // 记录错误但不显示给用户（避免技术细节困扰用户）
        this.logErrorEvent('global_error', {
            error: error.message || error,
            filename,
            lineno
        });
    }

    /**
     * 记录错误事件（用于分析和监控）
     */
    logErrorEvent(errorType, errorInfo) {
        // 发送错误统计到服务器（简化版）
        try {
            if (window.fetch) {
                fetch('/api/log-error', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        errorType,
                        errorInfo,
                        userAgent: navigator.userAgent,
                        timestamp: Date.now(),
                        url: window.location.href,
                        userId: window.SessionUser?.stu_no
                    }),
                    credentials: 'same-origin'
                }).catch(() => {
                    // 静默处理错误上报失败
                });
            }
        } catch (e) {
            // 静默处理，避免错误处理系统本身出错
        }
    }

    /**
     * 获取录制权限错误的友好提示
     */
    getRecordingPermissionMessage(type) {
        if (type === 'screen') {
            return '需要屏幕录制权限。请点击浏览器地址栏的权限图标，允许屏幕共享，然后刷新页面重试。';
        } else {
            return '需要摄像头权限。请点击浏览器地址栏的摄像头图标，允许摄像头访问，然后刷新页面重试。';
        }
    }
}

// 创建全局错误处理实例
const errorHandler = new SimpleErrorHandler();

// 挂载到全局对象
window.errorHandler = errorHandler;

// 提供简化的API
window.handleError = {
    recording: (type, error, context) => errorHandler.handleRecordingError(type, error, context),
    socket: (error, context) => errorHandler.handleSocketError(error, context),
    webrtc: (error, context) => errorHandler.handleWebRTCError(error, context),
    fileUpload: (error, fileInfo) => errorHandler.handleFileUploadError(error, fileInfo),
    show: (message) => errorHandler.showError(message)
};