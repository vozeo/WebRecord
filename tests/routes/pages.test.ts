// Mock dependencies first
jest.mock('../../middleware/auth', () => ({
    auth: jest.fn((req: any, res: any, next: any) => next()),
    opAuth: jest.fn((req: any, res: any, next: any) => next()),
    noAuth: jest.fn((req: any, res: any, next: any) => next())
}));
jest.mock('../../services/database', () => ({
    getMonitorStuList: jest.fn(),
    getMonitorExamStuList: jest.fn()
}));
jest.mock('../../services/userManager', () => ({
    getAllUsersState: jest.fn()
}));
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue(['1.jpg', '2.jpg', '3.jpg'])
}));
jest.mock('../../config', () => ({
    databaseConfig: {
        stulist: 'normal',
        type: 'valid'
    }
}));

import request from 'supertest';
import express from 'express';
import pagesRouter from '../../routes/pages';
import { getMonitorStuList, getMonitorExamStuList } from '../../services/database';
import { getAllUsersState } from '../../services/userManager';
import * as fs from 'fs';

const mockGetMonitorStuList = getMonitorStuList as jest.MockedFunction<typeof getMonitorStuList>;
const mockGetMonitorExamStuList = getMonitorExamStuList as jest.MockedFunction<typeof getMonitorExamStuList>;
const mockGetAllUsersState = getAllUsersState as jest.MockedFunction<typeof getAllUsersState>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Pages Router', () => {
    let app: express.Application;

    beforeEach(() => {
        jest.clearAllMocks();
        
        app = express();
        app.set('view engine', 'html');
        app.engine('html', (filePath: string, options: any, callback: any) => {
            callback(null, `<html><body>Mock render: ${JSON.stringify(options)}</body></html>`);
        });
        
        // Mock session middleware
        app.use((req: any, res, next) => {
            req.session = {
                user: {
                    stu_no: '001',
                    stu_name: 'Test User',
                    stu_userlevel: '1'
                }
            };
            next();
        });
        
        app.use('/', pagesRouter);
        
        // fs.readdirSync is already mocked in jest.mock
        
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
            }
        });
    });

    describe('GET /', () => {
        it('should render index page', async () => {
            const response = await request(app).get('/');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
            expect(response.text).toContain('Test User');
        });
    });

    describe('GET /record', () => {
        it('should render record page', async () => {
            const response = await request(app).get('/record');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
        });
    });

    describe('GET /login', () => {
        it('should render login page with random image', async () => {
            const response = await request(app).get('/login');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
            expect(response.text).toContain('images');
        });
    });

    describe('GET /password', () => {
        it('should render password page', async () => {
            const response = await request(app).get('/password');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
            expect(response.text).toContain('Test User');
        });
    });

    describe('GET /history', () => {
        it('should render history page with users', async () => {
            const response = await request(app).get('/history');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
            expect(mockGetAllUsersState).toHaveBeenCalled();
        });
    });

    describe('GET /monitor', () => {
        it('should render monitor page with student list', async () => {
            const mockStuList = [
                { stu_no: '001', stu_name: 'Test User 1' },
                { stu_no: '002', stu_name: 'Test User 2' }
            ];
            mockGetMonitorStuList.mockResolvedValue(mockStuList);
            
            const response = await request(app).get('/monitor');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
            expect(mockGetMonitorStuList).toHaveBeenCalledWith('001', 'valid');
        });
    });

    describe('GET /live', () => {
        it('should render video page for existing user', async () => {
            const response = await request(app)
                .get('/live')
                .query({ id: '001', type: 'screen' });
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
            expect(response.text).toContain('Test User');
            expect(response.text).toContain('屏幕');
        });

        it('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .get('/live')
                .query({ id: '999', type: 'screen' });
            
            expect(response.status).toBe(404);
            expect(response.text).toContain('User not found');
        });

        it('should render camera type correctly', async () => {
            const response = await request(app)
                .get('/live')
                .query({ id: '001', type: 'camera' });
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('摄像头');
        });
    });

    describe('GET /monitor_file', () => {
        it('should render monitor file page', async () => {
            const response = await request(app).get('/monitor_file');
            
            expect(response.status).toBe(200);
            expect(response.text).toContain('Mock render');
        });
    });
});
