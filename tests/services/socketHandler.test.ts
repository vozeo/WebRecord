// Mock dependencies first
jest.mock('../../services/database', () => ({
    addLog: jest.fn()
}));
jest.mock('../../services/utils', () => ({
    handleInterrupt: jest.fn(),
    updateAccumulatedDuration: jest.fn()
}));
jest.mock('../../services/userManager', () => ({
    getAllUsersState: jest.fn(),
    getUserState: jest.fn(),
    updateUserState: jest.fn()
}));
jest.mock('fs', () => ({
    appendFileSync: jest.fn(),
    writeFileSync: jest.fn()
}));
jest.mock('../../config', () => ({
    serverConfig: {
        savePath: '/test/path'
    }
}));

import { setupSocketHandlers } from '../../services/socketHandler';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { addLog } from '../../services/database';
import { handleInterrupt, updateAccumulatedDuration } from '../../services/utils';
import { getAllUsersState } from '../../services/userManager';
import * as fs from 'fs';

const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockHandleInterrupt = handleInterrupt as jest.MockedFunction<typeof handleInterrupt>;
const mockUpdateAccumulatedDuration = updateAccumulatedDuration as jest.MockedFunction<typeof updateAccumulatedDuration>;
const mockGetAllUsersState = getAllUsersState as jest.MockedFunction<typeof getAllUsersState>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('SocketHandler Module', () => {
    let mockIo: jest.Mocked<SocketIOServer>;
    let mockSocket: jest.Mocked<Socket>;
    let mockUsers: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockUsers = {
            '001': {
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_userlevel: '1',
                online: 0,
                screenNumber: 1,
                recordList: { camera: {}, screen: {} },
                watchList: {},
                accumulatedDuration: 0,
                interruptions: 0,
                lastStartTime: null
            },
            '002': {
                stu_no: '002',
                stu_cno: 'CS102',
                stu_name: 'Test User 2',
                stu_userlevel: '2',
                online: 0,
                screenNumber: 1,
                recordList: { camera: {}, screen: {} },
                watchList: {},
                accumulatedDuration: 0,
                interruptions: 0,
                lastStartTime: null
            }
        };

        mockGetAllUsersState.mockReturnValue(mockUsers);

        mockSocket = {
            id: 'socket123',
            handshake: { address: '127.0.0.1' },
            on: jest.fn(),
            emit: jest.fn()
        } as any;

        mockIo = {
            on: jest.fn(),
            emit: jest.fn()
        } as any;

        // fs functions are already mocked in jest.mock
    });

    describe('setupSocketHandlers', () => {
        it('should setup connection handler', () => {
            setupSocketHandlers(mockIo);
            expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
        });

        it('should setup socket event handlers on connection', () => {
            setupSocketHandlers(mockIo);
            
            // Get the connection handler
            const connectionHandler = mockIo.on.mock.calls[0][1];
            connectionHandler(mockSocket);

            expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('watch', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('screen', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('file', expect.any(Function));
        });
    });

    describe('message event handler', () => {
        let messageHandler: Function;

        beforeEach(() => {
            setupSocketHandlers(mockIo);
            const connectionHandler = mockIo.on.mock.calls[0][1];
            connectionHandler(mockSocket);
            
            // Get the message handler
            const messageCall = mockSocket.on.mock.calls.find(call => call[0] === 'message');
            messageHandler = messageCall![1];
        });

        it('should handle online message', async () => {
            const callback = jest.fn();
            await messageHandler('001', 'online', null, callback);

            expect(mockAddLog).toHaveBeenCalledWith(
                mockUsers['001'],
                '127.0.0.1',
                'login',
                '建立 socket 连接'
            );
            expect(mockUsers['001'].online).toBe(1);
            expect(mockIo.emit).toHaveBeenCalledWith('state', mockUsers);
            expect(callback).toHaveBeenCalled();
        });

        it('should handle start recording message', async () => {
            const callback = jest.fn();
            await messageHandler('001', 'screen', ['device1', 'time1'], callback);

            expect(mockAddLog).toHaveBeenCalledWith(
                mockUsers['001'],
                '127.0.0.1',
                'start_record',
                '点击屏幕开始录制按钮'
            );
            expect(mockUsers['001'].recordList.screen['socket123']).toEqual({
                device: 'device1',
                time: 'time1'
            });
            expect(callback).toHaveBeenCalled();
        });

        it('should handle stop recording message', async () => {
            // Setup existing recording
            mockUsers['001'].recordList.screen['socket123'] = { device: 'device1', time: 'time1' };
            
            const callback = jest.fn();
            await messageHandler('001', 'screen', false, callback);

            expect(mockAddLog).toHaveBeenCalledWith(
                mockUsers['001'],
                '127.0.0.1',
                'end_record',
                '点击屏幕停止录制按钮'
            );
            expect(mockUsers['001'].recordList.screen['socket123']).toBeUndefined();
            expect(mockHandleInterrupt).toHaveBeenCalledWith(mockUsers['001']);
            expect(callback).toHaveBeenCalled();
        });

        it('should handle error when user not found', async () => {
            const callback = jest.fn();
            await messageHandler('999', 'online', null, callback);

            expect(mockAddLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    stu_no: null,
                    stu_cno: null
                }),
                '127.0.0.1',
                'error',
                expect.stringContaining('Source user with ID 999 not found')
            );
        });
    });

    describe('watch event handler', () => {
        let watchHandler: Function;

        beforeEach(() => {
            setupSocketHandlers(mockIo);
            const connectionHandler = mockIo.on.mock.calls[0][1];
            connectionHandler(mockSocket);
            
            // Get the watch handler
            const watchCall = mockSocket.on.mock.calls.find(call => call[0] === 'watch');
            watchHandler = watchCall![1];
        });

        it('should handle watch event for authorized user', async () => {
            await watchHandler('001', '002');

            expect(mockAddLog).toHaveBeenCalledWith(
                mockUsers['001'],
                '127.0.0.1',
                'monitor_open',
                '打开002Test User 2的监控界面'
            );
            expect(mockUsers['002'].watchList['001']).toEqual({
                stu_no: '001',
                stu_name: 'Test User',
                watchCount: 1
            });
            expect(mockIo.emit).toHaveBeenCalledWith('state', mockUsers);
        });

        it('should not allow unauthorized user to watch', async () => {
            // User 002 has userlevel '2', not '1'
            await watchHandler('002', '001');

            expect(mockAddLog).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                'monitor_open',
                expect.anything()
            );
            expect(mockUsers['001'].watchList['002']).toBeUndefined();
        });
    });

    describe('screen event handler', () => {
        let screenHandler: Function;

        beforeEach(() => {
            setupSocketHandlers(mockIo);
            const connectionHandler = mockIo.on.mock.calls[0][1];
            connectionHandler(mockSocket);
            
            // Get the screen handler
            const screenCall = mockSocket.on.mock.calls.find(call => call[0] === 'screen');
            screenHandler = screenCall![1];
        });

        it('should handle screen number change', async () => {
            await screenHandler('001', 2);

            expect(mockAddLog).toHaveBeenCalledWith(
                mockUsers['001'],
                '127.0.0.1',
                'screen_change',
                '屏幕数量由1变为2'
            );
            expect(mockUsers['001'].screenNumber).toBe(2);
            expect(mockIo.emit).toHaveBeenCalledWith('state', mockUsers);
        });

        it('should not log when screen number unchanged', async () => {
            await screenHandler('001', 1);

            expect(mockAddLog).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                'screen_change',
                expect.anything()
            );
            expect(mockUsers['001'].screenNumber).toBe(1);
        });
    });

    describe('file event handler', () => {
        let fileHandler: Function;

        beforeEach(() => {
            setupSocketHandlers(mockIo);
            const connectionHandler = mockIo.on.mock.calls[0][1];
            connectionHandler(mockSocket);
            
            // Get the file handler
            const fileCall = mockSocket.on.mock.calls.find(call => call[0] === 'file');
            fileHandler = fileCall![1];
        });

        it('should create new file', async () => {
            const data = Buffer.from('test data');
            await fileHandler('001', 'screen', 'device1', 'time1', data);

            expect(mockAddLog).toHaveBeenCalledWith(
                mockUsers['001'],
                '127.0.0.1',
                'create_file',
                '创建录制文件：u001-screen-time1-device1.webm'
            );
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                '/test/path/u001/u001-screen-time1-device1.webm',
                data
            );
            expect(mockUsers['001'].lastStartTime).toBeDefined();
        });

        it('should append to existing file', async () => {
            // Simulate existing file
            const data = Buffer.from('test data');
            
            // First call to create file
            await fileHandler('001', 'screen', 'device1', 'time1', data);
            
            // Second call should append
            await fileHandler('001', 'screen', 'device1', 'time1', data);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/test/path/u001/u001-screen-time1-device1.webm',
                data
            );
            expect(mockUpdateAccumulatedDuration).toHaveBeenCalledWith(mockUsers['001']);
        });
    });
});
