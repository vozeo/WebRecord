// Mock dependencies first
jest.mock('../../middleware/auth', () => ({
    auth: (req: any, res: any, next: any) => next(),
    opAuth: (req: any, res: any, next: any) => next(),
    getUser: jest.fn()
}));
jest.mock('../../config', () => ({
    videoConfig: { width: 1920, height: 1080 },
    networkConfig: { socketPort: 7080 },
    serverConfig: { savePath: '/test/path' },
    databaseConfig: { stulist: 'normal', type: 'valid' }
}));
jest.mock('../../services/database', () => ({
    addLog: jest.fn().mockResolvedValue(undefined),
    getUserById: jest.fn().mockResolvedValue(null),
    updateById: jest.fn().mockResolvedValue(undefined),
    getMonitorStuList: jest.fn().mockResolvedValue([]),
    examStudentManagement: jest.fn().mockResolvedValue(undefined),
    getMonitorExamStuList: jest.fn().mockResolvedValue([])
}));
jest.mock('../../services/utils', () => ({
    formatFileSize: jest.fn().mockReturnValue('1.00 MB')
}));
jest.mock('../../services/userManager', () => ({
    getAllUsersState: jest.fn().mockReturnValue({}),
    removeUser: jest.fn()
}));
jest.mock('fs', () => ({
    readdirSync: jest.fn(),
    statSync: jest.fn()
}));
jest.mock('path');

import request from 'supertest';
import express from 'express';
import apiRouter from '../../routes/api';
import { getAllUsersState, removeUser } from '../../services/userManager';
import { addLog, getUserById, updateById, getMonitorStuList } from '../../services/database';
import { formatFileSize } from '../../services/utils';
import * as fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';

const mockGetAllUsersState = getAllUsersState as jest.MockedFunction<typeof getAllUsersState>;
const mockRemoveUser = removeUser as jest.MockedFunction<typeof removeUser>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockGetUserById = getUserById as jest.MockedFunction<typeof getUserById>;
const mockUpdateById = updateById as jest.MockedFunction<typeof updateById>;
const mockGetMonitorStuList = getMonitorStuList as jest.MockedFunction<typeof getMonitorStuList>;
const mockFormatFileSize = formatFileSize as jest.MockedFunction<typeof formatFileSize>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('API Router', () => {
    let app: express.Application;
    let mockIo: jest.Mocked<SocketIOServer>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        app = express();
        app.use(express.json());
        
        // Mock session middleware
        app.use((req: any, res, next) => {
            req.session = {
                user: {
                    stu_no: '001',
                    stu_name: 'Test User',
                    stu_userlevel: '1'
                }
            };
            req.ip = '127.0.0.1';
            next();
        });
        
        app.use('/', apiRouter);
        
        // Mock Socket.IO
        mockIo = {
            emit: jest.fn()
        } as any;
        
        // Set Socket.IO instance
        (apiRouter as any).setSocketIO(mockIo);
        
        // Mock getAllUsersState
        mockGetAllUsersState.mockReturnValue({
            '001': {
                stu_no: '001',
                stu_name: 'Test User',
                stu_cno: 'CS101',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                watchList: {},
                recordList: { camera: {}, screen: {} },
                online: 1,
                screenNumber: 1,
                interruptions: 0,
                accumulatedDuration: 0,
                lastStartTime: null
            },
            '002': {
                stu_no: '002',
                stu_name: 'Test User 2',
                stu_cno: 'CS102',
                stu_grade: '2024',
                stu_userlevel: '2',
                stu_class_sname: 'Class B',
                watchList: {},
                recordList: { camera: {}, screen: {} },
                online: 0,
                screenNumber: 1,
                interruptions: 0,
                accumulatedDuration: 0,
                lastStartTime: null
            }
        });

        // Mock other functions
        mockAddLog.mockResolvedValue(undefined);
        mockGetUserById.mockResolvedValue(null);
        mockUpdateById.mockResolvedValue(undefined);
        mockGetMonitorStuList.mockResolvedValue([]);
        mockFormatFileSize.mockReturnValue('1.00 MB');
    });

    describe('GET /information', () => {
        it('should return configuration information', async () => {
            const response = await request(app).get('/information');
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('videoConfig');
            expect(response.body).toHaveProperty('networkConfig');
            expect(response.body).toHaveProperty('sessionUser');
            expect(response.body.sessionUser.stu_no).toBe('001');
        });
    });

    describe('GET /file', () => {
        it('should return file history for non-admin users', async () => {
            mockFs.readdirSync.mockReturnValue(['file1.webm', 'file2.webm'] as any);
            
            const response = await request(app).get('/file');
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('002');
            expect(response.body['002']).toEqual(['file1.webm', 'file2.webm']);
            expect(mockAddLog).toHaveBeenCalled();
        });
    });

    describe('GET /stulist', () => {
        it('should return student list', async () => {
            const mockStuList = [
                { stu_no: '001', stu_name: 'Test User 1' },
                { stu_no: '002', stu_name: 'Test User 2' }
            ];
            mockGetMonitorStuList.mockResolvedValue(mockStuList);
            
            const response = await request(app).get('/stulist');
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('stulist');
            expect(response.body.stulist).toEqual(mockStuList);
        });
    });

    describe('POST /disable', () => {
        it('should disable user successfully', async () => {
            const mockUser = {
                stu_no: '002',
                stu_name: 'Test User 2',
                stu_cno: 'CS102',
                stu_grade: '2024',
                stu_userlevel: '2',
                stu_class_sname: 'Class B',
                stu_enable: '1'
            };
            mockGetUserById.mockResolvedValue(mockUser);
            
            const response = await request(app)
                .post('/disable')
                .send({ id: '002' });
            
            expect(response.status).toBe(200);
            expect(response.body.code).toBe(0);
            expect(response.body.message).toBe('Success!');
            expect(mockUpdateById).toHaveBeenCalledWith([{ stu_enable: '0' }, '002']);
            expect(mockRemoveUser).toHaveBeenCalledWith('002');
            expect(mockIo.emit).toHaveBeenCalledWith('disable', '002');
        });

        it('should return error when user not found', async () => {
            mockGetUserById.mockResolvedValue(null);
            
            const response = await request(app)
                .post('/disable')
                .send({ id: '999' });
            
            expect(response.status).toBe(200);
            expect(response.body.code).toBe(-1);
            expect(response.body.message).toBe('未找到该学号！');
        });
    });

    describe('POST /emit', () => {
        it('should handle record emit', async () => {
            const response = await request(app)
                .post('/emit')
                .send({ type: 'record', data: 'test-data' });
            
            expect(response.status).toBe(200);
            expect(response.body.code).toBe(0);
            expect(response.body.message).toBe('Success!');
            expect(mockIo.emit).toHaveBeenCalledWith('record', 'test-data');
        });

        it('should handle notice emit to all', async () => {
            const response = await request(app)
                .post('/emit')
                .send({ type: 'notice', target: 'all', data: 'test-notice' });
            
            expect(response.status).toBe(200);
            expect(response.body.code).toBe(0);
            expect(response.body.message).toBe('全体通知发送成功！');
            expect(mockIo.emit).toHaveBeenCalledWith('notice', 'all', 'test-notice');
        });

        it('should handle notice emit to specific user', async () => {
            const mockUser = {
                stu_no: '002',
                stu_name: 'Test User 2',
                stu_cno: 'CS102',
                stu_grade: '2024',
                stu_userlevel: '2',
                stu_class_sname: 'Class B',
                stu_enable: '1'
            };
            mockGetUserById.mockResolvedValue(mockUser);
            
            const response = await request(app)
                .post('/emit')
                .send({ type: 'notice', target: '002', data: 'test-notice' });
            
            expect(response.status).toBe(200);
            expect(response.body.code).toBe(0);
            expect(response.body.message).toBe('002Test User 2通知发送成功！');
            expect(mockIo.emit).toHaveBeenCalledWith('notice', '002', 'test-notice');
        });
    });

    describe('POST /manage', () => {
        it('should handle exam management', async () => {
            const mockUser = {
                stu_no: '001',
                stu_name: 'Test User',
                stu_cno: 'CS101',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };
            mockGetUserById.mockResolvedValue(mockUser);
            
            const response = await request(app)
                .post('/manage')
                .send({ srcId: '002', type: 'exam', op: 'start' });
            
            expect(response.status).toBe(200);
            expect(response.body.code).toBe(0);
            expect(response.body.message).toBe('success');
            expect(mockAddLog).toHaveBeenCalled();
        });
    });
});
