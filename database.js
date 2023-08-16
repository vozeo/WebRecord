const mysql = require('mysql')
const util = require('util');
const databaseConfig = {
    ...require('./config').databaseConfig,
    charset: 'utf8'
};
const pool = mysql.createPool(databaseConfig);

const database = async (sql, sqlParams = []) => {
    let connection;
    try {
        const getConnection = util.promisify(pool.getConnection).bind(pool);
        connection = await getConnection();
        const query = util.promisify(connection.query).bind(connection);
        const results = await query(sql, sqlParams);
        return results;
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const addLog = async (user, ipaddr, type, content, second = 0) => {
    if (user) {
        if (ipaddr.startsWith('::ffff:')) {
            ipaddr = ipaddr.slice(7);
          }
        const sql = "CALL proc_write_log(?, ?, ?, ?, ?, ?)";
        await database(sql, [user.stu_cno, user.stu_no, ipaddr, type, content, second]);
    }
};

const getAllUsers = async () => {
    const sql = "SELECT * FROM student WHERE stu_enable = '1'";
    const allUsersArray = await database(sql);
    return Object.values(allUsersArray);
};

const getUserById = async (id) => {
    const sql = "SELECT * FROM student WHERE stu_no = ? AND stu_enable = '1'";
    const user = await database(sql, [id]);
    return user.length > 0 ? Object.values(user)[0] : null;
};

const updateById = async (arr) => {
    const sql = 'UPDATE student SET ? WHERE stu_no = ?';
    await database(sql, arr);
};

const getMonitorStuList = async (monitorId, status) => {
    const sql = "CALL proc_get_monitor_stulist(?, ?)";
    const results = await database(sql, [monitorId, status]);
    return results && results.length > 0 ? Object.values(results[0]) : [];
};

// call proc_exam_student_management ("2022/2023/2", "100084", "04", "1111", "2307101", "exam", "disable");
// call proc_exam_student_management ("2022/2023/2", "100084", "04", "1111", "2307101", "newip", "enable");
const examStudentManagement = async (term, cno, eno, mno, sno, type, op) => {
    const sql = "CALL proc_exam_student_management(?, ?, ?, ?, ?, ?, ?)";
    await database(sql, [term, cno, eno, mno, sno, type, op]);
};

// call proc_get_monitor_exam_stulist("2022/2023/2", "100084", "04", "1111", "valid");
const getMonitorExamStuList = async (term, cno, eno, mno, type) => {
    const sql = "CALL proc_get_monitor_exam_stulist(?, ?, ?, ?, ?)";
    const results = await database(sql, [term, cno, eno, mno, type]);
    return results[0];  // Stored procedures usually return multiple result sets. The actual data is usually in the first result set.
};

module.exports = { 
    addLog, 
    getAllUsers, 
    getUserById, 
    updateById,
    getMonitorStuList,
    examStudentManagement,
    getMonitorExamStuList
}