/**
 * 重置管理员密码
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { mysqlConnectionConfig } = require('./dist/config');

function cryptPwd(password) {
    return crypto.createHash('md5').update(password).digest('hex');
}

async function resetAdminPassword() {
    console.log('🔄 重置管理员密码...');

    let connection;
    try {
        connection = await mysql.createConnection(mysqlConnectionConfig);
        
        // 查询所有管理员
        const [admins] = await connection.execute('SELECT stu_no, stu_name, stu_userlevel FROM student WHERE stu_userlevel >= 1');
        
        console.log('管理员列表:');
        admins.forEach(admin => {
            console.log(`- ${admin.stu_no} | ${admin.stu_name} | 级别:${admin.stu_userlevel}`);
        });
        
        // 重置第一个管理员的密码为123456
        if (admins.length > 0) {
            const admin = admins[0];
            const newPassword = cryptPwd('123456');
            
            await connection.execute('UPDATE student SET stu_password = ? WHERE stu_no = ?', [newPassword, admin.stu_no]);
            
            console.log(`\n✅ 已重置管理员 ${admin.stu_no} (${admin.stu_name}) 的密码为: 123456`);
            console.log(`用户名: ${admin.stu_no}`);
            console.log(`密码: 123456`);
            console.log(`级别: ${admin.stu_userlevel}`);
        }
        
        // 创建一个测试超级管理员
        const testAdmin = {
            stu_no: 'admin',
            stu_name: '测试超级管理员',
            stu_userlevel: '5',
            stu_enable: '1',
            stu_password: cryptPwd('123456')
        };

        await connection.execute(
            'INSERT INTO student (stu_no, stu_name, stu_userlevel, stu_enable, stu_password, stu_grade, stu_sex, stu_class_sname, stu_cno) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE stu_password = VALUES(stu_password), stu_userlevel = VALUES(stu_userlevel), stu_enable = VALUES(stu_enable)',
            [testAdmin.stu_no, testAdmin.stu_name, testAdmin.stu_userlevel, testAdmin.stu_enable, testAdmin.stu_password, '2024', '男', '测试班级', 'TEST']
        );
        
        console.log(`\n✅ 创建/更新测试超级管理员:`);
        console.log(`用户名: admin`);
        console.log(`密码: 123456`);
        console.log(`级别: 超级管理员(5)`);
        
    } catch (error) {
        console.error('❌ 重置密码失败:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

resetAdminPassword().catch(console.error);
