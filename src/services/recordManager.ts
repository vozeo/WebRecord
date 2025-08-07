import { getVideoConfig } from '../config';
import { getAllUsersState, getUserState, DeviceRecordState } from './userManager';
import { addLog } from './database';

/**
 * 录制管理器
 * 负责管理用户的录制设备状态和限制
 */
export class RecordManager {
    
    /**
     * 检查用户是否可以开始新的录制
     */
    canStartRecording(userId: string, type: 'screen' | 'camera', deviceId: string): {
        canStart: boolean;
        reason?: string;
        currentCount?: number;
        maxAllowed?: number;
    } {
        const user = getUserState(userId);
        if (!user) {
            return { canStart: false, reason: '用户不存在' };
        }

        const videoConfig = getVideoConfig();
        const config = videoConfig.allowRecord[type];
        
        // 检查是否启用该类型录制
        if (!config.enabled || config.maxDevices === 0) {
            return { 
                canStart: false, 
                reason: `${type === 'screen' ? '屏幕' : '摄像头'}录制功能已禁用`,
                currentCount: 0,
                maxAllowed: 0
            };
        }

        // 检查设备是否已在录制
        if (user.recordList[type][deviceId]) {
            return { 
                canStart: false, 
                reason: '该设备已在录制中',
                currentCount: this.getActiveDeviceCount(userId, type),
                maxAllowed: config.maxDevices
            };
        }

        // 检查设备数量限制
        const currentCount = this.getActiveDeviceCount(userId, type);
        if (currentCount >= config.maxDevices) {
            return { 
                canStart: false, 
                reason: `已达到最大${type === 'screen' ? '屏幕' : '摄像头'}录制数量限制`,
                currentCount,
                maxAllowed: config.maxDevices
            };
        }

        // 移除总存储限制检查

        return { 
            canStart: true,
            currentCount,
            maxAllowed: config.maxDevices
        };
    }

    /**
     * 开始录制
     */
    async startRecording(
        userId: string, 
        type: 'screen' | 'camera', 
        deviceId: string, 
        deviceLabel: string,
        socketId: string,
        userIP: string
    ): Promise<{ success: boolean; message?: string; deviceState?: DeviceRecordState }> {
        
        const canStart = this.canStartRecording(userId, type, deviceId);
        if (!canStart.canStart) {
            return { success: false, message: canStart.reason };
        }

        const user = getUserState(userId);
        if (!user) {
            return { success: false, message: '用户不存在' };
        }

        try {
            // 创建设备录制状态
            const deviceState: DeviceRecordState = {
                deviceId,
                deviceLabel,
                state: 'recording',
                startTime: Date.now(),
                lastActivity: Date.now(),
                socketId,
                fileCount: 0,
                totalSize: 0,
                errorCount: 0
            };

            // 更新用户录制状态
            user.recordList[type][deviceId] = deviceState;
            user.recordingStats.activeDevices++;
            
            // 检查是否达到最大设备数
            const totalActive = this.getTotalActiveDeviceCount(userId);
            const videoConfig = getVideoConfig();
            const maxTotal = videoConfig.allowRecord.screen.maxDevices + videoConfig.allowRecord.camera.maxDevices;
            user.recordingStats.maxDevicesReached = totalActive >= maxTotal;

            // 记录日志
            await addLog(user, userIP, 'start_record', 
                `开始${type === 'screen' ? '屏幕' : '摄像头'}录制：${deviceLabel} (${deviceId})`);

            console.log(`✅ Recording started: ${userId}:${type}:${deviceId} (${this.getActiveDeviceCount(userId, type) + 1}/${canStart.maxAllowed})`);
            
            return { success: true, deviceState };

        } catch (error) {
            console.error('Start recording failed:', error);
            return { success: false, message: '录制启动失败' };
        }
    }

    /**
     * 停止录制
     */
    async stopRecording(
        userId: string, 
        type: 'screen' | 'camera', 
        deviceId: string,
        userIP: string
    ): Promise<{ success: boolean; message?: string }> {
        
        const user = getUserState(userId);
        if (!user) {
            return { success: false, message: '用户不存在' };
        }

        const deviceState = user.recordList[type][deviceId];
        if (!deviceState) {
            return { success: true, message: '设备未在录制中' };
        }

        try {
            // 更新统计信息
            user.recordingStats.totalFiles += deviceState.fileCount;
            user.recordingStats.totalSize += deviceState.totalSize;
            user.recordingStats.activeDevices--;
            
            // 重新检查最大设备数状态
            const totalActive = this.getTotalActiveDeviceCount(userId);
            const videoConfig = getVideoConfig();
            const maxTotal = videoConfig.allowRecord.screen.maxDevices + videoConfig.allowRecord.camera.maxDevices;
            user.recordingStats.maxDevicesReached = totalActive >= maxTotal;

            // 移除设备录制状态
            delete user.recordList[type][deviceId];

            // 记录日志
            await addLog(user, userIP, 'end_record', 
                `停止${type === 'screen' ? '屏幕' : '摄像头'}录制：${deviceState.deviceLabel} (${deviceId})`);

            console.log(`✅ Recording stopped: ${userId}:${type}:${deviceId}`);
            
            return { success: true };

        } catch (error) {
            console.error('Stop recording failed:', error);
            return { success: false, message: '录制停止失败' };
        }
    }

    /**
     * 更新设备活动状态
     */
    updateDeviceActivity(userId: string, type: 'screen' | 'camera', deviceId: string, fileSize?: number): void {
        const user = getUserState(userId);
        if (!user) return;

        const deviceState = user.recordList[type][deviceId];
        if (!deviceState) return;

        deviceState.lastActivity = Date.now();
        
        if (fileSize) {
            deviceState.fileCount++;
            deviceState.totalSize += fileSize;
        }
    }

    /**
     * 处理设备错误
     */
    async handleDeviceError(
        userId: string, 
        type: 'screen' | 'camera', 
        deviceId: string, 
        error: string,
        userIP: string
    ): Promise<void> {
        const user = getUserState(userId);
        if (!user) return;

        const deviceState = user.recordList[type][deviceId];
        if (!deviceState) return;

        deviceState.state = 'error';
        deviceState.errorCount++;

        // 记录错误日志
        await addLog(user, userIP, 'record_error', 
            `${type === 'screen' ? '屏幕' : '摄像头'}录制错误：${deviceState.deviceLabel} - ${error}`);

        console.error(`❌ Recording error: ${userId}:${type}:${deviceId} - ${error}`);
    }

    /**
     * 获取用户指定类型的活跃设备数量
     */
    getActiveDeviceCount(userId: string, type: 'screen' | 'camera'): number {
        const user = getUserState(userId);
        if (!user) return 0;

        return Object.values(user.recordList[type]).filter(
            device => device.state === 'recording'
        ).length;
    }

    /**
     * 获取用户总活跃设备数量
     */
    getTotalActiveDeviceCount(userId: string): number {
        return this.getActiveDeviceCount(userId, 'screen') + this.getActiveDeviceCount(userId, 'camera');
    }

    /**
     * 获取用户录制状态摘要
     */
    getUserRecordingSummary(userId: string): {
        screen: { active: number; max: number; enabled: boolean };
        camera: { active: number; max: number; enabled: boolean };
        total: { active: number; files: number; size: number };
        canRecord: { screen: boolean; camera: boolean };
    } {
        const user = getUserState(userId);
        if (!user) {
            return {
                screen: { active: 0, max: 0, enabled: false },
                camera: { active: 0, max: 0, enabled: false },
                total: { active: 0, files: 0, size: 0 },
                canRecord: { screen: false, camera: false }
            };
        }

        const screenActive = this.getActiveDeviceCount(userId, 'screen');
        const cameraActive = this.getActiveDeviceCount(userId, 'camera');
        const videoConfig = getVideoConfig();
        const screenConfig = videoConfig.allowRecord.screen;
        const cameraConfig = videoConfig.allowRecord.camera;

        return {
            screen: { 
                active: screenActive, 
                max: screenConfig.maxDevices, 
                enabled: screenConfig.enabled 
            },
            camera: { 
                active: cameraActive, 
                max: cameraConfig.maxDevices, 
                enabled: cameraConfig.enabled 
            },
            total: { 
                active: screenActive + cameraActive,
                files: user.recordingStats.totalFiles,
                size: user.recordingStats.totalSize
            },
            canRecord: {
                screen: screenConfig.enabled && screenActive < screenConfig.maxDevices,
                camera: cameraConfig.enabled && cameraActive < cameraConfig.maxDevices
            }
        };
    }

    /**
     * 清理用户的所有录制状态
     */
    async cleanupUserRecordings(userId: string, userIP: string): Promise<void> {
        const user = getUserState(userId);
        if (!user) return;

        const types: ('screen' | 'camera')[] = ['screen', 'camera'];
        
        for (const type of types) {
            const devices = Object.keys(user.recordList[type]);
            for (const deviceId of devices) {
                await this.stopRecording(userId, type, deviceId, userIP);
            }
        }

        console.log(`🧹 Cleaned up all recordings for user: ${userId}`);
    }

    /**
     * 获取系统录制统计
     */
    getSystemRecordingStats(): {
        totalActiveDevices: number;
        totalUsers: number;
        recordingUsers: number;
        deviceBreakdown: {
            screen: number;
            camera: number;
        };
    } {
        const allUsers = getAllUsersState();
        let totalActiveDevices = 0;
        let recordingUsers = 0;
        let screenDevices = 0;
        let cameraDevices = 0;

        Object.values(allUsers).forEach(user => {
            const userActive = this.getTotalActiveDeviceCount(user.stu_no);
            if (userActive > 0) {
                recordingUsers++;
                totalActiveDevices += userActive;
                screenDevices += this.getActiveDeviceCount(user.stu_no, 'screen');
                cameraDevices += this.getActiveDeviceCount(user.stu_no, 'camera');
            }
        });

        return {
            totalActiveDevices,
            totalUsers: Object.keys(allUsers).length,
            recordingUsers,
            deviceBreakdown: {
                screen: screenDevices,
                camera: cameraDevices
            }
        };
    }
}

// 创建全局实例
export const recordManager = new RecordManager();
