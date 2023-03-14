const mysql = require('mysql')
const util = require('util');
const {databaseConfig} = require('./config_example')
const pool = mysql.createPool(databaseConfig);

const database = async (sql, sqlParams = []) => {
    try {
        const getConnection = util.promisify(pool.getConnection).bind(pool);
        const connection = await getConnection();
        const query = util.promisify(connection.query).bind(connection);
        const results = await query(sql, sqlParams);
        connection.release();
        return results;
    } catch (err) {
        console.error(err);
    }
};

const addLog = async (user, ipaddr, content) => {
    if (user) {
        const sql = "call addLog(?, ?, ?, ?)";
        await database(sql, [user.stu_cno, user.stu_no, ipaddr, content]);
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

module.exports = {addLog, getAllUsers, getUserById, updateById}