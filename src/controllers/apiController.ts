/**
 * API控制器
 * 处理所有业务API请求
 */

import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import { 
    AuthenticatedRequest, 
    ApiResponse, 
    FileInfo, 
    StudentRecordInfo,
    ValidationError,
    NotFoundError
} from '../types';
import { videoConfig, networkConfig, serverConfig, databaseConfig } from '../config';
import { 
    addLog, 
    getUserById, 
    updateById, 
    getMonitorStuList, 
    examStudentManagement, 
    getMonitorExamStuList 
} from '../services/database';
import { formatFileSize } from '../services/utils';
import { getAllUsersState, removeUser } from '../services/userManager';
import * as os from 'os';

/**
 * 创建API控制器
 */
export const createApiController = (io: SocketIOServer) => {
    return {
        /**
         * 获取系统配置信息（需要认证）
         */
        getInformation: [async (req: AuthenticatedRequest, res: Response) => {
            const response: ApiResponse = {
                success: true,
                message: '获取配置信息成功',
                data: {
                    videoConfig,
                    networkConfig,
                    sessionUser: req.session?.user || null
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 获取系统状态信息（需要管理员权限）
         */
        getSystemStatus: [async (req: AuthenticatedRequest, res: Response) => {
            try {

                const allUsers = getAllUsersState();
                const totalUsers = Object.keys(allUsers).length;
                const onlineUsers = Object.values(allUsers).filter(user => user.online > 0).length;
                const recordingUsers = Object.values(allUsers).filter(user =>
                    Object.keys(user.recordList.screen).length > 0 ||
                    Object.keys(user.recordList.camera).length > 0
                ).length;

                // 获取监考员在线状态
                const supervisors = Object.values(allUsers).filter(user =>
                    parseInt(user.stu_userlevel) >= 1 && user.online > 0
                );

                // 系统资源信息
                const systemInfo = {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpuUsage: process.cpuUsage(),
                    platform: os.platform(),
                    arch: os.arch(),
                    nodeVersion: process.version,
                    loadAverage: os.loadavg(),
                    freeMemory: os.freemem(),
                    totalMemory: os.totalmem()
                };

                const response: ApiResponse = {
                    success: true,
                    message: '获取系统状态成功',
                    data: {
                        userStats: {
                            total: totalUsers,
                            online: onlineUsers,
                            recording: recordingUsers
                        },
                        supervisors: supervisors.map(supervisor => ({
                            stu_no: supervisor.stu_no,
                            stu_name: supervisor.stu_name,
                            stu_userlevel: supervisor.stu_userlevel,
                            online: supervisor.online,
                            loginTime: supervisor.loginTime,
                            lastIP: supervisor.lastIP
                        })),
                        system: systemInfo,
                        server: {
                            startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                            currentTime: new Date().toISOString()
                        }
                    },
                    timestamp: new Date().toISOString()
                };
                return res.json(response);
            } catch (error) {
                // 错误日志在生产环境也需要输出，便于监控
                console.error('获取系统状态失败:', error);
                const response: ApiResponse = {
                    success: false,
                    message: '获取系统状态失败',
                    timestamp: new Date().toISOString()
                };
                return res.status(500).json(response);
            }
        }],





        /**
         * 获取学生列表
         */
        getStudentList: [async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new ValidationError('用户session无效');
            }

            // 根据用户级别确定查询类型：1=普通管理员(valid)，>=5=超级管理员(all)
            const userLevel = parseInt(req.session.user.stu_userlevel);
            const queryType = userLevel >= 5 ? 'all' : 'valid';

            const stulist = databaseConfig.stulist === 'exam' ?
                await getMonitorExamStuList(
                    databaseConfig.term || '',
                    databaseConfig.cno || '',
                    databaseConfig.eno || '',
                    req.session.user.stu_no,
                    queryType
                ) :
                await getMonitorStuList(req.session.user.stu_no, queryType);

            const response: ApiResponse = {
                success: true,
                message: '获取学生列表成功',
                data: {
                    stulist,
                    examInfo: databaseConfig.stulist === 'exam' ? {
                        term: databaseConfig.term,
                        cno: databaseConfig.cno,
                        eno: databaseConfig.eno
                    } : null
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 获取在线监考员列表
         */
        getSupervisorsList: [async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new ValidationError('用户session无效');
            }

            const allUsers = getAllUsersState();
            
            // 获取所有在线的管理员（stu_userlevel >= 1）
            const supervisors = Object.values(allUsers).filter(user =>
                parseInt(user.stu_userlevel) >= 1 && user.online > 0
            );

            const response: ApiResponse = {
                success: true,
                message: '获取监考员列表成功',
                data: {
                    supervisors: supervisors.map(supervisor => ({
                        stu_no: supervisor.stu_no,
                        stu_name: supervisor.stu_name,
                        stu_userlevel: supervisor.stu_userlevel,
                        online: supervisor.online,
                        loginTime: supervisor.loginTime,
                        lastIP: supervisor.lastIP
                    }))
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 获取录制文件列表（供前端播放）
         */
        getRecordedFiles: [async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new ValidationError('用户session无效');
            }

            const userIP = req.ip;
            const recordedFiles: Record<string, { studentName: string; files: any[] }> = {};
            const AllUsers = getAllUsersState();
            
            // 获取有权限查看的学生列表
            const userLevel = parseInt(req.session.user.stu_userlevel);
            const queryType = userLevel >= 5 ? 'all' : 'valid';

            const stulist = databaseConfig.stulist === 'exam' ?
                await getMonitorExamStuList(
                    databaseConfig.term || '',
                    databaseConfig.cno || '',
                    databaseConfig.eno || '',
                    req.session.user.stu_no,
                    queryType
                ) :
                await getMonitorStuList(req.session.user.stu_no, queryType);

            const allowedStudents = new Set(stulist.map((user: any) => user.sno));

            // 遍历允许查看的学生，查找其录制文件
            for (const studentNo of allowedStudents) {
                const userPath = path.join(serverConfig.savePath, `u${studentNo}`);
                if (fs.existsSync(userPath)) {
                    const files: any[] = [];
                    const fileList = fs.readdirSync(userPath);
                    
                    fileList.forEach(fileName => {
                        const filePath = path.join(userPath, fileName);
                        const stats = fs.statSync(filePath);
                        
                        // 只返回.webm视频文件
                        if (fileName.endsWith('.webm')) {
                            files.push({
                                name: fileName,
                                size: formatFileSize(stats.size),
                                modificationTime: stats.mtime.toISOString(),
                                playUrl: `/api/play/${studentNo}/${encodeURIComponent(fileName)}`,
                                downloadUrl: `/api/download/${studentNo}/${encodeURIComponent(fileName)}`
                            });
                        }
                    });
                    
                    // 按修改时间降序排列
                    files.sort((a, b) => new Date(b.modificationTime).getTime() - new Date(a.modificationTime).getTime());
                    
                    if (files.length > 0) {
                        // 获取学生姓名
                        const studentInfo = stulist.find((user: any) => user.sno === studentNo);
                        recordedFiles[studentNo] = {
                            studentName: studentInfo?.name || '未知',
                            files: files
                        };
                    }
                }
            }

            await addLog(AllUsers[req.session.user.stu_no], userIP || '', 'watch_video', '查看录制文件');

            const response: ApiResponse = {
                success: true,
                message: '获取录制文件列表成功',
                data: recordedFiles,
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 获取录制状态监控（实时监控用）
         */
        getRecordingStatus: [async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new ValidationError('用户session无效');
            }

            const stulist = databaseConfig.stulist === 'exam' ?
                await getMonitorExamStuList(
                    databaseConfig.term || '',
                    databaseConfig.cno || '',
                    databaseConfig.eno || '',
                    req.session.user.stu_no,
                    databaseConfig.type
                ) :
                await getMonitorStuList(req.session.user.stu_no, databaseConfig.type);
            
            const stu_no_set = new Set(stulist.map((user: any) => user.sno));
            const threshold = 5;

            const getLatestWebmInfo = (folderPath: string): FileInfo | null => {
                try {
                    if (!fs.existsSync(folderPath)) {
                        return null;
                    }

                    const webmFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.webm'));
                    if (webmFiles.length === 0) {
                        return null;
                    }

                    const latestWebm = webmFiles.reduce((latest, current) => {
                        const latestPath = path.join(folderPath, latest);
                        const currentPath = path.join(folderPath, current);
                        return fs.statSync(currentPath).mtimeMs > fs.statSync(latestPath).mtimeMs ? current : latest;
                    });

                    const latestWebmPath = path.join(folderPath, latestWebm);
                    const stats = fs.statSync(latestWebmPath);
                    
                    return { 
                        modificationTime: stats.mtimeMs / 1000,
                        fileSize: stats.size
                    };
                } catch (error) {
                    console.error(`读取文件夹 ${folderPath} 时出错:`, error);
                    return null;
                }
            };
            
            const processFolder = (folderName: string): StudentRecordInfo | null => {
                if (folderName.startsWith('u') && folderName.slice(1).match(/^\d{7}$/)) {
                    const folderPath = path.join(serverConfig.savePath, folderName);
                    
                    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
                        return null;
                    }

                    const studentId = folderName.slice(1);
                    if (!stu_no_set.has(studentId)) {
                        return null;
                    }

                    const fileInfo = getLatestWebmInfo(folderPath);
                    if (fileInfo && fileInfo.modificationTime !== undefined) {
                        const currentTime = Date.now() / 1000;
                        const timeDiff = currentTime - fileInfo.modificationTime;
                        const isBelowThreshold = timeDiff < threshold;
                        const modificationTimeStr = new Date(fileInfo.modificationTime * 1000)
                            .toISOString().replace('T', ' ').substring(0, 19);
                        
                        return { 
                            studentId, 
                            modificationTimeStr, 
                            timeDiff, 
                            isBelowThreshold, 
                            fileSize: formatFileSize(fileInfo.fileSize) 
                        };
                    }
                }
                return null;
            };
            
            if (!fs.existsSync(serverConfig.savePath)) {
                const response: ApiResponse = {
                    success: true,
                    message: '获取录制状态成功',
                    data: [],
                    timestamp: new Date().toISOString()
                };
                res.json(response);
                return;
            }

            const data = fs.readdirSync(serverConfig.savePath)
                .map(processFolder)
                .filter(Boolean);

            const response: ApiResponse = {
                success: true,
                message: '获取录制状态成功',
                data,
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 修改用户状态（启用/禁用）
         */
        updateUserStatus: [async (req: AuthenticatedRequest, res: Response) => {
            const { id, status } = req.body;
            
            if (!id) {
                throw new ValidationError('用户ID不能为空');
            }
            
            if (status !== '0' && status !== '1') {
                throw new ValidationError('用户状态只能是0（禁用）或1（启用）');
            }

            const user = await getUserById(id);
            if (!user) {
                throw new NotFoundError('未找到该学号');
            }

            await updateById([{ stu_enable: status }, user.stu_no]);
            
            // 如果禁用用户，从在线用户中移除
            if (status === '0') {
                removeUser(user.stu_no);
                io.emit('disable', user.stu_no);
            }
            
            io.emit('state', getAllUsersState());

            const statusText = status === '1' ? '启用' : '禁用';
            const response: ApiResponse = {
                success: true,
                message: `用户${statusText}成功`,
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 发送消息/指令
         */
        emitMessage: [async (req: AuthenticatedRequest, res: Response) => {
            const { type, target, data } = req.body;
            
            if (!type) {
                throw new ValidationError('消息类型不能为空');
            }

            let message = '操作成功';
            
            switch (type) {
                case 'record':
                    io.emit('record', data);
                    message = '录制指令发送成功';
                    break;
                    
                case 'notice':
                    if (target && target !== 'all') {
                        const user = await getUserById(target);
                        if (!user) {
                            throw new NotFoundError('输入有误或未找到该学号');
                        }
                        message = `${user.stu_no} ${user.stu_name} 通知发送成功`;
                    } else {
                        message = '全体通知发送成功';
                    }
                    io.emit('notice', target, data);
                    break;
                    
                default:
                    throw new ValidationError('不支持的消息类型');
            }

            const response: ApiResponse = {
                success: true,
                message,
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 考试管理
         */
        manageExam: [async (req: AuthenticatedRequest, res: Response) => {
            if (!req.session.user) {
                throw new ValidationError('用户session无效');
            }

            const { srcId, type, op, exam_term, exam_cno, exam_no } = req.body;

            if (!srcId || !type || !op) {
                throw new ValidationError('参数不完整');
            }

            const user = await getUserById(req.session.user.stu_no);
            if (!user) {
                throw new NotFoundError('当前用户不存在');
            }

            // 使用请求中的考试信息，如果没有则使用配置文件中的
            const termToUse = exam_term || databaseConfig.term || '';
            const cnoToUse = exam_cno || databaseConfig.cno || '';
            const enoToUse = exam_no || databaseConfig.eno || '';

            await examStudentManagement(
                termToUse,
                cnoToUse,
                enoToUse,
                user.stu_no,
                srcId,
                type,
                op
            );

            await addLog(
                user, 
                req.ip || '', 
                "manage_exam", 
                `${req.session.user.stu_no}将${srcId}的${type}修改为${op}`
            );

            const response: ApiResponse = {
                success: true,
                message: '考试管理操作成功',
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 记录前端错误日志
         */
        logError: [async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { component, error, userAgent, timestamp, url } = req.body;

                // 记录错误到数据库或日志文件
                if (process.env.NODE_ENV !== 'production') {
                    // 开发环境输出详细前端错误信息
                    console.error('前端错误:', {
                        component,
                        error,
                        userAgent,
                        timestamp,
                        url,
                        user: req.session?.user?.stu_no || 'anonymous'
                    });
                } else {
                    // 生产环境只输出关键信息
                    console.error(`前端错误 [${component}]: ${error} - 用户: ${req.session?.user?.stu_no || 'anonymous'}`);
                }

                // 可以选择记录到数据库
                // await addLog("frontend_error", JSON.stringify({ component, error, userAgent, url }));

                const response: ApiResponse = {
                    success: true,
                    message: '错误日志已记录',
                    timestamp: new Date().toISOString()
                };
                res.json(response);
            } catch (error) {
                console.error('记录前端错误失败:', error);
                const response: ApiResponse = {
                    success: false,
                    message: '记录错误日志失败',
                    timestamp: new Date().toISOString()
                };
                res.status(500).json(response);
            }
        }]
    };
};