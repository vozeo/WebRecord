import * as mysql from 'mysql2/promise';
import { User, DatabaseUser } from './utils';
import { databaseConfig, mysqlConnectionConfig, DatabaseConfig, MysqlConnectionConfig } from '../../config';

const pool = mysql.createPool(mysqlConnectionConfig as MysqlConnectionConfig);

/**
 * 数据库查询函数
 * @param sql - SQL查询语句
 * @param sqlParams - SQL参数
 * @returns 查询结果
 */
export const database = async (sql: string, sqlParams: any[] = []): Promise<any> => {
    let connection: mysql.PoolConnection | undefined;
    try {
        connection = await pool.getConnection();
        const [results] = await connection.execute(sql, sqlParams);
        return results;
    } catch (err) {
        console.error(err);
        throw err;
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * 添加日志记录
 * @param user - 用户对象
 * @param ipaddr - IP地址
 * @param type - 日志类型
 * @param content - 日志内容
 * @param second - 秒数，默认为0
 */
export const addLog = async (
    user: User | DatabaseUser | null,
    ipaddr: string,
    type: string,
    content: string,
    second: number = 0
): Promise<void> => {
    if (user) {
        let cleanIpaddr = ipaddr;
        if (ipaddr.startsWith('::ffff:')) {
            cleanIpaddr = ipaddr.slice(7);
        }
        const sql = "CALL proc_write_log(?, ?, ?, ?, ?, ?)";
        await database(sql, [user.stu_cno, user.stu_no, cleanIpaddr, type, content, second]);
    }
};

/**
 * 获取所有启用的用户
 * @returns 用户数组
 */
export const getAllUsers = async (): Promise<DatabaseUser[]> => {
    const sql = "SELECT * FROM student WHERE stu_enable = '1'";
    const allUsersArray = await database(sql);
    return Object.values(allUsersArray) as DatabaseUser[];
};

/**
 * 根据ID获取用户
 * @param id - 用户ID
 * @returns 用户对象或null
 */
export const getUserById = async (id: string): Promise<DatabaseUser | null> => {
    const sql = "SELECT * FROM student WHERE stu_no = ? AND stu_enable = '1'";
    const user = await database(sql, [id]);
    return user.length > 0 ? Object.values(user)[0] as DatabaseUser : null;
};

/**
 * 根据ID更新用户信息
 * @param arr - 更新参数数组 [updateObject, stu_no]
 */
export const updateById = async (arr: any[]): Promise<void> => {
    const [updateObject, stuNo] = arr;
    const fields = Object.keys(updateObject);
    const values = Object.values(updateObject);

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const sql = `UPDATE student SET ${setClause} WHERE stu_no = ?`;

    await database(sql, [...values, stuNo]);
};

/**
 * 获取监考员学生列表
 * @param monitorId - 监考员ID
 * @param status - 状态
 * @returns 学生列表
 */
export const getMonitorStuList = async (monitorId: string, status: string): Promise<any[]> => {
    const sql = "CALL proc_get_monitor_stulist(?, ?)";
    const results = await database(sql, [monitorId, status]);
    return results && results.length > 0 ? Object.values(results[0]) : [];
};

/**
 * 考试学生管理
 * @param term - 学期
 * @param cno - 课程号
 * @param eno - 考试号
 * @param mno - 监考员号
 * @param sno - 学生号
 * @param type - 类型
 * @param op - 操作
 * @param is_end - 是否结束
 */
export const examStudentManagement = async (
    term: string, 
    cno: string, 
    eno: string, 
    mno: string, 
    sno: string, 
    type: string, 
    op: string, 
    is_end?: string
): Promise<void> => {
    const sql = "CALL proc_exam_student_management(?, ?, ?, ?, ?, ?, ?, ?)";
    await database(sql, [term, cno, eno, mno, sno, type, op, is_end]);
};

/**
 * 获取监考员考试学生列表
 * @param term - 学期
 * @param cno - 课程号
 * @param eno - 考试号
 * @param mno - 监考员号
 * @param type - 类型
 * @returns 学生列表
 */
export const getMonitorExamStuList = async (
    term: string,
    cno: string,
    eno: string,
    mno: string,
    type: string
): Promise<any[]> => {
    const sql = "CALL proc_get_monitor_exam_stulist(?, ?, ?, ?, ?)";
    const results = await database(sql, [term, cno, eno, mno, type]);
    const students = results[0];  // Stored procedures usually return multiple result sets. The actual data is usually in the first result set.

    // 为每个学生添加考试信息
    if (Array.isArray(students)) {
        return students.map(student => ({
            ...student,
            exam_term: term,
            exam_cno: cno,
            exam_no: eno
        }));
    }

    return students;
};
