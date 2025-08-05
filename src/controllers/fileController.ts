/**
 * 文件控制器
 * 处理文件相关的操作
 */

import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AuthenticatedRequest, ApiResponse, ValidationError, NotFoundError } from '../types';
import { serverConfig } from '../../config';

/**
 * 创建文件控制器
 */
export const createFileController = () => {
    return {
        /**
         * 下载文件
         */
        downloadFile: [async (req: AuthenticatedRequest, res: Response) => {
            const { studentId, filename } = req.params;
            
            if (!studentId || !filename) {
                throw new ValidationError('学生ID和文件名不能为空');
            }

            // 验证学生ID格式
            if (!studentId.match(/^\d{7}$/)) {
                throw new ValidationError('无效的学生ID格式');
            }

            // 构建文件路径
            const filePath = path.join(serverConfig.savePath, `u${studentId}`, filename);
            
            // 安全检查：确保文件路径在允许的目录内
            const normalizedPath = path.normalize(filePath);
            const basePath = path.normalize(serverConfig.savePath);
            if (!normalizedPath.startsWith(basePath)) {
                throw new ValidationError('非法的文件路径');
            }

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new NotFoundError('文件不存在');
            }

            // 检查是否是文件（而不是目录）
            const stats = fs.statSync(filePath);
            if (!stats.isFile()) {
                throw new ValidationError('请求的不是一个文件');
            }

            // 设置响应头
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', stats.size);

            // 创建读取流并发送文件
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);

            readStream.on('error', (error) => {
                console.error('文件读取错误:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: '文件读取失败',
                        timestamp: new Date().toISOString()
                    });
                }
            });
        }],

        /**
         * 删除文件
         */
        deleteFile: [async (req: AuthenticatedRequest, res: Response) => {
            const { studentId, filename } = req.params;
            
            if (!studentId || !filename) {
                throw new ValidationError('学生ID和文件名不能为空');
            }

            // 验证学生ID格式
            if (!studentId.match(/^\d{7}$/)) {
                throw new ValidationError('无效的学生ID格式');
            }

            // 构建文件路径
            const filePath = path.join(serverConfig.savePath, `u${studentId}`, filename);
            
            // 安全检查：确保文件路径在允许的目录内
            const normalizedPath = path.normalize(filePath);
            const basePath = path.normalize(serverConfig.savePath);
            if (!normalizedPath.startsWith(basePath)) {
                throw new ValidationError('非法的文件路径');
            }

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new NotFoundError('文件不存在');
            }

            // 删除文件
            try {
                fs.unlinkSync(filePath);
                
                const response: ApiResponse = {
                    success: true,
                    message: '文件删除成功',
                    timestamp: new Date().toISOString()
                };
                res.json(response);
            } catch (error) {
                console.error('文件删除失败:', error);
                throw new Error('文件删除失败');
            }
        }],

        /**
         * 处理视频文件HEAD请求（用于视频播放器预加载）
         */
        playVideoHead: [async (req: AuthenticatedRequest, res: Response) => {
            const { studentId, filename } = req.params;
            
            if (!studentId || !filename) {
                throw new ValidationError('学生ID和文件名不能为空');
            }

            // 验证学生ID格式
            if (!studentId.match(/^\d{7}$/)) {
                throw new ValidationError('无效的学生ID格式');
            }

            // 只允许播放.webm文件
            if (!filename.toLowerCase().endsWith('.webm')) {
                throw new ValidationError('只支持播放WebM格式的视频文件');
            }

            // 构建文件路径
            const filePath = path.join(serverConfig.savePath, `u${studentId}`, filename);
            
            // 安全检查：确保文件路径在允许的目录内
            const normalizedPath = path.normalize(filePath);
            const basePath = path.normalize(serverConfig.savePath);
            if (!normalizedPath.startsWith(basePath)) {
                throw new ValidationError('非法的文件路径');
            }

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new NotFoundError('视频文件不存在');
            }

            // 检查是否是文件（而不是目录）
            const stats = fs.statSync(filePath);
            if (!stats.isFile()) {
                throw new ValidationError('请求的不是一个文件');
            }

            // 设置响应头（HEAD请求只返回头部信息）
            const fileSize = stats.size;
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range');
            
            // HEAD请求只返回状态码和头部，不返回内容
            res.status(200).end();
            
            console.log(`📋 视频文件HEAD请求: ${filename}, Size: ${fileSize} bytes`);
        }],

        /**
         * 获取文件信息
         */
        getFileInfo: [async (req: AuthenticatedRequest, res: Response) => {
            const { studentId, filename } = req.params;
            
            if (!studentId || !filename) {
                throw new ValidationError('学生ID和文件名不能为空');
            }

            // 验证学生ID格式
            if (!studentId.match(/^\d{7}$/)) {
                throw new ValidationError('无效的学生ID格式');
            }

            // 构建文件路径
            const filePath = path.join(serverConfig.savePath, `u${studentId}`, filename);
            
            // 安全检查：确保文件路径在允许的目录内
            const normalizedPath = path.normalize(filePath);
            const basePath = path.normalize(serverConfig.savePath);
            if (!normalizedPath.startsWith(basePath)) {
                throw new ValidationError('非法的文件路径');
            }

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new NotFoundError('文件不存在');
            }

            // 获取文件信息
            const stats = fs.statSync(filePath);
            
            const response: ApiResponse = {
                success: true,
                message: '获取文件信息成功',
                data: {
                    filename,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isFile: stats.isFile(),
                    isDirectory: stats.isDirectory()
                },
                timestamp: new Date().toISOString()
            };
            res.json(response);
        }],

        /**
         * 列出目录中的文件
         */
        listFiles: [async (req: AuthenticatedRequest, res: Response) => {
            const { studentId } = req.params;
            
            if (!studentId) {
                throw new ValidationError('学生ID不能为空');
            }

            // 验证学生ID格式
            if (!studentId.match(/^\d{7}$/)) {
                throw new ValidationError('无效的学生ID格式');
            }

            // 构建目录路径
            const dirPath = path.join(serverConfig.savePath, `u${studentId}`);
            
            // 检查目录是否存在
            if (!fs.existsSync(dirPath)) {
                const response: ApiResponse = {
                    success: true,
                    message: '目录不存在，返回空列表',
                    data: [],
                    timestamp: new Date().toISOString()
                };
                res.json(response);
                return;
            }

            // 读取目录内容
            try {
                const files = fs.readdirSync(dirPath).map(filename => {
                    const filePath = path.join(dirPath, filename);
                    const stats = fs.statSync(filePath);
                    
                    return {
                        filename,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime,
                        isFile: stats.isFile(),
                        isDirectory: stats.isDirectory()
                    };
                });

                const response: ApiResponse = {
                    success: true,
                    message: '获取文件列表成功',
                    data: files,
                    timestamp: new Date().toISOString()
                };
                res.json(response);
            } catch (error) {
                console.error('读取目录失败:', error);
                throw new Error('读取目录失败');
            }
        }],

        /**
         * 播放视频文件（流式传输）
         */
        playVideo: [async (req: AuthenticatedRequest, res: Response) => {
            const { studentId, filename } = req.params;
            
            if (!studentId || !filename) {
                throw new ValidationError('学生ID和文件名不能为空');
            }

            // 验证学生ID格式
            if (!studentId.match(/^\d{7}$/)) {
                throw new ValidationError('无效的学生ID格式');
            }

            // 只允许播放.webm文件
            if (!filename.toLowerCase().endsWith('.webm')) {
                throw new ValidationError('只支持播放WebM格式的视频文件');
            }

            // 构建文件路径
            const filePath = path.join(serverConfig.savePath, `u${studentId}`, filename);
            
            // 安全检查：确保文件路径在允许的目录内
            const normalizedPath = path.normalize(filePath);
            const basePath = path.normalize(serverConfig.savePath);
            if (!normalizedPath.startsWith(basePath)) {
                throw new ValidationError('非法的文件路径');
            }

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                throw new NotFoundError('视频文件不存在');
            }

            // 检查是否是文件（而不是目录）
            const stats = fs.statSync(filePath);
            if (!stats.isFile()) {
                throw new ValidationError('请求的不是一个文件');
            }

            // 处理HTTP Range请求（支持视频进度拖动）
            const range = req.headers.range;
            const fileSize = stats.size;

            // 设置通用响应头（针对WebRecorder文件优化）
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            // 添加CORS头（如果需要跨域访问）
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range');

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                
                // 验证Range请求的有效性
                if (start >= fileSize || end >= fileSize || start < 0 || end < start) {
                    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
                    res.end();
                    return;
                }
                
                const chunksize = (end - start) + 1;

                // 设置部分内容响应头
                res.status(206);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
                res.setHeader('Content-Length', chunksize);

                console.log(`📹 发送视频片段: ${filename}, Range: ${start}-${end}/${fileSize}`);

                // 创建读取流并发送文件片段
                const readStream = fs.createReadStream(filePath, { start, end });
                readStream.pipe(res);

                readStream.on('error', (error) => {
                    console.error('视频文件读取错误:', error);
                    if (!res.headersSent) {
                        res.status(500).json({
                            success: false,
                            message: '视频文件读取失败',
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            } else {
                // 不支持Range请求，返回完整文件
                res.status(200);
                res.setHeader('Content-Length', fileSize);
                
                console.log(`📹 发送完整视频文件: ${filename}, Size: ${fileSize} bytes`);

                // 创建读取流并发送文件
                const readStream = fs.createReadStream(filePath);
                readStream.pipe(res);

                readStream.on('error', (error) => {
                    console.error('视频文件读取错误:', error);
                    if (!res.headersSent) {
                        res.status(500).json({
                            success: false,
                            message: '视频文件读取失败',
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            }
        }]
    };
};