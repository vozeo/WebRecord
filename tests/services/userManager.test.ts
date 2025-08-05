// Mock dependencies first, before any imports
jest.mock('../../services/database', () => ({
    getAllUsers: jest.fn()
}));
jest.mock('fs');
jest.mock('../../config', () => ({
    serverConfig: {
        savePath: '/test/path'
    },
    databaseConfig: {
        endtime: null
    }
}));

import {
    initializeUsers,
    getAllUsersState,
    getUserState,
    updateUserState,
    removeUser,
    setupTimeChecker,
    UserState
} from '../../services/userManager';
import * as fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { getAllUsers } from '../../services/database';

const mockGetAllUsers = getAllUsers as jest.MockedFunction<typeof getAllUsers>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('UserManager Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the AllUsers state by re-importing the module
        jest.resetModules();
    });

    describe('initializeUsers', () => {
        it('should initialize users correctly', async () => {
            const mockUsers = [
                {
                    stu_no: '001',
                    stu_cno: 'CS101',
                    stu_name: 'Test User 1',
                    stu_grade: '2024',
                    stu_userlevel: '1',
                    stu_class_sname: 'Class A',
                    stu_enable: '1'
                },
                {
                    stu_no: '002',
                    stu_cno: 'CS102',
                    stu_name: 'Test User 2',
                    stu_grade: '2024',
                    stu_userlevel: '1',
                    stu_class_sname: 'Class B',
                    stu_enable: '1'
                }
            ];

            mockGetAllUsers.mockResolvedValue(mockUsers);
            mockFs.mkdirSync.mockImplementation(() => undefined);

            await initializeUsers();

            expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
            expect(mockFs.mkdirSync).toHaveBeenCalledTimes(2);
            expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/path/u001/', { recursive: true });
            expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/path/u002/', { recursive: true });

            const allUsers = getAllUsersState();
            expect(Object.keys(allUsers)).toHaveLength(2);
            expect(allUsers['001']).toBeDefined();
            expect(allUsers['002']).toBeDefined();
        });

        it('should handle initialization errors', async () => {
            const error = new Error('Database connection failed');
            mockGetAllUsers.mockRejectedValue(error);

            await expect(initializeUsers()).rejects.toThrow('Database connection failed');
        });
    });

    describe('getUserState', () => {
        beforeEach(async () => {
            const mockUsers = [{
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            }];

            mockGetAllUsers.mockResolvedValue(mockUsers);
            mockFs.mkdirSync.mockImplementation(() => undefined);
            await initializeUsers();
        });

        it('should return user state when user exists', () => {
            const user = getUserState('001');
            expect(user).toBeDefined();
            expect(user?.stu_no).toBe('001');
            expect(user?.stu_name).toBe('Test User');
        });

        it('should return null when user does not exist', () => {
            const user = getUserState('999');
            expect(user).toBeNull();
        });
    });

    describe('updateUserState', () => {
        beforeEach(async () => {
            const mockUsers = [{
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            }];

            mockGetAllUsers.mockResolvedValue(mockUsers);
            mockFs.mkdirSync.mockImplementation(() => undefined);
            await initializeUsers();
        });

        it('should update user state correctly', () => {
            updateUserState('001', { online: 1, interruptions: 5 });
            
            const user = getUserState('001');
            expect(user?.online).toBe(1);
            expect(user?.interruptions).toBe(5);
        });

        it('should not throw error when updating non-existent user', () => {
            expect(() => {
                updateUserState('999', { online: 1 });
            }).not.toThrow();
        });
    });

    describe('removeUser', () => {
        beforeEach(async () => {
            const mockUsers = [{
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            }];

            mockGetAllUsers.mockResolvedValue(mockUsers);
            mockFs.mkdirSync.mockImplementation(() => undefined);
            await initializeUsers();
        });

        it('should remove user correctly', () => {
            expect(getUserState('001')).toBeDefined();
            
            removeUser('001');
            
            expect(getUserState('001')).toBeNull();
        });
    });

    describe('setupTimeChecker', () => {
        let mockIo: jest.Mocked<SocketIOServer>;

        beforeEach(() => {
            mockIo = {
                emit: jest.fn()
            } as any;
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should return null when endtime is not configured', () => {
            const result = setupTimeChecker(mockIo);
            expect(result).toBeNull();
        });

        it('should setup time checker when endtime is configured', () => {
            // Mock databaseConfig with endtime
            jest.doMock('../../config', () => ({
                serverConfig: { savePath: '/test/path' },
                databaseConfig: { endtime: new Date(Date.now() + 5000).toISOString() }
            }));

            const { setupTimeChecker: setupTimeCheckerWithEndtime } = require('../../services/userManager');
            const result = setupTimeCheckerWithEndtime(mockIo);
            
            expect(result).toBeDefined();
            expect(typeof result).toBe('object'); // NodeJS.Timeout
        });
    });
});
