import * as fs from 'fs';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { addLog } from './database';
import { handleInterrupt, updateAccumulatedDuration } from './utils';
import { getAllUsersState, getUserState, updateUserState } from './userManager';
import { serverConfig } from '../../config';
import { recordManager } from './recordManager';

// Socket状态管理
interface UserSessionMap {
    [socketId: string]: string; // socketId -> userId
}

interface MonitorSessionMap {
    [socketId: string]: { monitorId: string; targetId: string }; // 监控会话
}

interface AdminSessionMap {
    [socketId: string]: string; // socketId -> adminId (只存储管理员会话)
}

interface FileUploadMap {
    [sessionKey: string]: string; // deviceKey -> currentFileName
}

// 全局状态管理
let userSessions: UserSessionMap = {};
let monitorSessions: MonitorSessionMap = {};
let adminSessions: AdminSessionMap = {};
let fileUploads: FileUploadMap = {};

// 定时更新机制
let statusUpdateTimer: NodeJS.Timeout | null = null;
let lastBroadcastTime = 0;
const BROADCAST_INTERVAL = 5000; // 5秒间隔
const MIN_BROADCAST_INTERVAL = 2000; // 最小间隔2秒，防止过于频繁

// 日志辅助函数
async function logInfo(user: any, ip: string, action: string, message: string): Promise<void> {
    console.log(`ℹ️ [${action}] ${user ? `${user.stu_name}(${user.stu_no})` : 'Unknown'}: ${message}`);
    await addLog(user, ip, action, message);
}

async function logError(user: any, ip: string, action: string, message: string, error?: any): Promise<void> {
    const errorMsg = error ? `${message} - ${error.message || error}` : message;
    console.error(`❌ [${action}] ${user ? `${user.stu_name}(${user.stu_no})` : 'Unknown'}: ${errorMsg}`);
    await addLog(user, ip, action, errorMsg);
}

async function logWarning(user: any, ip: string, action: string, message: string): Promise<void> {
    console.warn(`⚠️ [${action}] ${user ? `${user.stu_name}(${user.stu_no})` : 'Unknown'}: ${message}`);
    await addLog(user, ip, action, message);
}

// 广播状态给所有管理员
function broadcastStatusToAdmins(io: SocketIOServer, force: boolean = false): void {
    const now = Date.now();
    
    // 防抖动：如果不是强制更新且距离上次广播时间太短，则跳过
    if (!force && (now - lastBroadcastTime) < MIN_BROADCAST_INTERVAL) {
        return;
    }
    
    const allUsers = getAllUsersState();
    
    // 更新所有用户的累计录制时长
    Object.values(allUsers).forEach(user => {
        updateAccumulatedDuration(user);
    });
    
    const statusData = {
        users: allUsers,
        timestamp: now
    };

    // 只向管理员Socket发送状态更新
    let successCount = 0;
    Object.keys(adminSessions).forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && socket.connected) {
            socket.emit('status', statusData);
            successCount++;
        }
    });

    lastBroadcastTime = now;

    // 在开发环境记录广播信息
    if (process.env.NODE_ENV !== 'production') {
        console.log(`📤 状态广播给 ${successCount} 个管理员 (总管理员: ${Object.keys(adminSessions).length})`);
    }
}

// 开始定时状态更新
function startStatusUpdateTimer(io: SocketIOServer): void {
    if (statusUpdateTimer) {
        clearInterval(statusUpdateTimer);
    }
    
    statusUpdateTimer = setInterval(() => {
        const adminCount = Object.keys(adminSessions).length;
        if (adminCount > 0) {
            broadcastStatusToAdmins(io, true); // 定时更新强制广播
        }
    }, BROADCAST_INTERVAL);
    
    console.log(`⏰ 状态更新定时器已启动，间隔: ${BROADCAST_INTERVAL}ms`);
}

// 停止定时状态更新
function stopStatusUpdateTimer(): void {
    if (statusUpdateTimer) {
        clearInterval(statusUpdateTimer);
        statusUpdateTimer = null;
        console.log(`⏰ 状态更新定时器已停止`);
    }
}

/**
 * 设置Socket.IO事件处理
 * @param io - Socket.IO实例
 */
export const setupSocketHandlers = (io: SocketIOServer): void => {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    console.log('🔌 Socket.IO事件处理器已设置');

    io.on('connection', async (socket: Socket) => {
        const userIP = socket.handshake.address;

        // 记录连接详情（开发环境详细，生产环境简洁）
        if (isDevelopment) {
            const userAgent = socket.handshake.headers['user-agent'];
            const origin = socket.handshake.headers.origin;
            console.log(`🔗 Socket连接建立: ${socket.id} from ${userIP}`);
            console.log(`  - User-Agent: ${userAgent}`);
            console.log(`  - Origin: ${origin}`);
            console.log(`  - Transport: ${socket.conn.transport.name}`);
        } else {
            console.log(`🔗 Socket连接: ${socket.id} from ${userIP}`);
        }

        // 记录连接日志到数据库
        await logInfo(null, userIP, 'socket_connect', `Socket连接建立 (${socket.id})`);

        // 设置连接超时
        const connectionTimeout = setTimeout(async () => {
            if (!userSessions[socket.id]) {
                await logWarning(null, userIP, 'socket_timeout', `Socket连接超时未认证 (${socket.id})`);
                socket.disconnect(true);
            }
        }, 30000); // 30秒超时

        // 用户认证事件（替代user:connect）
        socket.on('auth', async (params: {
            userId: string;
            userType?: 'student' | 'admin';
            sessionInfo?: any;
        }, callback: (response: any) => void) => {
            try {
                clearTimeout(connectionTimeout); // 清除连接超时
                
                const { userId, userType } = params;
                const allUsers = getAllUsersState();

                // 验证用户是否存在
                if (!allUsers[userId]) {
                    await logError(null, userIP, 'auth_failed', `用户认证失败: 用户不存在 (${userId})`);
                    callback({
                        success: false,
                        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
                        timestamp: Date.now()
                    });
                    return;
                }

                const user = allUsers[userId];
                
                // 检查用户状态 - 修复：检查stu_enable字段而不是status字段
                if (user.stu_enable !== '1') {
                    await logWarning(user, userIP, 'auth_failed', `用户认证失败: 用户已被禁用`);
                    callback({
                        success: false,
                        error: { code: 'USER_DISABLED', message: '用户已被禁用' },
                        timestamp: Date.now()
                    });
                    return;
                }

                // 建立用户会话
                userSessions[socket.id] = userId;
                
                // 让socket加入以用户ID命名的房间，用于管理员控制
                socket.join(userId);
                
                // 如果是管理员，同时记录到管理员会话
                const userLevel = parseInt(user.stu_userlevel);
                const isAdmin = userLevel >= 1;
                if (isAdmin) {
                    const wasFirstAdmin = Object.keys(adminSessions).length === 0;
                    adminSessions[socket.id] = userId;
                    
                    // 如果这是第一个管理员连接，启动定时状态更新
                    if (wasFirstAdmin) {
                        startStatusUpdateTimer(io);
                    }
                }
                
                // 更新在线状态
                if (typeof user.online !== 'number') {
                    user.online = 0;
                }
                user.online++;
                
                // 记录认证成功日志
                const userTypeStr = userType || (isAdmin ? 'admin' : 'student');
                await logInfo(user, userIP, 'auth_success', `用户认证成功 (${userTypeStr})`);

                // 广播用户状态更新（只发送给管理员）
                broadcastStatusToAdmins(io);

                callback({
                    success: true,
                    data: { 
                        userId, 
                        userLevel: parseInt(user.stu_userlevel),
                        status: 'authenticated' 
                    },
                    timestamp: Date.now()
                });

            } catch (error) {
                await logError(null, userIP, 'auth_error', '用户认证异常', error);
                callback({
                    success: false,
                    error: { code: 'INTERNAL_ERROR', message: '认证失败' },
                    timestamp: Date.now()
                });
            }
        });

        // 录制开始事件
        socket.on('record:start', async (params: {
            type: 'screen' | 'camera';
            device: { id: string; label: string };
            settings?: any;
        }, callback: (response: any) => void) => {
            try {
                const userId = userSessions[socket.id];
                if (!userId) {
                    await logWarning(null, userIP, 'record_start_failed', '录制开始失败: 用户未认证');
                    callback({
                        success: false,
                        error: { code: 'UNAUTHORIZED', message: '用户未认证' },
                        timestamp: Date.now()
                    });
                    return;
                }

                const allUsers = getAllUsersState();
                const user = allUsers[userId];
                
                if (!user) {
                    await logError(null, userIP, 'record_start_failed', `录制开始失败: 用户不存在 (${userId})`);
                    callback({
                        success: false,
                        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
                        timestamp: Date.now()
                    });
                    return;
                }

                // 记录录制开始请求
                await logInfo(user, userIP, 'record_start_request', 
                    `请求开始${params.type === 'screen' ? '屏幕' : '摄像头'}录制: ${params.device.label}`);

                const result = await recordManager.startRecording(
                    userId,
                    params.type,
                    params.device.id,
                    params.device.label,
                    socket.id,
                    userIP
                );

                if (result.success) {
                    // 记录录制开始成功
                    await logInfo(user, userIP, 'record_start_success', 
                        `${params.type === 'screen' ? '屏幕' : '摄像头'}录制启动成功: ${params.device.label}`);

                    // 广播状态更新（只发送给管理员）
                    broadcastStatusToAdmins(io);

                    callback({
                        success: true,
                        data: { type: params.type, status: 'started', deviceId: params.device.id },
                        timestamp: Date.now()
                    });
                } else {
                    await logError(user, userIP, 'record_start_failed', 
                        `${params.type === 'screen' ? '屏幕' : '摄像头'}录制启动失败: ${result.message || '未知错误'}`);
                    
                    callback({
                        success: false,
                        error: { code: 'RECORDING_START_FAILED', message: result.message || '录制启动失败' },
                        timestamp: Date.now()
                    });
                }

            } catch (error) {
                await logError(null, userIP, 'record_start_error', '录制启动异常', error);
                callback({
                    success: false,
                    error: { code: 'INTERNAL_ERROR', message: '录制启动失败' },
                    timestamp: Date.now()
                });
            }
        });

        // 录制停止事件
        socket.on('record:stop', async (params: {
            type: 'screen' | 'camera';
            deviceId?: string;
            reason?: string;
        }, callback: (response: any) => void) => {
            try {
                const userId = userSessions[socket.id];
                if (!userId) {
                    await logWarning(null, userIP, 'record_stop_failed', '录制停止失败: 用户未认证');
                    callback({
                        success: false,
                        error: { code: 'UNAUTHORIZED', message: '用户未认证' },
                        timestamp: Date.now()
                    });
                    return;
                }

                const allUsers = getAllUsersState();
                const user = allUsers[userId];

                if (!user) {
                    await logError(null, userIP, 'record_stop_failed', `录制停止失败: 用户不存在 (${userId})`);
                    callback({
                        success: false,
                        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
                        timestamp: Date.now()
                    });
                    return;
                }

                // 记录录制停止请求
                const reasonStr = params.reason ? ` (原因: ${params.reason})` : '';
                await logInfo(user, userIP, 'record_stop_request', 
                    `请求停止${params.type === 'screen' ? '屏幕' : '摄像头'}录制${reasonStr}`);

                // 如果提供了deviceId，使用它；否则查找当前socket对应的设备
                let deviceId = params.deviceId;
                if (!deviceId) {
                    // 查找当前socket对应的设备ID
                    const recordList = user.recordList[params.type];
                    for (const [deviceKey, deviceState] of Object.entries(recordList || {})) {
                        if (deviceState.socketId === socket.id) {
                            deviceId = deviceKey;
                            break;
                        }
                    }
                }

                if (!deviceId) {
                    await logWarning(user, userIP, 'record_stop_failed', `未找到${params.type}录制设备`);
                    callback({
                        success: false,
                        error: { code: 'DEVICE_NOT_FOUND', message: '未找到录制设备' },
                        timestamp: Date.now()
                    });
                    return;
                }

                const result = await recordManager.stopRecording(userId, params.type, deviceId, userIP);

                if (result.success) {
                    // 记录录制停止成功
                    await logInfo(user, userIP, 'record_stop_success', 
                        `${params.type === 'screen' ? '屏幕' : '摄像头'}录制停止成功${reasonStr}`);

                    // 广播状态更新（只发送给管理员）
                    broadcastStatusToAdmins(io);

                    callback({
                        success: true,
                        data: { type: params.type, status: 'stopped' },
                        timestamp: Date.now()
                    });
                } else {
                    await logError(user, userIP, 'record_stop_failed', 
                        `${params.type === 'screen' ? '屏幕' : '摄像头'}录制停止失败: ${result.message || '未知错误'}`);
                    
                    callback({
                        success: false,
                        error: { code: 'RECORDING_STOP_FAILED', message: result.message || '录制停止失败' },
                        timestamp: Date.now()
                    });
                }

            } catch (error) {
                await logError(null, userIP, 'record_stop_error', '录制停止异常', error);
                callback({
                    success: false,
                    error: { code: 'INTERNAL_ERROR', message: '录制停止失败' },
                    timestamp: Date.now()
                });
            }
        });

        // 管理员录制控制事件
        socket.on('admin:control', async (params: {
            action: 'start_all' | 'stop_all' | 'start_user' | 'stop_user';
            targetUsers?: string[];
            recordType?: 'screen' | 'camera' | 'both';
            force?: boolean;
        }, callback: (response: any) => void) => {
            try {
                const adminId = userSessions[socket.id];
                if (!adminId) {
                    await logWarning(null, userIP, 'admin_control_failed', '管理员控制失败: 用户未认证');
                    callback({
                        success: false,
                        error: { code: 'UNAUTHORIZED', message: '用户未认证' },
                        timestamp: Date.now()
                    });
                    return;
                }

                const allUsers = getAllUsersState();
                const admin = allUsers[adminId];

                if (!admin) {
                    await logError(null, userIP, 'admin_control_failed', `管理员控制失败: 用户不存在 (${adminId})`);
                    callback({
                        success: false,
                        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
                        timestamp: Date.now()
                    });
                    return;
                }

                // 验证管理员权限 - 修复：使用>=1而不是!=0
                const adminLevel = parseInt(admin.stu_userlevel);
                if (adminLevel < 1) {
                    await logWarning(admin, userIP, 'admin_control_forbidden', 
                        `管理员权限不足: 当前等级${adminLevel}，需要>=1`);
                    callback({
                        success: false,
                        error: { code: 'FORBIDDEN', message: '权限不足，需要管理员权限' },
                        timestamp: Date.now()
                    });
                    return;
                }

                // 确定目标用户
                let targetUserIds: string[] = [];
                if (params.action === 'start_all' || params.action === 'stop_all') {
                    // 获取所有在线学生（用户级别为0）
                    targetUserIds = Object.keys(allUsers).filter(userId => {
                        const user = allUsers[userId];
                        return parseInt(user.stu_userlevel) === 0 && user.online > 0;
                    });
                } else {
                    targetUserIds = params.targetUsers || [];
                }

                // 记录管理员操作
                await logInfo(admin, userIP, 'admin_control_start', 
                    `管理员执行录制控制: ${params.action}, 目标用户: ${targetUserIds.length}个, 录制类型: ${params.recordType || 'both'}`);

                const results: any[] = [];
                const recordTypes = params.recordType === 'both' ? ['screen', 'camera'] :
                                   params.recordType ? [params.recordType] : ['screen', 'camera'];

                // 执行控制命令
                for (const userId of targetUserIds) {
                    const targetUser = allUsers[userId];
                    if (!targetUser) continue;

                    for (const type of recordTypes) {
                        const commandAction = params.action.includes('start') ? 'start' : 'stop';
                        
                        // 发送控制命令到目标用户
                        io.to(userId).emit('record:command', {
                            action: commandAction,
                            type: type,
                            force: params.force || false,
                            from: {
                                id: adminId,
                                name: admin.stu_name,
                                level: adminLevel
                            },
                            timestamp: Date.now()
                        });

                        results.push({ 
                            userId, 
                            userName: targetUser.stu_name,
                            type, 
                            action: commandAction 
                        });
                    }
                }

                // 记录操作完成
                await logInfo(admin, userIP, 'admin_control_success', 
                    `管理员录制控制执行完成: 影响${results.length}个录制任务`);

                callback({
                    success: true,
                    data: { 
                        results, 
                        affectedUsers: targetUserIds.length,
                        adminLevel 
                    },
                    timestamp: Date.now()
                });

            } catch (error) {
                await logError(null, userIP, 'admin_control_error', '管理员录制控制异常', error);
                callback({
                    success: false,
                    error: { code: 'INTERNAL_ERROR', message: '控制命令执行失败' },
                    timestamp: Date.now()
                });
            }
        });

        // 文件上传事件
        socket.on('file:upload', async (params: {
            type: 'screen' | 'camera';
            device: string;
            timestamp: number;
            sequence: number;
            data: Buffer;
            metadata?: any;
        }, callback: (response: any) => void) => {
            const uploadStartTime = Date.now();
            
            try {
                const userId = userSessions[socket.id];
                if (!userId) {
                    await logWarning(null, userIP, 'file_upload_unauthorized', 
                        `未认证的文件上传尝试 (Socket: ${socket.id})`);
                    callback({
                        success: false,
                        error: { code: 'UNAUTHORIZED', message: '用户未认证' },
                        timestamp: Date.now()
                    });
                    return;
                }

                const allUsers = getAllUsersState();
                const user = allUsers[userId];
                if (!user) {
                    await logError(null, userIP, 'file_upload_failed', 
                        `文件上传失败: 用户不存在 (${userId})`);
                    callback({
                        success: false,
                        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
                        timestamp: Date.now()
                    });
                    return;
                }

                // 处理文件上传逻辑
                const fileSize = params.data.length;
                const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
                const deviceKey = `${userId}-${params.type}-${params.device}`;
                const fileName = `u${userId}-${params.type}-${new Date(params.timestamp).toISOString().replace(/[:.]/g, '-')}-${params.device}.webm`;
                const userDir = `${serverConfig.savePath}/u${userId}`;
                const filePath = `${userDir}/${fileName}`;

                // 确保用户目录存在
                if (!fs.existsSync(userDir)) {
                    fs.mkdirSync(userDir, { recursive: true });
                    await logInfo(user, userIP, 'directory_created', `创建录制目录: ${userDir}`);
                }

                const isNewFile = fileName !== fileUploads[deviceKey];
                
                if (isNewFile) {
                    // 新文件开始上传
                    fs.writeFileSync(filePath, params.data);
                    fileUploads[deviceKey] = fileName;
                    allUsers[userId].lastStartTime = Date.now();
                    
                    // 记录新文件开始上传
                    await logInfo(user, userIP, 'file_upload_new', 
                        `开始上传${params.type === 'screen' ? '屏幕' : '摄像头'}录制文件: ${fileName} (${fileSizeMB}MB)`);
                } else {
                    // 文件续传
                    const originalSize = fs.statSync(filePath).size;
                    fs.appendFileSync(filePath, params.data);
                    const newSize = fs.statSync(filePath).size;
                    
                    // 每达到新的50MB里程碑时记录进度（减少日志频率）
                    const oldMilestone = Math.floor(originalSize / (50 * 1024 * 1024));
                    const newMilestone = Math.floor(newSize / (50 * 1024 * 1024));
                    if (newMilestone > oldMilestone) {
                        const totalSizeMB = (newSize / 1024 / 1024).toFixed(2);
                        await logInfo(user, userIP, 'file_upload_progress', 
                            `文件上传进度: ${fileName} 已达到 ${totalSizeMB}MB`);
                    }
                    
                    updateAccumulatedDuration(allUsers[userId]);
                }

                // 更新录制统计 - 修复：使用deviceId而不是socket.id查找设备记录
                if (user.recordList?.[params.type]?.[params.device]) {
                    const deviceRecord = user.recordList[params.type][params.device];
                    deviceRecord.fileCount = (deviceRecord.fileCount || 0) + (isNewFile ? 1 : 0);
                    deviceRecord.totalSize = (deviceRecord.totalSize || 0) + fileSize;
                    deviceRecord.lastActivity = Date.now();
                } else {
                    // 如果找不到设备记录，可能是录制已经停止，记录警告
                    await logWarning(user, userIP, 'file_upload_device_not_found', 
                        `文件上传时未找到对应设备记录: ${params.type}:${params.device}`);
                }

                const uploadDuration = Date.now() - uploadStartTime;
                const uploadSpeedKBps = (fileSize / 1024 / (uploadDuration / 1000)).toFixed(2);

                // 只记录关键的上传成功日志（新文件或每20个片段）
                if (isNewFile || (params.sequence > 0 && params.sequence % 20 === 0)) {
                    await logInfo(user, userIP, 'file_upload_success', 
                        `文件上传${isNewFile ? '开始' : '进行中'}: ${fileName} (片段: ${params.sequence}, 速度: ${uploadSpeedKBps}KB/s)`);
                }

                callback({
                    success: true,
                    data: { 
                        fileId: fileName, 
                        size: fileSize,
                        isNewFile,
                        uploadSpeed: uploadSpeedKBps,
                        sequence: params.sequence
                    },
                    timestamp: Date.now()
                });

            } catch (error) {
                const uploadDuration = Date.now() - uploadStartTime;
                const errorMsg = (error as Error).message;
                
                await logError(null, userIP, 'file_upload_error', 
                    `文件上传异常: 类型${params?.type || 'unknown'}, 设备${params?.device || 'unknown'}, 耗时${uploadDuration}ms`, error);
                
                callback({
                    success: false,
                    error: { 
                        code: 'FILE_UPLOAD_FAILED', 
                        message: '文件上传失败',
                        details: errorMsg
                    },
                    timestamp: Date.now()
                });
            }
        });

        // 状态请求事件
        socket.on('status:request', async () => {
            try {
                const userId = userSessions[socket.id];
                if (!userId) {
                    await logWarning(null, userIP, 'status_request_unauthorized', 
                        '状态请求失败: 用户未认证');
                    return;
                }

                const allUsers = getAllUsersState();
                const user = allUsers[userId];
                
                if (!user) {
                    await logWarning(null, userIP, 'status_request_failed', 
                        `状态请求失败: 用户不存在 (${userId})`);
                    return;
                }

                // 只有管理员可以请求全局状态
                const userLevel = parseInt(user.stu_userlevel);
                if (userLevel >= 1) {
                    socket.emit('status', {
                        users: allUsers,
                        timestamp: Date.now()
                    });
                    
                    // 仅在开发环境记录日志
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`📤 发送全局状态给管理员 ${user.stu_name}(${userId})`);
                    }
                } else {
                    // 普通用户只能获取自己的状态
                    socket.emit('status', {
                        users: { [userId]: user },
                        timestamp: Date.now()
                    });
                }

            } catch (error) {
                await logError(null, userIP, 'status_request_error', '状态请求异常', error);
            }
        });

        // 监控事件
        socket.on('monitor:start', async (params: {
            targetUserId: string;
            monitorType?: 'screen' | 'camera' | 'both';
        }) => {
            try {
                const monitorId = userSessions[socket.id];
                if (!monitorId) {
                    await logWarning(null, userIP, 'monitor_unauthorized', '监控请求失败: 用户未认证');
                    return;
                }

                const allUsers = getAllUsersState();
                const monitor = allUsers[monitorId];
                const target = allUsers[params.targetUserId];

                if (!monitor) {
                    await logError(null, userIP, 'monitor_failed', `监控失败: 监控者不存在 (${monitorId})`);
                    return;
                }

                if (!target) {
                    await logError(monitor, userIP, 'monitor_failed', `监控失败: 目标用户不存在 (${params.targetUserId})`);
                    return;
                }

                // 验证监控权限 - 修复：使用>=1而不是!=0
                const monitorLevel = parseInt(monitor.stu_userlevel);
                if (monitorLevel < 1) {
                    await logWarning(monitor, userIP, 'monitor_forbidden', 
                        `监控权限不足: 当前等级${monitorLevel}，需要>=1`);
                    return;
                }

                // 建立监控会话
                monitorSessions[socket.id] = {
                    monitorId,
                    targetId: params.targetUserId
                };

                // 更新被监控用户的监控列表
                if (!target.watchList) {
                    target.watchList = {};
                }

                if (target.watchList[monitorId]) {
                    target.watchList[monitorId].watchCount += 1;
                } else {
                    target.watchList[monitorId] = {
                        stu_no: monitor.stu_no,
                        stu_name: monitor.stu_name,
                        watchCount: 1,
                        startTime: Date.now()
                    };
                }

                await logInfo(monitor, userIP, 'monitor_start', 
                    `开始监控 ${target.stu_name}(${target.stu_no})`);

                // 广播状态更新（只发送给管理员）
                broadcastStatusToAdmins(io);

            } catch (error) {
                await logError(null, userIP, 'monitor_error', '监控启动异常', error);
            }
        });

        // WebRTC连接就绪事件
        socket.on('webrtc:ready', async (params: {
            type: 'screen' | 'camera';
            peerId: string;
            deviceId: string;
            deviceLabel: string;
        }) => {
            try {
                const userId = userSessions[socket.id];
                if (!userId) {
                    await logWarning(null, userIP, 'webrtc_ready_unauthorized', 
                        'WebRTC就绪通知失败: 用户未认证');
                    return;
                }

                const allUsers = getAllUsersState();
                const user = allUsers[userId];
                
                if (!user) {
                    await logWarning(null, userIP, 'webrtc_ready_failed', 
                        `WebRTC就绪通知失败: 用户不存在 (${userId})`);
                    return;
                }

                // 更新设备的WebRTC连接状态
                // 修复：查找设备时支持按deviceId和socketId两种方式查找
                const recordList = user.recordList?.[params.type];
                let deviceRecord = recordList?.[params.deviceId];
                
                // 如果按deviceId找不到，尝试按socketId查找
                if (!deviceRecord && recordList) {
                    for (const [key, record] of Object.entries(recordList)) {
                        if (record.socketId === socket.id) {
                            deviceRecord = record;
                            break;
                        }
                    }
                }
                
                if (deviceRecord) {
                    deviceRecord.webrtcReady = true;
                    deviceRecord.peerId = params.peerId;
                    
                    await logInfo(user, userIP, 'webrtc_ready', 
                        `${params.type === 'screen' ? '屏幕' : '摄像头'}WebRTC连接就绪: ${params.deviceLabel} (PeerID: ${params.peerId})`);
                } else {
                    await logWarning(user, userIP, 'webrtc_ready_device_not_found', 
                        `WebRTC就绪通知失败: 未找到设备记录 (deviceId: ${params.deviceId}, socketId: ${socket.id})`);
                }

                // 广播状态更新，让live界面知道可以连接了
                broadcastStatusToAdmins(io);

            } catch (error) {
                await logError(null, userIP, 'webrtc_ready_error', 'WebRTC就绪处理异常', error);
            }
        });

        // 屏幕数量变化事件
        socket.on('screen:update', async (params: {
            userId: string;
            screenCount: number;
        }) => {
            try {
                const userId = userSessions[socket.id];
                if (!userId || userId !== params.userId) {
                    await logWarning(null, userIP, 'screen_update_unauthorized', 
                        '屏幕数量更新失败: 用户未认证或用户ID不匹配');
                    return;
                }

                const allUsers = getAllUsersState();
                const user = allUsers[userId];
                
                if (!user) {
                    await logWarning(null, userIP, 'screen_update_failed', 
                        `屏幕数量更新失败: 用户不存在 (${userId})`);
                    return;
                }

                const oldCount = user.screenNumber || 1;
                if (params.screenCount !== oldCount) {
                    user.screenNumber = params.screenCount;
                    
                    await logInfo(user, userIP, 'screen_change', 
                        `屏幕数量变化: ${oldCount} → ${params.screenCount}`);
                    
                    // 广播状态更新（只发送给管理员）
                    broadcastStatusToAdmins(io);
                }

            } catch (error) {
                await logError(null, userIP, 'screen_update_error', '屏幕数量更新异常', error);
            }
        });

        // 断开连接事件处理
        socket.on('disconnect', async (reason) => {
            try {
                // 记录断开连接日志
                if (isDevelopment) {
                    console.log(`🔌 Socket断开连接: ${socket.id}, 原因: ${reason}`);
                }

                const allUsers = getAllUsersState();

                // 处理监控会话断开
                if (monitorSessions[socket.id]) {
                    const { monitorId, targetId } = monitorSessions[socket.id];
                    const monitor = allUsers[monitorId];
                    const target = allUsers[targetId];

                    if (monitor && target && target.watchList?.[monitorId]) {
                        if (target.watchList[monitorId].watchCount > 1) {
                            target.watchList[monitorId].watchCount -= 1;
                        } else {
                            delete target.watchList[monitorId];
                        }

                        await logInfo(monitor, userIP, 'monitor_end', 
                            `结束监控 ${target.stu_name}(${target.stu_no})`);
                    }

                    delete monitorSessions[socket.id];
                }

                // 处理用户会话断开
                const userId = userSessions[socket.id];
                if (userId) {
                    const user = allUsers[userId];
                    if (user) {
                        // 更新在线状态
                        if (typeof user.online !== 'number') {
                            user.online = 0;
                        }
                        user.online = Math.max(0, user.online - 1);

                        await logInfo(user, userIP, 'disconnect', 
                            `用户断线 (原因: ${reason}, 剩余连接: ${user.online})`);
                        
                        // 如果用户完全离线，清理该socket对应的录制状态
                        if (user.online <= 0) {
                            // 停止该socket对应的所有录制设备
                            const recordTypes: ('screen' | 'camera')[] = ['screen', 'camera'];
                            for (const type of recordTypes) {
                                const recordList = user.recordList[type];
                                const devicesToClean = Object.keys(recordList).filter(deviceId => {
                                    return recordList[deviceId].socketId === socket.id;
                                });
                                
                                for (const deviceId of devicesToClean) {
                                    const deviceState = recordList[deviceId];
                                    await logInfo(user, userIP, 'record_auto_stop', 
                                        `用户断线自动停止${type === 'screen' ? '屏幕' : '摄像头'}录制: ${deviceState.deviceLabel}`);
                                    await recordManager.stopRecording(userId, type, deviceId, userIP);
                                }
                            }
                        }
                        
                        // 清理文件上传状态
                        Object.keys(fileUploads).forEach(key => {
                            if (key.startsWith(`${userId}-`)) {
                                delete fileUploads[key];
                            }
                        });
                    }

                    delete userSessions[socket.id];
                }

                // 清理管理员会话
                if (adminSessions[socket.id]) {
                    delete adminSessions[socket.id];
                    
                    // 如果没有管理员在线了，停止定时状态更新
                    if (Object.keys(adminSessions).length === 0) {
                        stopStatusUpdateTimer();
                    }
                }

                // 广播状态更新（只发送给管理员）
                if (userId || monitorSessions[socket.id]) {
                    broadcastStatusToAdmins(io);
                }

            } catch (error) {
                await logError(null, userIP, 'disconnect_error', '断开连接处理异常', error);
            }
        });

    });
    
    // 立即启动定时状态更新（如果有管理员在线）
    const initialAdminCount = Object.keys(adminSessions).length;
    if (initialAdminCount > 0) {
        startStatusUpdateTimer(io);
    }
};
