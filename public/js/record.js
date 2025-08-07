// 检查浏览器支持
if (!navigator.getDisplayMedia && !navigator.mediaDevices.getDisplayMedia) {
    const error = '您的浏览器不支持录屏，请更换浏览器重试！';
    document.getElementById('screen-record-btn').style.display = 'none';
    document.getElementById('camera-record-btn').style.display = 'none';
    throw new Error(error);
}

/**
 * 录制状态枚举
 */
const RecordState = {
    IDLE: 'idle',
    REQUESTING_PERMISSION: 'requesting',
    RECORDING: 'recording',
    ERROR: 'error'
};

/**
 * 录制事件枚举
 */
const RecordEvent = {
    START_REQUESTED: 'start_requested',
    PERMISSION_GRANTED: 'permission_granted',
    PERMISSION_DENIED: 'permission_denied',
    STOP_REQUESTED: 'stop_requested',
    ERROR_OCCURRED: 'error_occurred'
};

/**
 * 录制管理器类
 */
class RecordManager {
    constructor(type, config) {
        this.type = type; // 'screen' or 'camera'
        this.config = config;
        this.state = RecordState.IDLE;
        this.deviceId = '';
        this.deviceLabel = '';
        this.stream = null;
        this.recorder = null;
        this.uploadQueue = [];
        this.isUploading = false;
        this.fileCount = 0;
        this.totalSize = 0;
        this.startTime = null;
        this.sessionStartTime = null; // 本次录制会话开始时间，用于文件命名，只在重连时更新

        console.log(`🔧 RecordManager创建: ${type}`);

        // 简化：移除复杂的网络监听器

        // 状态转换表
        this.stateTransitions = {
            [RecordState.IDLE]: {
                [RecordEvent.START_REQUESTED]: RecordState.REQUESTING_PERMISSION
            },
            [RecordState.REQUESTING_PERMISSION]: {
                [RecordEvent.PERMISSION_GRANTED]: RecordState.RECORDING,
                [RecordEvent.PERMISSION_DENIED]: RecordState.IDLE
            },
            [RecordState.RECORDING]: {
                [RecordEvent.STOP_REQUESTED]: RecordState.IDLE,
                [RecordEvent.ERROR_OCCURRED]: RecordState.ERROR
            },
            [RecordState.ERROR]: {
                [RecordEvent.START_REQUESTED]: RecordState.REQUESTING_PERMISSION,
                [RecordEvent.STOP_REQUESTED]: RecordState.IDLE
            }
        };
    }

    /**
     * 状态转换
     */
    transition(event, data = null) {
        const currentState = this.state;
        const transitions = this.stateTransitions[currentState];

        if (!transitions || !transitions[event]) {
            console.warn(`Invalid transition: ${currentState} -> ${event}`);
            return false;
        }

        const newState = transitions[event];
        console.log(`🔄 ${this.type} state: ${currentState} -> ${newState} (${event})`);

        // 执行状态退出处理
        console.log(`🚪 ${this.type} 退出状态: ${currentState}`);
        this.onStateExit(currentState);

        // 更新状态
        this.state = newState;

        // 执行状态进入处理
        console.log(`🚪 ${this.type} 进入状态: ${newState}`);
        this.onStateEnter(newState, data);

        return true;
    }

    /**
     * 状态进入处理
     */
    onStateEnter(state, data) {
        switch (state) {
            case RecordState.IDLE:
                this.onRecordingIdle();
                break;
            case RecordState.REQUESTING_PERMISSION:
                this.requestPermission();
                break;
            case RecordState.RECORDING:
                this.onRecordingStarted(data);
                break;
            case RecordState.ERROR:
                this.handleError(data);
                break;
        }
    }

    /**
     * 状态退出处理
     */
    onStateExit(state) {
        switch (state) {
            case RecordState.RECORDING:
                this.stopRecording();
                break;
        }
    }

    /**
     * 请求媒体权限并开始录制
     */
    async requestPermission() {
        try {
            console.log(`🎥 请求${this.type}录制权限...`);
            
            const constraints = {
                audio: true,
                video: {
                    width: { ideal: this.config.width },
                    height: { ideal: this.config.height },
                    frameRate: { ideal: this.config.frameRate }
                }
            };

            let stream;
            if (this.type === 'screen') {
                if (navigator.mediaDevices.getDisplayMedia) {
                    stream = await navigator.mediaDevices.getDisplayMedia(constraints);
                } else {
                    stream = await navigator.getDisplayMedia(constraints);
                }

                // 检查是否选择了整个屏幕
                const tracks = stream.getTracks();
                const hasShared = tracks.some(track => track.label.startsWith('screen'));
                if (!hasShared) {
                    stream.getTracks().forEach(track => track.stop());
                    throw new Error('未选择分享"整个屏幕"，请在录屏时选择分享"整个屏幕"并勾选"分享系统中的音频"！');
                }
            } else {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            }

            this.stream = stream;
            this.deviceId = this.generateDeviceId(stream);
            this.deviceLabel = this.generateDeviceLabel(stream);
            this.addStreamStopListener(stream);

            console.log(`✅ ${this.type}权限获取成功，设备ID: ${this.deviceId}`);
            
            console.log(`📱 ${this.type}最终设备ID: ${this.deviceId}, 设备标签: ${this.deviceLabel}`);
            
            // MultiDeviceManager 会异步添加设备，这里不需要处理
            
            this.transition(RecordEvent.PERMISSION_GRANTED, stream);

        } catch (error) {
            console.error(`❌ ${this.type}权限请求失败:`, error);
            this.transition(RecordEvent.PERMISSION_DENIED, error);
        }
    }

    /**
     * 开始录制
     */
    startRecording(stream) {
        try {
            // 验证流的有效性
            if (!stream || !stream.active) {
                throw new Error('媒体流无效或已停止');
            }

            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length === 0) {
                throw new Error('未找到视频轨道');
            }

            // 检查浏览器支持的MIME类型
            const mimeType = this.getSupportedMimeType();

            this.recorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: this.config.videoBitsPerSecond || 2500000,
                audioBitsPerSecond: this.config.audioBitsPerSecond || 128000
            });

            // 设置事件处理器
            this.setupRecorderEventHandlers();

            this.recorder.start(this.config.sliceTime);
            this.startTime = Date.now();
            
            // 首次开始录制时设置会话时间戳，用于文件命名
            if (!this.sessionStartTime) {
                this.sessionStartTime = this.startTime;
                console.log(`📅 设置录制会话时间戳: ${new Date(this.sessionStartTime).toISOString()}`);
            }

            console.log(`🎬 ${this.type}录制开始，MIME类型: ${mimeType}`);



        } catch (error) {
            console.error(`❌ ${this.type}录制启动失败:`, error);
            this.transition(RecordEvent.ERROR_OCCURRED, error);
        }
    }

    /**
     * 生成设备ID - 直接使用分配的简单ID
     */
    generateDeviceId(stream) {
        console.log(`🔧 ${this.type}开始生成设备ID`);
        
        // 从设备标签中提取编号
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.label) {
            const label = videoTrack.label;
            console.log(`🏷️ ${this.type}设备标签: "${label}"`);
            
            // 解析 screen:2:0 格式，提取屏幕编号
            if (this.type === 'screen' && label.includes('screen:')) {
                const match = label.match(/screen:(\d+):/);
                if (match) {
                    const deviceId = `screen${match[1]}`;
                    console.log(`✅ ${this.type}从标签提取设备ID: ${label} -> ${deviceId}`);
                    return deviceId;  // screen:2:0 -> screen2
                }
            }
            
            // 解析摄像头编号
            if (this.type === 'camera') {
                const match = label.match(/(\d+)/);
                if (match) {
                    const deviceId = `camera${match[1]}`;
                    console.log(`✅ ${this.type}从标签提取设备ID: ${label} -> ${deviceId}`);
                    return deviceId;
                }
            }
        }

        // 默认使用简单编号
        const deviceId = `${this.type}1`;
        console.log(`⚠️ ${this.type}使用默认设备ID: ${deviceId}`);
        return deviceId;
    }

    /**
     * 生成设备标签
     */
    generateDeviceLabel(stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.label) {
            return videoTrack.label;
        }
        return `${this.type === 'screen' ? '屏幕' : '摄像头'} ${Date.now()}`;
    }

    /**
     * 获取支持的MIME类型
     */
    getSupportedMimeType() {
        const mimeTypes = [
            this.config.mimeType,
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];

        for (const mimeType of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                return mimeType;
            }
        }

        throw new Error('浏览器不支持任何可用的视频编码格式');
    }

    /**
     * 字符串编辑工具
     */
    editStr(str) {
        return str.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    }

    /**
     * 设置录制器事件处理器
     */
    setupRecorderEventHandlers() {
        this.recorder.ondataavailable = (event) => {
            try {
                this.handleDataAvailable(event);
            } catch (error) {
                console.error(`❌ ${this.type}数据处理错误:`, error);
                this.transition(RecordEvent.ERROR_OCCURRED, error);
            }
        };

        this.recorder.onstart = () => {
            console.log(`📹 ${this.type}录制器启动成功`);
        };

        this.recorder.onstop = () => {
            console.log(`⏹️ ${this.type}录制器已停止`);
        };

        this.recorder.onerror = (event) => {
            console.error(`❌ ${this.type}录制器错误:`, event);
            const error = new Error(`录制器错误: ${event.error?.message || '未知错误'}`);
            this.transition(RecordEvent.ERROR_OCCURRED, error);
        };


    }

    /**
     * 录制停止后的处理（返回IDLE状态）
     */
    onRecordingIdle() {
        console.log(`🔄 ${this.type}录制已停止，更新UI状态...`);
        
        // 通知多设备管理器移除这个设备并更新UI
        if (window.multiDeviceManager) {
            const deviceMap = window.multiDeviceManager.devices[this.type];
            if (deviceMap) {
                // 查找并移除当前manager对应的设备
                let foundDeviceId = null;
                for (const [deviceId, manager] of deviceMap.entries()) {
                    if (manager === this) {
                        foundDeviceId = deviceId;
                        break;
                    }
                }
                
                if (foundDeviceId) {
                    deviceMap.delete(foundDeviceId);
                    console.log(`🗑️ 从设备列表移除 ${this.type}:${foundDeviceId}`);
                } else {
                    console.warn(`⚠️ 未找到对应的设备ID，直接清空${this.type}设备列表`);
                    deviceMap.clear(); // 强制清空，确保UI正确
                }
            }
        }
            
        // 强制更新UI，确保按钮状态正确
        console.log(`🔄 强制更新${this.type}录制UI...`);
        if (window.multiDeviceManager) {
            window.multiDeviceManager.updateUI();
        }
    }

    /**
     * 录制开始后的处理
     */
    onRecordingStarted(stream) {
        console.log(`🎬 ${this.type}录制状态转换完成，开始启动录制器...`);

        // 启动实际的录制器
        if (stream) {
            this.startRecording(stream);
        } else if (this.stream) {
            this.startRecording(this.stream);
        } else {
            console.error(`❌ ${this.type}录制启动失败：没有可用的媒体流`);
            this.transition(RecordEvent.ERROR_OCCURRED, new Error('没有可用的媒体流'));
            return;
        }

        // 通知服务器开始录制
        if (window.Socket && window.Socket.connected) {
            const deviceIdToSend = this.deviceId;
            
            window.Socket.emit('record:start', {
                type: this.type,
                device: {
                    id: deviceIdToSend,
                    label: this.deviceLabel
                },
                settings: {
                    timestamp: Date.now(),
                    allTime: window.AllTime
                }
            }, (response) => {
                if (response && response.success) {
                    console.log(`✅ ${this.type}录制启动已通知服务器`);
                    // 服务器确认后再建立WebRTC连接，确保服务器端状态已更新
                    setTimeout(() => {
                        this.establishWebRTCConnection();
                    }, 500); // 延迟500ms建立WebRTC连接
                } else {
                    console.error(`❌ ${this.type}录制启动通知失败:`, response);
                    // 即使服务器通知失败，也要建立WebRTC连接
                    this.establishWebRTCConnection();
                }
            });
        } else {
            // 如果Socket未连接，直接建立WebRTC连接
            this.establishWebRTCConnection();
        }

        // 发送通知
        if (window.Notification && window.Notification.permission === "granted") {
            const title = this.type === 'screen' ? '屏幕录制开始' : '摄像头录制开始';
            const body = this.type === 'screen' ?
                '屏幕录制已开始，请确保选择了"整个屏幕"并勾选了"分享系统中的音频"' :
                '摄像头录制已开始，请确保摄像头和麦克风权限已允许';
            new Notification(title, { body });
        }

        console.log(`🎬 ${this.type}录制正式开始，设备: ${this.deviceLabel}`);
    }

    /**
     * 建立WebRTC连接用于实时监控
     */
    establishWebRTCConnection() {
        // 如果WebRTC连接已存在，先清理
        if (this.peer && !this.peer.destroyed) {
            console.log(`🔌 清理已存在的${this.type}WebRTC连接`);
            this.peer.destroy();
            this.peer = null;
        }
        try {
            if (!window.Peer) {
                console.warn(`⚠️ PeerJS未加载，跳过${this.type}的WebRTC连接建立`);
                return;
            }

            // 构建Peer ID：学号 + 类型 + 设备ID
            const deviceIdForPeer = this.deviceId;
            const peerId = `${window.SessionUser.stu_no}${this.type}${deviceIdForPeer}`;
            
            // 调试：记录PeerID和设备信息，帮助排查连接问题
            console.log(`🔗 建立${this.type}的WebRTC连接`);
            console.log(`  - Peer ID: ${peerId}`);
            console.log(`  - 学号: ${window.SessionUser.stu_no}`);
            console.log(`  - 类型: ${this.type}`);
            console.log(`  - 设备ID: ${deviceIdForPeer}`);
            console.log(`  - 设备标签: ${this.deviceLabel}`);

            // 创建Peer连接
            this.peer = new window.Peer(peerId, {
                host: window.location.hostname,
                port: window.NetworkConfig.socketPort,
                path: "/webrtc",
                secure: true,
                config: {
                    'iceServers': [
                        { urls: 'stun:stun.l.google.com:19302' },
                        {
                            urls: `turn:${window.location.hostname}:${window.NetworkConfig.turnServerPort}`,
                            username: window.NetworkConfig.turnServerUsername,
                            credential: window.NetworkConfig.turnServerCredential
                        }
                    ]
                }
            });

            // 监听连接事件
            this.peer.on('connection', (conn) => {
                console.log(`📞 ${this.type}收到监控连接请求:`);
                console.log(`  - 来源PeerID: ${conn.peer}`);
                console.log(`  - 本地PeerID: ${peerId}`);

                conn.on('open', () => {
                    console.log(`✅ ${this.type}监控连接已建立 (${conn.peer} -> ${peerId})`);
                });
                
                // 监听来自监控端的消息
                conn.on('data', (data) => {
                    console.log(`📩 ${this.type}收到监控端消息:`, data);
                    
                    if (data.type === 'monitor_request') {
                        console.log(`📹 ${this.type}收到监控请求，开始发送视频流给 ${conn.peer}`);
                        
                        // 主动向监控端发起视频通话
                        if (this.stream && this.stream.active) {
                            const call = this.peer.call(conn.peer, this.stream);
                            console.log(`📞 ${this.type}主动发起视频通话给 ${conn.peer}`);

                            call.on('error', (error) => {
                                console.error(`❌ ${this.type}视频通话错误 (${conn.peer}):`, error);
                            });
                            
                            call.on('close', () => {
                                console.log(`📴 ${this.type}主动通话结束 (${conn.peer})`);
                            });
                        } else {
                            console.warn(`⚠️ ${this.type}没有可用的媒体流，无法发送视频 (流状态: ${this.stream ? (this.stream.active ? '活跃' : '非活跃') : '不存在'})`);
                        }
                    }
                });
                
                conn.on('error', (error) => {
                    console.error(`❌ ${this.type}数据连接错误 (${conn.peer}):`, error);
                });
            });

            // 监听来电
            this.peer.on('call', (call) => {
                console.log(`📞 ${this.type}收到来电:`);
                console.log(`  - 来源PeerID: ${call.peer}`);
                console.log(`  - 本地PeerID: ${peerId}`);
                console.log(`  - 当前媒体流状态:`, this.stream ? '可用' : '不可用');
                console.log(`  - 录制状态:`, this.state);

                // 使用当前录制的媒体流应答
                if (this.stream && this.stream.active) {
                    call.answer(this.stream);
                    console.log(`✅ ${this.type}已应答来电并发送媒体流给 ${call.peer}`);
                    
                    call.on('stream', (remoteStream) => {
                        console.log(`📺 ${this.type}收到远程流 (${call.peer})`);
                    });
                    
                    call.on('error', (error) => {
                        console.error(`❌ ${this.type}通话错误 (${call.peer}):`, error);
                    });
                    
                    call.on('close', () => {
                        console.log(`📴 ${this.type}通话结束 (${call.peer})`);
                    });
                } else {
                    console.warn(`⚠️ ${this.type}没有可用的媒体流，无法应答来电 (来自: ${call.peer})`);
                    console.log(`  - 流状态: ${this.stream ? (this.stream.active ? '活跃' : '非活跃') : '不存在'}`);
                    call.close();
                }
            });

            // 监听Peer连接成功
            this.peer.on('open', (id) => {
                console.log(`✅ ${this.type}的WebRTC Peer连接成功，ID: ${id}`);
                
                // 验证PeerID格式是否正确
                const deviceIdForValidation = this.deviceId;
                const expectedPeerId = `${window.SessionUser.stu_no}${this.type}${deviceIdForValidation}`;
                if (id !== expectedPeerId) {
                    console.warn(`⚠️ ${this.type}PeerID不匹配! 期望: ${expectedPeerId}, 实际: ${id}`);
                }
                
                // 通知监控端：WebRTC连接已就绪
                if (window.Socket && window.Socket.connected) {
                    const deviceIdToSend = this.deviceId;
                    console.log(`📡 发送WebRTC就绪通知: type=${this.type}, peerId=${id}, deviceId=${deviceIdToSend}`);
                    window.Socket.emit('webrtc:ready', {
                        type: this.type,
                        peerId: id,
                        deviceId: deviceIdToSend,
                        deviceLabel: this.deviceLabel
                    });
                } else {
                    console.warn(`⚠️ ${this.type}无法发送WebRTC就绪通知: Socket未连接`);
                }
            });

            // 监听错误
            this.peer.on('error', (error) => {
                console.error(`❌ ${this.type}的WebRTC连接错误:`, error);
            });

            // 监听断开连接
            this.peer.on('disconnected', () => {
                console.log(`🔌 ${this.type}的WebRTC连接断开，尝试重连...`);

                // 延迟重连，避免立即重连失败
                setTimeout(() => {
                    if (this.peer && !this.peer.destroyed) {
                        this.peer.reconnect();
                    }
                }, 1000);
            });

            console.log(`✅ ${this.type}的WebRTC连接已初始化`);

        } catch (error) {
            console.error(`❌ ${this.type}建立WebRTC连接失败:`, error);
        }
    }

    /**
     * 停止录制
     */
    stopRecording() {
        try {
            console.log(`⏹️ 停止${this.type}录制...`);

            // 停止录制器
            if (this.recorder && this.recorder.state !== 'inactive') {
                this.recorder.stop();
            }

            // 停止媒体流
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            // 通知服务器停止录制
            if (window.Socket && window.Socket.connected) {
                const deviceIdToSend = this.deviceId;
                window.Socket.emit('record:stop', {
                    type: this.type,
                    deviceId: deviceIdToSend,
                    reason: 'user_requested'
                }, (response) => {
                    if (response && response.success) {
                        console.log(`✅ ${this.type}录制停止已通知服务器`);
                    } else {
                        console.error(`❌ ${this.type}录制停止通知失败:`, response);
                    }
                });
            }

            // 清理资源
            this.cleanup();

            console.log(`✅ ${this.type}录制已完全停止`);

        } catch (error) {
            console.error(`❌ ${this.type}录制停止失败:`, error);
            this.transition(RecordEvent.ERROR_OCCURRED, error);
        }
    }

    /**
     * 通知服务器停止录制（仅通知，不清理本地资源）
     */
    notifyServerStopRecording() {
        if (window.Socket && window.Socket.connected) {
            // 修复：使用正确的deviceId（优先使用managedDeviceId）
            const deviceIdToSend = this.managedDeviceId || this.deviceId;
            window.Socket.emit('record:stop', {
                type: this.type,
                deviceId: deviceIdToSend,
                reason: 'error_occurred'
            }, (response) => {
                if (response && response.success) {
                    console.log(`✅ ${this.type}录制停止已通知服务器（错误处理）`);
                } else {
                    console.error(`❌ ${this.type}录制停止通知失败（错误处理）:`, response);
                }
            });
        }
    }

    /**
     * 错误处理（使用统一错误处理系统）
     */
    handleError(error) {
        if (window.logger) {
            window.logger.error('RecordManager', `${this.type}录制错误:`, error);
        }

        // 如果当前正在录制，先通知服务器停止录制
        if (this.state === RecordState.RECORDING) {
            this.notifyServerStopRecording();
        }

        // 清理资源
        this.cleanup();

        // 使用简化的错误处理系统
        if (window.errorHandler) {
            const context = {
                type: this.type,
                deviceId: this.deviceId,
                deviceLabel: this.deviceLabel
            };
            
            window.errorHandler.handleRecordingError(this.type, error, context);
        } else {
            // 降级处理
            const message = error?.message || '录制过程中发生未知错误';
            if (window.templateSystem) {
                window.templateSystem.showError(`${this.type === 'screen' ? '屏幕' : '摄像头'}录制错误: ${message}`);
            } else {
                alert(`录制错误: ${message}`);
            }
        }

        // 转换到空闲状态
        this.state = RecordState.IDLE;

        // 更新UI状态
        if (window.multiDeviceManager) {
            window.multiDeviceManager.updateUI();
        }
    }

    // 移除复杂的自动重启逻辑，让用户手动重试更可靠

    /**
     * 清理资源
     */
    cleanup() {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // 清理WebRTC连接
        if (this.peer) {
            console.log(`🔌 清理${this.type}的WebRTC连接`);
            this.peer.destroy();
            this.peer = null;
        }

        // 注意：不清理网络状态监听器，因为这些监听器需要在整个RecordManager生命周期内存在
        // 以确保网络恢复时能够重启上传队列

        this.deviceId = '';
        this.deviceLabel = '';
        this.startTime = null;
    }

    /**
     * 处理数据可用事件
     */
    handleDataAvailable(event) {
        if (event.data && event.data.size > 0) {
            this.fileCount++;
            this.totalSize += event.data.size;

            const fileObject = new File([event.data], this.deviceId, {
                type: this.config.mimeType
            });

            console.log(`📦 ${this.type}录制数据片段 #${this.fileCount}, 大小: ${(event.data.size / 1024).toFixed(2)}KB`);

            // 添加到上传队列
            this.uploadQueue.push({
                file: fileObject,
                timestamp: Date.now(),
                retries: 0,
                sequence: this.fileCount
            });

            // 处理上传队列
            this.processUploadQueue();
        }
    }

    /**
     * 处理上传队列
     */
    async processUploadQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) {
            return;
        }

        this.isUploading = true;
        
        // 记录队列开始处理
        if (window.logger && this.uploadQueue.length > 0) {
            window.logger.debug('RecordManager', 
                `${this.type}开始处理上传队列，待上传文件: ${this.uploadQueue.length}个`);
        }

        while (this.uploadQueue.length > 0) {
            const item = this.uploadQueue.shift();

            try {
                await this.uploadFile(item);
                console.log(`✅ ${this.type}文件上传成功: ${item.file.name}`);
            } catch (error) {
                console.error(`❌ ${this.type}文件上传失败:`, error);

                // 永不丢弃文件，保持原始顺序重试
                item.retries++;
                this.uploadQueue.unshift(item); // 放回队列前端，保持上传顺序
                
                console.log(`🔄 ${this.type}文件重试上传 (第${item.retries}次重试)`);
                
                // 简单的重试延迟，最大30秒
                const retryDelay = Math.min(2000 * item.retries, 30000);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        this.isUploading = false;
    }

    /**
     * 上传文件
     */
    uploadFile(item) {
        return new Promise(async (resolve, reject) => {
            if (!window.Socket || !window.Socket.connected) {
                reject(new Error('Socket未连接'));
                return;
            }

            try {
                // 将 File 对象转换为 ArrayBuffer
                const arrayBuffer = await item.file.arrayBuffer();

                // 使用新的文件上传事件格式
                const params = {
                    type: this.type,
                    device: this.deviceId,
                    timestamp: this.sessionStartTime || Date.now(), // 使用会话开始时间，确保同一录制会话的文件名一致
                    sequence: item.sequence || 0,
                    data: arrayBuffer,
                    metadata: {
                        originalTimestamp: window.AllTime,
                        size: item.file.size || arrayBuffer.byteLength
                    }
                };

                window.Socket.emit('file:upload', params, (response) => {
                    if (response && response.success) {
                        resolve(response);
                    } else {
                        console.error(`❌ 文件上传失败:`, response);
                        reject(new Error(response?.error?.message || response?.message || '上传失败'));
                    }
                });
            } catch (error) {
                console.error(`❌ 文件转换失败:`, error);
                reject(new Error('文件转换失败: ' + error.message));
            }
        });
    }

    /**
     * 添加流停止监听器
     */
    addStreamStopListener(stream) {
        const callback = (event) => {
            console.warn(`⚠️ ${this.type}媒体流${event.type === 'ended' ? '结束' : '变为非活跃状态'}`);
            if (this.state === RecordState.RECORDING) {
                // 当媒体流停止时，视为用户主动停止录制，而不是错误
                console.log(`🛑 ${this.type}录制因媒体流停止而结束`);
                this.transition(RecordEvent.STOP_REQUESTED);
            }
        };

        // 监听流和轨道事件
        ['ended', 'inactive'].forEach(event => {
            stream.addEventListener(event, callback, false);
            stream.getTracks().forEach(track => {
                track.addEventListener(event, callback, false);
            });
        });
    }

    /**
     * 处理按钮点击
     */
    handleButtonClick() {
        switch (this.state) {
            case RecordState.IDLE:
            case RecordState.ERROR:
                this.transition(RecordEvent.START_REQUESTED);
                break;

            case RecordState.RECORDING:
                this.transition(RecordEvent.STOP_REQUESTED);
                break;

            default:
                console.warn(`⚠️ ${this.type}按钮点击被忽略，当前状态: ${this.state}`);
        }
    }

    /**
     * 获取当前状态信息
     */
    getStateInfo() {
        return {
            type: this.type,
            state: this.state,
            deviceId: this.deviceId,
            deviceLabel: this.deviceLabel,
            isRecording: this.state === RecordState.RECORDING,
            hasError: this.state === RecordState.ERROR,
            fileCount: this.fileCount,
            totalSize: this.totalSize,
            uploadQueueLength: this.uploadQueue.length,
            startTime: this.startTime
        };
    }
}

// 全局变量
let Socket, SessionUser, AllTime;
let VideoConfig = {}, NetworkConfig = {};
let VideoWidth = 1920, VideoHeight = 1080, VideoRate = 15, SliceTime = 3000;

// 多设备录制管理器
class MultiDeviceManager {
    constructor() {
        this.devices = {
            screen: new Map(),  // deviceId -> RecordManager
            camera: new Map()   // deviceId -> RecordManager
        };
        this.config = null;
        this.limits = {
            screen: { enabled: false, max: 0 },
            camera: { enabled: false, max: 0 }
        };
    }

    /**
     * 初始化配置
     */
    initialize(config) {
        this.config = config;
        this.limits = {
            screen: {
                enabled: config.allowRecord.screen.enabled,
                max: config.allowRecord.screen.maxDevices
            },
            camera: {
                enabled: config.allowRecord.camera.enabled,
                max: config.allowRecord.camera.maxDevices
            }
        };

        console.log('📱 Multi-device manager initialized:', this.limits);
        this.updateUI();
    }

    /**
     * 检查是否可以开始录制
     */
    canStartRecording(type) {
        const limit = this.limits[type];

        if (!limit.enabled || limit.max === 0) {
            return {
                canStart: false,
                reason: `${type === 'screen' ? '屏幕' : '摄像头'}录制功能已禁用`
            };
        }

        if (this.devices[type].size >= limit.max) {
            return {
                canStart: false,
                reason: `已达到最大${type === 'screen' ? '屏幕' : '摄像头'}录制数量限制 (${limit.max})`
            };
        }

        return { canStart: true };
    }

    /**
     * 开始录制
     */
    async startRecording(type) {
        const check = this.canStartRecording(type);

        if (!check.canStart) {
            throw new Error(check.reason);
        }

        const manager = new RecordManager(type, this.config);
        
        // 先开始录制流程，让设备ID自然生成
        manager.transition(RecordEvent.START_REQUESTED);
        
        // 异步等待设备ID生成完成，然后添加到设备列表
        const checkAndAdd = () => {
            if (manager.deviceId && manager.deviceId !== '') {
                this.devices[type].set(manager.deviceId, manager);
                console.log(`🎬 Started recording: ${type}:${manager.deviceId}`);
                this.updateUI();
            } else {
                // 继续等待
                setTimeout(checkAndAdd, 100);
            }
        };
        
        // 延迟添加，等待设备ID生成
        setTimeout(checkAndAdd, 100);

        return manager;
    }

    /**
     * 停止录制
     */
    async stopRecording(type, deviceId) {
        const manager = this.devices[type].get(deviceId);
        if (!manager) {
            console.warn(`Device not found: ${type}:${deviceId}`);
            return;
        }

        // 停止录制
        manager.transition(RecordEvent.STOP_REQUESTED);

        // 从设备列表移除
        this.devices[type].delete(deviceId);

        console.log(`⏹️ Stopped recording: ${type}:${deviceId} (${this.devices[type].size}/${this.limits[type].max})`);
        this.updateUI();
    }

    /**
     * 停止所有录制
     */
    async stopAllRecording() {
        const types = ['screen', 'camera'];
        for (const type of types) {
            const deviceIds = Array.from(this.devices[type].keys());
            for (const deviceId of deviceIds) {
                await this.stopRecording(type, deviceId);
            }
        }
    }

    /**
     * 获取录制状态
     */
    getRecordingStatus() {
        return {
            screen: {
                active: this.devices.screen.size,
                max: this.limits.screen.max,
                enabled: this.limits.screen.enabled,
                devices: Array.from(this.devices.screen.entries()).map(([id, manager]) => ({
                    id,
                    label: manager.deviceLabel || id,
                    state: manager.state
                }))
            },
            camera: {
                active: this.devices.camera.size,
                max: this.limits.camera.max,
                enabled: this.limits.camera.enabled,
                devices: Array.from(this.devices.camera.entries()).map(([id, manager]) => ({
                    id,
                    label: manager.deviceLabel || id,
                    state: manager.state
                }))
            }
        };
    }

    /**
     * 更新UI显示
     */
    updateUI() {
        const status = this.getRecordingStatus();

        // 更新屏幕录制UI
        this.updateTypeUI('screen', status.screen);

        // 更新摄像头录制UI
        this.updateTypeUI('camera', status.camera);
    }

    /**
     * 更新特定类型的UI
     */
    updateTypeUI(type, status) {
        console.log(`🎨 更新${type}录制UI，状态:`, status);
        
        const container = document.getElementById(`${type}-container`);
        const stateElement = document.getElementById(`${type}-state`);
        const stateBtn = document.getElementById(`${type}-state-btn`);
        const recordBtn = document.getElementById(`${type}-record-btn`);

        if (!container || !stateElement || !stateBtn || !recordBtn) {
            console.warn(`⚠️ UI elements not found for ${type}`);
            return;
        }

        const typeText = type === 'screen' ? '屏幕' : '摄像头';

        // 显示/隐藏容器和状态元素
        if (status.enabled) {
            container.style.display = 'block';
            stateElement.style.display = 'block';
            console.log(`✅ ${typeText}录制UI已启用`);
        } else {
            container.style.display = 'none';
            stateElement.style.display = 'none';
            console.log(`❌ ${typeText}录制UI已禁用`);
            return;
        }

        // 更新状态显示
        if (status.active === 0) {
            console.log(`🟢 ${typeText}按钮状态更新为：未录制状态 (active=${status.active})`);
            stateBtn.innerText = '未录制';
            recordBtn.innerText = `开始${typeText}录制`;
            recordBtn.className = "btn btn-primary btn-lg";
            recordBtn.disabled = false;
        } else {
            console.log(`🔴 ${typeText}按钮状态更新为：录制中状态 (active=${status.active})`);
            stateBtn.innerText = '正在录制';
            recordBtn.innerText = `结束${typeText}录制`;
            recordBtn.className = "btn btn-danger btn-lg";
            recordBtn.disabled = false;
        }
    }
}

// 创建全局多设备管理器实例
const multiDeviceManager = new MultiDeviceManager();
window.multiDeviceManager = multiDeviceManager;

// 工具函数
function getTime(date = new Date()) {
    return `${date.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replaceAll('/', '-')}-${date.toLocaleString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).replaceAll(':', '-')}`;
}

function editStr(str) {
    return str.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
}

// 发送通知函数
function sendNotification(title, content) {
    if (window.Notification && window.Notification.permission === "granted") {
        new Notification(title, { body: content });
    }
}

// 发送屏幕数量信息
async function sendScreenNumber() {
    try {
        if (window.getScreenDetails) {
            const screens = await window.getScreenDetails();
            if (Socket && Socket.connected) {
                Socket.emit('screen:update', {
                    userId: SessionUser.stu_no,
                    screenCount: screens.screens.length
                });
            }
        }
    } catch (error) {
        console.warn('Failed to get screen details:', error);
    }
}

// 录制按钮点击处理函数
async function handleRecordButtonClick(type) {
    try {
        const status = multiDeviceManager.getRecordingStatus()[type];

        if (!status.enabled) {
            alert(`${type === 'screen' ? '屏幕' : '摄像头'}录制功能已禁用`);
            return;
        }

        if (status.active === 0) {
            // 开始录制
            await multiDeviceManager.startRecording(type);
        } else {
            // 停止录制
            await multiDeviceManager.stopAllRecording();
        }
    } catch (error) {
        console.error(`Recording button click error:`, error);
        alert(`操作失败: ${error.message}`);
    }
}

// 主要初始化代码
console.log('🚀 开始初始化录制系统...');

// 从template系统获取用户信息，然后获取配置信息
SessionUser = window.templateSystem.sessionUser;

axios.get('/api/information').then(async (res) => {
    if (res.data.success) {
        VideoConfig = res.data.data.videoConfig;
        NetworkConfig = res.data.data.networkConfig;

        console.log('✅ 配置加载成功');
    } else {
        console.error('获取配置信息失败:', res.data.message || '未知错误');
        alert('获取配置信息失败，请刷新页面重试');
        return;
    }

    VideoWidth = VideoConfig.width;
    VideoHeight = VideoConfig.height;
    VideoRate = VideoConfig.frameRate;
    SliceTime = VideoConfig.sliceTime;
    AllTime = getTime();



    // 初始化多设备录制管理器
    multiDeviceManager.initialize({
        width: VideoWidth,
        height: VideoHeight,
        frameRate: VideoRate,
        sliceTime: SliceTime,
        mimeType: VideoConfig.mimeType,
        allowRecord: VideoConfig.allowRecord,
        videoBitsPerSecond: VideoConfig.videoBitsPerSecond,
        audioBitsPerSecond: VideoConfig.audioBitsPerSecond
    });

    // 请求通知权限
    if (window.Notification) {
        Notification.requestPermission().then();
    }

    // 初始化Socket连接（使用Socket.IO原生重连）
    if (window.logger) {
        window.logger.info('RecordSystem', '正在初始化Socket连接...');
    }

    Socket = io(`https://${window.location.hostname}:${NetworkConfig.socketPort}`, {
        rejectUnauthorized: false,
        transports: ['polling', 'websocket'],
        upgrade: true,
        withCredentials: true,
        timeout: 20000,
        // Socket.IO自动重连配置
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: Infinity // 考试监控系统应该无限重连
    });

    // 设置全局变量供RecordManager使用
    window.Socket = Socket;
    window.SessionUser = SessionUser;
    window.AllTime = AllTime;
    window.NetworkConfig = NetworkConfig;

    // 标记是否是初次连接
    let isInitialConnection = true;

    Socket.on('connect', () => {
        if (window.logger) {
            window.logger.info('RecordSystem', 'Socket连接成功');
        }

        if (isInitialConnection) {
            // 初次连接 - 进行用户认证
            Socket.emit('auth', {
                userId: SessionUser.stu_no,
                userType: 'student'
            }, (response) => {
                if (response && response.success) {
                    if (window.logger) {
                        window.logger.info('RecordSystem', '用户认证成功', response.data);
                    }
                    document.getElementById('online-state-btn').innerText = '已连接';
                    AllTime = getTime();
                    window.AllTime = AllTime;
                } else {
                    if (window.logger) {
                        window.logger.error('RecordSystem', '用户认证失败', response);
                    }
                    alert('用户认证失败，请刷新页面重试');
                }
            });
            isInitialConnection = false;
        } else {
            // 重连 - 重新认证并恢复状态
            Socket.emit('auth', {
                userId: SessionUser.stu_no,
                userType: 'student'
            }, (response) => {
                if (response && response.success) {
                    if (window.logger) {
                        window.logger.info('RecordSystem', 'Socket重连认证成功，恢复状态...');
                    }
                    document.getElementById('online-state-btn').innerText = '已连接';
                    restoreConnectionState();
                } else {
                    if (window.logger) {
                        window.logger.error('RecordSystem', '重连认证失败', response);
                    }
                }
            });
        }
    });

    Socket.on('disconnect', (reason) => {
        if (window.logger) {
            window.logger.warn('RecordSystem', 'Socket连接断开:', reason);
        }
        document.getElementById('online-state-btn').innerText = '未连接';
    });

    Socket.on('connect_error', (error) => {
        if (window.logger) {
            window.logger.error('RecordSystem', 'Socket连接错误:', error);
        }
        document.getElementById('online-state-btn').innerText = '连接失败';
        
        // 使用简化的错误处理
        if (window.errorHandler) {
            window.errorHandler.handleSocketError(error);
        }
    });

    Socket.on('reconnect_attempt', (attemptNumber) => {
        if (window.logger) {
            window.logger.info('RecordSystem', `Socket重连尝试 ${attemptNumber}`);
        }
        document.getElementById('online-state-btn').innerText = `重连中(${attemptNumber})`;
    });



    /**
     * 恢复连接状态 - Socket重连后同步状态和重建WebRTC
     */
    function restoreConnectionState() {
        if (window.logger) {
            window.logger.info('RecordSystem', 'Socket重连成功，准备创建新文件记录中断...');
        }

        // 重置所有正在录制的sessionStartTime，这样会创建新文件来体现中断次数
        const recordingController = window.recordingController;
        if (recordingController) {
            ['screen', 'camera'].forEach(type => {
                const devices = recordingController.devices[type];
                devices.forEach((manager, deviceId) => {
                    if (manager.state === RecordState.RECORDING) {
                        // 重置会话时间戳，下次上传时会创建新文件
                        manager.sessionStartTime = Date.now();
                        if (window.logger) {
                            window.logger.info('RecordSystem', 
                                `${type}录制设备 ${deviceId} 重置会话时间戳，下次上传将创建新文件`);
                        }
                        
                        // 重连后自动处理上传队列（简化处理）
                        if (manager.uploadQueue && manager.uploadQueue.length > 0 && !manager.isUploading) {
                            manager.processUploadQueue();
                        }
                    }
                });
            });
        }

        // 重新认证用户状态（已在重连时完成，这里不需要额外操作）
        if (window.logger) {
            window.logger.info('RecordSystem', '用户状态已通过重连认证同步');
        }

        // 同步本地正在录制的状态到服务器 
        if (recordingController) {
            restoreRecordingStates(recordingController);
        }

        if (window.logger) {
            window.logger.info('RecordSystem', '连接状态恢复完成，录制会继续，新文件已准备');
        }
    }

    /**
     * 恢复录制状态（简化版）
     */
    function restoreRecordingStates(controller) {
        if (!controller || !controller.devices) {
            if (window.logger) {
                window.logger.debug('RecordSystem', '没有录制控制器或设备，跳过状态恢复');
            }
            return;
        }

        const types = ['screen', 'camera'];

        types.forEach(type => {
            const devices = controller.devices[type];
            if (devices && devices.size > 0) {
                if (window.logger) {
                    window.logger.info('RecordSystem', `检查${type}录制状态恢复，设备数量: ${devices.size}`);
                }

                devices.forEach((manager, deviceId) => {
                    if (manager.state === RecordState.RECORDING) {
                        if (window.logger) {
                            window.logger.info('RecordSystem', `${type}录制正在进行，无需特殊恢复: ${deviceId}`);
                        }
                        
                        // 重新通知服务器录制状态
                        const deviceIdToSend = manager.deviceId;
                        Socket.emit('record:start', {
                            type: type,
                            device: {
                                id: deviceIdToSend,
                                label: manager.deviceLabel || `${type}_device`
                            },
                            settings: {
                                timestamp: Date.now(),
                                allTime: window.AllTime,
                                isRestore: true
                            }
                        }, (response) => {
                            if (response && response.success) {
                                if (window.logger) {
                                    window.logger.info('RecordSystem', `${type}录制状态已同步到服务器: ${deviceId}`);
                                }
                            } else {
                                if (window.logger) {
                                    window.logger.warn('RecordSystem', `${type}录制状态同步失败: ${deviceId}`, response);
                                }
                            }
                        });
                    }
                });
            }
        });
    }

    Socket.on('notice', (target, data) => {
        if (target === 'all' || target === SessionUser.stu_no) {
            sendNotification('收到通知', data);
        }
    });

    Socket.on('disable', (arg) => {
        if (arg === SessionUser.stu_no) {
            window.location.replace('/logout');
        }
    });

    // 监听管理员录制控制命令
    Socket.on('record:command', (data) => {
        if (window.logger) {
            window.logger.info('RecordSystem', '收到管理员录制控制命令:', data);
        }

        const { action, type, force, from } = data;
        const fromText = from ? `${from.name}(${from.id})` : '管理员';

        if (action === 'start') {
            // 管理员要求开始录制
            if (window.templateSystem) {
                window.templateSystem.showInfo(`${fromText}要求开始${type === 'screen' ? '屏幕' : '摄像头'}录制`);
            }

            // 自动开始录制
            handleRecordButtonClick(type).catch(error => {
                if (window.logger) {
                    window.logger.error('RecordSystem', '管理员控制录制启动失败:', error);
                }
            });

        } else if (action === 'stop') {
            // 管理员要求停止录制
            if (window.templateSystem) {
                window.templateSystem.showInfo(`${fromText}要求停止${type === 'screen' ? '屏幕' : '摄像头'}录制`);
            }

            // 自动停止录制
            if (window.multiDeviceManager) {
                const status = window.multiDeviceManager.getRecordingStatus()[type];
                if (status.active > 0) {
                    window.multiDeviceManager.stopAllRecording().catch(error => {
                        if (window.logger) {
                            window.logger.error('RecordSystem', '管理员控制录制停止失败:', error);
                        }
                    });
                }
            }
        }
    });

    await sendScreenNumber();
}).catch(error => {
    console.error('❌ 初始化失败:', error);
    alert('系统初始化失败，请刷新页面重试: ' + error.message);
});

// 绑定按钮事件
document.getElementById('screen-record-btn').onclick = async () => {
    await handleRecordButtonClick('screen');
};

document.getElementById('camera-record-btn').onclick = async () => {
    await handleRecordButtonClick('camera');
};

