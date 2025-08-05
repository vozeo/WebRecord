// Mock dependencies first
jest.mock('../../middleware/auth', () => ({
    auth: (req: any, res: any, next: any) => next(),
    opAuth: (req: any, res: any, next: any) => next()
}));
jest.mock('../../config', () => ({
    serverConfig: {
        savePath: '/test/path'
    }
}));
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    statSync: jest.fn(),
    createReadStream: jest.fn(() => ({
        pipe: jest.fn((res) => {
            res.end();
            return res;
        })
    }))
}));

import request from 'supertest';
import express from 'express';
import filesRouter from '../../routes/files';
import * as fs from 'fs';
import { Readable } from 'stream';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Files Router', () => {
    let app: express.Application;

    beforeEach(() => {
        jest.clearAllMocks();

        app = express();

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

        app.use('/', filesRouter);

        // Add timeout to prevent hanging
        app.use((req, res, next) => {
            res.setTimeout(1000, () => {
                res.status(408).send('Request timeout');
            });
            next();
        });
    });

    describe('GET /video/:name', () => {
        it('should return 404 when file does not exist', async () => {
            mockFs.existsSync.mockReturnValue(false);

            const response = await request(app).get('/video/u001-screen-test.webm');

            expect(response.status).toBe(404);
            expect(response.text).toBe('File does not exist!');
        });

        it('should handle invalid range request', async () => {
            const mockStats = {
                size: 1024000
            };

            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue(mockStats as any);

            const response = await request(app)
                .get('/video/u001-screen-test.webm')
                .set('Range', 'bytes=2000000-');

            expect(response.status).toBe(416);
            expect(response.text).toContain('Requested range not satisfiable');
        });

        it('should check file existence and stats', async () => {
            const mockStats = {
                size: 1024000
            };

            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue(mockStats as any);

            // Don't wait for response to complete, just check that mocks were called
            request(app).get('/video/u001-screen-test.webm').end(() => {});

            // Give it a moment to process
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockFs.existsSync).toHaveBeenCalledWith('/test/path/u001/u001-screen-test.webm');
            expect(mockFs.statSync).toHaveBeenCalledWith('/test/path/u001/u001-screen-test.webm');
        });

        it('should parse file name correctly', async () => {
            const mockStats = {
                size: 1024000
            };

            mockFs.existsSync.mockReturnValue(true);
            mockFs.statSync.mockReturnValue(mockStats as any);

            // Don't wait for response to complete, just check that mocks were called
            request(app).get('/video/u002-camera-device1-time1.webm').end(() => {});

            // Give it a moment to process
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockFs.existsSync).toHaveBeenCalledWith('/test/path/u002/u002-camera-device1-time1.webm');
        });
    });
});
