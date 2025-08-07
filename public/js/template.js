/**
 * 模板系统 - 替代art-template
 * 提供统一的页面结构和功能
 */

class TemplateSystem {
    constructor() {
        this.sessionUser = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        // 使用原生console在logger加载前
        console.log('🔧 TemplateSystem: 开始初始化...');

        this.loadBaseStyles();
        await this.loadBaseScripts();
        this.configureAxios();
        await this.checkAuth();
        this.setupNavigation();
        this.setupFooter();
        this.updateYear();

        this.isInitialized = true;

        // 监听窗口大小变化，重新计算高度
        this.setupResizeListener();

        // 使用logger系统（如果已加载）
        if (window.logger) {
            window.logger.info('TemplateSystem', '初始化完成');
        } else {
            console.log('✅ TemplateSystem: 初始化完成');
        }
    }

    /**
     * 加载基础样式
     */
    loadBaseStyles() {
        const stylesheets = [
            '/node_modules/bootstrap/dist/css/bootstrap.min.css',
            '/public/css/style.css'  // 使用本地样式文件替代startbootstrap-new-age
        ];

        stylesheets.forEach(href => {
            if (!document.querySelector(`link[href="${href}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.type = 'text/css';
                link.href = href;
                document.head.appendChild(link);
            }
        });

        // 添加favicon
        if (!document.querySelector('link[rel="icon"]')) {
            const favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.type = 'image/x-icon';
            favicon.href = '/assets/favicon.ico';
            document.head.appendChild(favicon);
        }
    }

    /**
     * 加载基础脚本
     */
    async loadBaseScripts() {
        const scripts = [
            '/public/js/logger.js',                              // 首先加载日志系统
            '/public/js/errorHandler.js',                        // 然后加载错误处理系统
            '/node_modules/axios/dist/axios.min.js',
            '/node_modules/socket.io/client-dist/socket.io.min.js',
            '/node_modules/bootstrap/dist/js/bootstrap.bundle.js'
            // 移除startbootstrap-new-age的JS文件引用
        ];

        // 按顺序加载脚本，确保logger和axios先加载
        for (const src of scripts) {
            if (!document.querySelector(`script[src="${src}"]`)) {
                await this.loadScript(src);
            }
        }
    }

    /**
     * 加载单个脚本文件
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * 配置axios
     */
    configureAxios() {
        if (typeof axios !== 'undefined') {
            // 确保axios发送cookie
            axios.defaults.withCredentials = true;
            
            if (window.logger) {
                window.logger.debug('TemplateSystem', 'Axios配置完成：启用cookie发送');
            }
        }
    }

    /**
     * 检查用户认证状态
     */
    async checkAuth() {
        try {
            // 等待axios加载完成
            if (typeof axios === 'undefined') {
                console.log('等待axios加载...');
                return;
            }

            const response = await axios.get('/api/information');

            // 调试：打印完整的响应数据
            console.log('🔍 API响应数据:', response.data);

            // 检查API的数据结构 - 兼容新旧两种格式
            if (response.data.success && response.data.data && response.data.data.sessionUser) {
                // 新的API格式
                this.sessionUser = response.data.data.sessionUser;
                console.log('✅ 使用新API格式获取用户信息:', this.sessionUser);
            } else if (response.data.sessionUser) {
                // 旧的API格式
                this.sessionUser = response.data.sessionUser;
                console.log('✅ 使用旧API格式获取用户信息:', this.sessionUser);
            } else {
                this.sessionUser = null;
                console.log('❌ 未找到用户信息');
            }
        } catch (error) {
            console.log('用户未登录或session已过期:', error);
            this.sessionUser = null;
        }
    }

    /**
     * 设置导航栏
     */
    setupNavigation() {
        // 如果已经有导航栏，不重复创建
        if (document.getElementById('mainNav')) {
            this.updateNavigation();
            return;
        }

        const nav = document.createElement('nav');
        nav.className = 'navbar navbar-expand-lg navbar-light fixed-top shadow-sm';
        nav.id = 'mainNav';
        
        nav.innerHTML = `
            <div class="container px-5">
                <a class="navbar-brand fw-bold" href="#" onclick="templateSystem.goHome()">远程录屏</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarResponsive"
                    aria-controls="navbarResponsive" aria-expanded="false" aria-label="Toggle navigation">菜单</button>
                <div class="collapse navbar-collapse" id="navbarResponsive">
                    <ul class="navbar-nav ms-auto me-4 my-3 my-lg-0">

                        <li style="display:none;" class="nav-item">
                            <a class="nav-link me-lg-3" href="/record">进入录制</a>
                        </li>
                        <li class="nav-item" id="logout-item" style="display:none;">
                            <a class="nav-link me-lg-3" href="#" onclick="templateSystem.logout()">退出登录</a>
                        </li>
                        <li class="nav-item" id="login-item">
                            <a class="nav-link me-lg-3" href="/login">登录</a>
                        </li>
                    </ul>
                    <button class="btn btn-primary rounded-pill px-3 mb-2 mb-lg-0" id="user-info" style="display:none;">
                        <span class="d-flex align-items-center">
                            <span class="small" id="user-text"></span>
                        </span>
                    </button>
                </div>
            </div>
        `;

        document.body.insertBefore(nav, document.body.firstChild);
        this.updateNavigation();

        // 添加CSS类并设置导航栏高度变量
        document.body.classList.add('has-fixed-navbar');
        this.updateNavbarHeight();
    }

    /**
     * 更新导航栏状态
     */
    updateNavigation() {
        const userInfo = document.getElementById('user-info');
        const userText = document.getElementById('user-text');
        const logoutItem = document.getElementById('logout-item');
        const loginItem = document.getElementById('login-item');

        if (this.sessionUser) {
            userText.textContent = `${this.sessionUser.stu_no} ${this.sessionUser.stu_name}`;
            userInfo.style.display = 'block';
            logoutItem.style.display = 'block';
            loginItem.style.display = 'none';
        } else {
            userInfo.style.display = 'none';
            logoutItem.style.display = 'none';
            loginItem.style.display = 'block';
        }
    }

    /**
     * 设置页脚
     */
    setupFooter() {
        // 如果已经有页脚，不重复创建
        if (document.getElementById('footer')) {
            return;
        }

        const footer = document.createElement('footer');
        footer.id = 'footer';
        footer.className = 'bg-gradient-primary-to-secondary text-center fixed-bottom p-1';
        
        footer.innerHTML = `
            <div class="container p-1">
                <div class="text-white-50">
                    <div>&copy; Remote record <span id="now-year"></span>. All Rights Reserved. Made by Cxx Zzk. Version 3.8.2</div>
                </div>
            </div>
        `;

        document.body.appendChild(footer);

        // 添加CSS类并设置页脚高度变量
        document.body.classList.add('has-fixed-footer');
        this.updateFooterHeight();
    }

    /**
     * 更新年份
     */
    updateYear() {
        const yearElement = document.getElementById('now-year');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    /**
     * 更新导航栏高度CSS变量
     */
    updateNavbarHeight() {
        // 等待DOM渲染完成后计算高度
        setTimeout(() => {
            const navbar = document.getElementById('mainNav');
            if (navbar) {
                const height = navbar.offsetHeight;
                document.documentElement.style.setProperty('--navbar-height', `${height}px`);

                if (window.logger) {
                    window.logger.debug('TemplateSystem', `导航栏高度设置为: ${height}px`);
                }
            }
        }, 100);
    }

    /**
     * 更新页脚高度CSS变量
     */
    updateFooterHeight() {
        // 等待DOM渲染完成后计算高度
        setTimeout(() => {
            const footer = document.getElementById('footer');
            if (footer) {
                const height = footer.offsetHeight;
                document.documentElement.style.setProperty('--footer-height', `${height}px`);

                if (window.logger) {
                    window.logger.debug('TemplateSystem', `页脚高度设置为: ${height}px`);
                }
            }
        }, 100);
    }

    /**
     * 设置窗口大小变化监听器
     */
    setupResizeListener() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            // 防抖处理，避免频繁计算
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateNavbarHeight();
                this.updateFooterHeight();
            }, 250);
        });
    }

    /**
     * 根据用户权限跳转到主页
     */
    goHome() {
        if (this.sessionUser) {
            const userLevel = parseInt(this.sessionUser.stu_userlevel || '0');
            if (userLevel >= 1) {
                // 管理员跳转到监控页面
                window.location.href = '/monitor';
            } else {
                // 普通用户跳转到录制页面
                window.location.href = '/record';
            }
        } else {
            // 未登录用户跳转到登录页
            window.location.href = '/login';
        }
    }

    /**
     * 登出功能
     */
    async logout() {
        try {
            const response = await axios.post('/api/logout');
            if (response.data.success) {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('登出失败:', error);
            alert('登出失败，请重试');
        }
    }

    /**
     * 显示加载状态
     */
    showLoading(message = '加载中...') {
        const loading = document.createElement('div');
        loading.id = 'loading-overlay';
        loading.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center';
        loading.style.backgroundColor = 'rgba(0,0,0,0.5)';
        loading.style.zIndex = '9999';
        loading.innerHTML = `
            <div class="bg-white p-4 rounded">
                <div class="spinner-border me-3" role="status"></div>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(loading);
    }

    /**
     * 隐藏加载状态
     */
    hideLoading() {
        const loading = document.getElementById('loading-overlay');
        if (loading) {
            loading.remove();
        }
    }

    /**
     * 显示错误消息（增强版）
     */
    showError(message, duration = 5000, options = {}) {
        // 移除之前的错误提示
        this.hideAlert('error');
        
        const alert = document.createElement('div');
        alert.id = 'error-alert';
        alert.className = 'alert alert-danger position-fixed top-0 start-50 translate-middle-x mt-5 shadow';
        alert.style.zIndex = '10000';
        alert.style.maxWidth = '600px';
        alert.style.minWidth = '300px';
        
        // 支持HTML内容
        if (options.allowHtml) {
            alert.innerHTML = message;
        } else {
            alert.textContent = message;
        }
        
        // 添加关闭按钮
        if (options.closable !== false) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'btn-close ms-2';
            closeBtn.onclick = () => alert.remove();
            alert.appendChild(closeBtn);
        }
        
        // 添加重试按钮（如果提供）
        if (options.retryAction) {
            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'btn btn-outline-light btn-sm ms-2';
            retryBtn.textContent = '重试';
            retryBtn.onclick = () => {
                alert.remove();
                options.retryAction();
            };
            alert.appendChild(retryBtn);
        }
        
        document.body.appendChild(alert);
        
        // 自动消失
        if (duration > 0) {
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.remove();
                }
            }, duration);
        }
        
        return alert;
    }

    /**
     * 隐藏指定类型的提示
     */
    hideAlert(type) {
        const alert = document.getElementById(`${type}-alert`);
        if (alert) {
            alert.remove();
        }
    }

    /**
     * 显示成功消息
     */
    showSuccess(message, duration = 3000) {
        this.hideAlert('success');
        
        const alert = document.createElement('div');
        alert.id = 'success-alert';
        alert.className = 'alert alert-success position-fixed top-0 start-50 translate-middle-x mt-5 shadow';
        alert.style.zIndex = '10000';
        alert.style.maxWidth = '600px';
        alert.style.minWidth = '300px';
        alert.textContent = message;
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, duration);
    }

    /**
     * 显示警告消息
     */
    showWarning(message, duration = 4000, options = {}) {
        this.hideAlert('warning');
        
        const alert = document.createElement('div');
        alert.id = 'warning-alert';
        alert.className = 'alert alert-warning position-fixed top-0 start-50 translate-middle-x mt-5 shadow';
        alert.style.zIndex = '10000';
        alert.style.maxWidth = '600px';
        alert.style.minWidth = '300px';
        alert.textContent = message;
        
        // 添加关闭按钮
        if (options.closable !== false) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'btn-close ms-2';
            closeBtn.onclick = () => alert.remove();
            alert.appendChild(closeBtn);
        }
        
        document.body.appendChild(alert);
        
        if (duration > 0) {
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.remove();
                }
            }, duration);
        }
        
        return alert;
    }

    /**
     * 显示信息消息
     */
    showInfo(message, duration = 3000) {
        this.hideAlert('info');
        
        const alert = document.createElement('div');
        alert.id = 'info-alert';
        alert.className = 'alert alert-info position-fixed top-0 start-50 translate-middle-x mt-5 shadow';
        alert.style.zIndex = '10000';
        alert.style.maxWidth = '600px';
        alert.style.minWidth = '300px';
        alert.textContent = message;
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, duration);
    }

    /**
     * 设置页面标题
     */
    setTitle(title) {
        document.title = title;
    }

    /**
     * 添加自定义样式到head
     */
    addStyles(styles) {
        const style = document.createElement('style');
        style.textContent = styles;
        document.head.appendChild(style);
    }
}

// 全局实例
let templateSystem;

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔧 Template.js: DOM加载完成，开始初始化模板系统...');

    templateSystem = new TemplateSystem();

    // 立即设置到window对象
    window.templateSystem = templateSystem;

    console.log('✅ Template.js: 模板系统已设置到window对象');

    // 确保body有正确的ID
    if (!document.body.id) {
        document.body.id = 'page-top';
    }

    console.log('✅ Template.js: 模板系统初始化完成');
});