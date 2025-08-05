import {
    getTime,
    isSimplePwd,
    cryptPwd,
    handleInterrupt,
    updateAccumulatedDuration,
    formatFileSize,
    User
} from '../../services/utils';

describe('Utils Module', () => {
    describe('getTime', () => {
        it('should return formatted time string for current date', () => {
            const result = getTime();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
        });

        it('should return formatted time string for specific date', () => {
            const testDate = new Date('2024-01-15T10:30:45');
            const result = getTime(testDate);
            expect(result).toBe('2024-01-15-10-30-45');
        });
    });

    describe('isSimplePwd', () => {
        it('should return true for passwords shorter than 8 characters', () => {
            expect(isSimplePwd('123')).toBe(true);
            expect(isSimplePwd('abc123')).toBe(true);
        });

        it('should return true for simple passwords', () => {
            expect(isSimplePwd('12345678')).toBe(true); // only numbers
            expect(isSimplePwd('abcdefgh')).toBe(true); // only lowercase
            expect(isSimplePwd('ABCDEFGH')).toBe(true); // only uppercase
        });

        it('should return false for complex passwords', () => {
            expect(isSimplePwd('Abc123!@')).toBe(false); // has all 4 types
            expect(isSimplePwd('Abc12345')).toBe(false); // has 3 types
            expect(isSimplePwd('abc123!@')).toBe(false); // has 3 types
        });
    });

    describe('cryptPwd', () => {
        it('should return MD5 hash of password', () => {
            const password = 'testpassword';
            const result = cryptPwd(password);
            expect(result).toBe('e16b2ab8d12314bf4efbd6203906ea6c'); // MD5 of 'testpassword'
            expect(result).toHaveLength(32);
        });

        it('should return different hashes for different passwords', () => {
            const pwd1 = cryptPwd('password1');
            const pwd2 = cryptPwd('password2');
            expect(pwd1).not.toBe(pwd2);
        });
    });

    describe('handleInterrupt', () => {
        it('should handle user interrupt correctly', () => {
            const user: User = {
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                lastStartTime: Date.now() - 5000, // 5 seconds ago
                accumulatedDuration: 10000,
                interruptions: 2
            };

            handleInterrupt(user);

            expect(user.lastStartTime).toBeNull();
            expect(user.interruptions).toBe(3);
            expect(user.accumulatedDuration).toBeGreaterThan(10000);
        });

        it('should not change user if lastStartTime is null', () => {
            const user: User = {
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                lastStartTime: null,
                accumulatedDuration: 10000,
                interruptions: 2
            };

            const originalUser = { ...user };
            handleInterrupt(user);

            expect(user).toEqual(originalUser);
        });
    });

    describe('updateAccumulatedDuration', () => {
        it('should update accumulated duration and reset start time', () => {
            const startTime = Date.now() - 3000; // 3 seconds ago
            const user: User = {
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                lastStartTime: startTime,
                accumulatedDuration: 5000,
                interruptions: 0
            };

            updateAccumulatedDuration(user);

            expect(user.accumulatedDuration).toBeGreaterThan(5000);
            expect(user.lastStartTime).toBeGreaterThan(startTime);
        });

        it('should not change user if lastStartTime is null', () => {
            const user: User = {
                stu_no: '001',
                stu_cno: 'CS101',
                stu_name: 'Test User',
                stu_grade: '2024',
                stu_userlevel: '1',
                stu_class_sname: 'Class A',
                lastStartTime: null,
                accumulatedDuration: 5000,
                interruptions: 0
            };

            const originalUser = { ...user };
            updateAccumulatedDuration(user);

            expect(user).toEqual(originalUser);
        });
    });

    describe('formatFileSize', () => {
        it('should format bytes correctly', () => {
            expect(formatFileSize(500)).toBe('500 B');
            expect(formatFileSize(1023)).toBe('1023 B');
        });

        it('should format kilobytes correctly', () => {
            expect(formatFileSize(1024)).toBe('1.00 KB');
            expect(formatFileSize(1536)).toBe('1.50 KB');
        });

        it('should format megabytes correctly', () => {
            expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
            expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.50 MB');
        });

        it('should format gigabytes correctly', () => {
            expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
            expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
        });
    });
});
