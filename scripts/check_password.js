/**
 * 检查用户密码
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { mysqlConnectionConfig } = require('./dist/config');

function cryptPwd(password) {
    return crypto.createHash('md5').update(password).digest('hex');
}

async function checkPassword() {
    console.log('🔍 检查用户密码...');

    let connection;
    try {
        connection = await mysql.createConnection(mysqlConnectionConfig);
        
        // 查询用户1111的密码
        const [users] = await connection.execute('SELECT stu_no, stu_name, stu_password FROM student WHERE stu_no = ?', ['2307101']);
        
        if (users.length === 0) {
            console.log('❌ 用户1111不存在');
            return;
        }
        
        const user = users[0];
        console.log('用户信息:', {
            stu_no: user.stu_no,
            stu_name: user.stu_name,
            stu_password: user.stu_password
        });
        
        // 如果密码是学号，更新为123456
        if (user.stu_password === cryptPwd(user.stu_no)) {
            console.log('\n🔄 密码是学号，更新为123456...');
            const newPassword = cryptPwd('123456');
            await connection.execute('UPDATE student SET stu_password = ? WHERE stu_no = ?', [newPassword, user.stu_no]);
            console.log('✅ 密码已更新为123456');
        }
        
    } catch (error) {
        console.error('❌ 检查密码失败:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

checkPassword().catch(console.error);
