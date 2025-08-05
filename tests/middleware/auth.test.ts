// Mock dependencies first
jest.mock('../../services/database', () => ({
    getUserById: jest.fn()
}));
jest.mock('../../services/utils', () => ({
    cryptPwd: jest.fn()
}));

import { Request, Response, NextFunction } from 'express';
import { getUser, auth, opAuth, noAuth } from '../../middleware/auth';
import { getUserById } from '../../services/database';
import { cryptPwd } from '../../services/utils';

const mockGetUserById = getUserById as jest.MockedFunction<typeof getUserById>;
const mockCryptPwd = cryptPwd as jest.MockedFunction<typeof cryptPwd>;

describe('Auth Middleware', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: NextFunction;

    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            session: {},
            path: '/'
        };

        mockRes = {
            redirect: jest.fn()
        };

        mockNext = jest.fn();
    });

    describe('getUser', () => {
        it('should return user when session exists', async () => {
            const mockUser = {
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockGetUserById.mockResolvedValue(mockUser);

            const result = await getUser(mockReq);

            expect(mockGetUserById).toHaveBeenCalledWith('001');
            expect(result).toEqual(mockUser);
        });

        it('should return null when no session user', async () => {
            mockReq.session.user = undefined;

            const result = await getUser(mockReq);

            expect(mockGetUserById).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        it('should return null when getUserById returns null', async () => {
            mockReq.session.user = { stu_no: '001' };
            mockGetUserById.mockResolvedValue(null);

            const result = await getUser(mockReq);

            expect(mockGetUserById).toHaveBeenCalledWith('001');
            expect(result).toBeNull();
        });
    });

    describe('auth middleware', () => {
        it('should redirect to login when user not found', async () => {
            mockReq.session.user = undefined;

            await auth(mockReq, mockRes, mockNext);

            expect(mockRes.redirect).toHaveBeenCalledWith('/login');
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should redirect to password when password needs change', async () => {
            const mockUser = {
                stu_no: '001',
                stu_password: 'hashedPassword',
                stu_userlevel: '2',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockReq.path = '/';
            mockGetUserById.mockResolvedValue(mockUser);
            mockCryptPwd.mockReturnValue('hashedPassword');

            await auth(mockReq, mockRes, mockNext);

            expect(mockCryptPwd).toHaveBeenCalledWith('001');
            expect(mockRes.redirect).toHaveBeenCalledWith('/password');
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should not redirect to password when on password page', async () => {
            const mockUser = {
                stu_no: '001',
                stu_password: 'hashedPassword',
                stu_userlevel: '2',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockReq.path = '/password';
            mockGetUserById.mockResolvedValue(mockUser);
            mockCryptPwd.mockReturnValue('hashedPassword');

            await auth(mockReq, mockRes, mockNext);

            expect(mockRes.redirect).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalled();
        });

        it('should call next when user is authenticated and password is valid', async () => {
            const mockUser = {
                stu_no: '001',
                stu_password: 'differentPassword',
                stu_userlevel: '2',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockGetUserById.mockResolvedValue(mockUser);
            mockCryptPwd.mockReturnValue('hashedPassword');

            await auth(mockReq, mockRes, mockNext);

            expect(mockRes.redirect).not.toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('opAuth middleware', () => {
        it('should call next when user is admin', async () => {
            const mockUser = {
                stu_no: '001',
                stu_userlevel: '1',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockGetUserById.mockResolvedValue(mockUser);

            await opAuth(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.redirect).not.toHaveBeenCalled();
        });

        it('should redirect to home when user is not admin', async () => {
            const mockUser = {
                stu_no: '001',
                stu_userlevel: '2',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockGetUserById.mockResolvedValue(mockUser);

            await opAuth(mockReq, mockRes, mockNext);

            expect(mockRes.redirect).toHaveBeenCalledWith('/');
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should redirect to home when user not found', async () => {
            mockReq.session.user = undefined;

            await opAuth(mockReq, mockRes, mockNext);

            expect(mockRes.redirect).toHaveBeenCalledWith('/');
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('noAuth middleware', () => {
        it('should call next when user not authenticated', async () => {
            mockReq.session.user = undefined;

            await noAuth(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.redirect).not.toHaveBeenCalled();
        });

        it('should redirect to home when user is authenticated', async () => {
            const mockUser = {
                stu_no: '001',
                stu_userlevel: '2',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_class_sname: 'Class A',
                stu_enable: '1'
            };

            mockReq.session.user = { stu_no: '001' };
            mockGetUserById.mockResolvedValue(mockUser);

            await noAuth(mockReq, mockRes, mockNext);

            expect(mockRes.redirect).toHaveBeenCalledWith('/');
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
