/* 数据库名称改为 webrtc */
drop database if exists webrtc;
create database webrtc;
use webrtc;

/* 创建用户表（student），包括 录屏用户和管理员
    录屏用户   ：stu_userlevel 为 0
    普通管理员 ：stu_userlevel 为 1（只能查看monitor表中对应的学生）
    超级管理员 ：stu_userlevel 为 2（能查看所有student表的学生，不受monitor表约束）
    超级用户   ：stu_userlevel 为 9（监控系统状态，例如磁盘是否满；查看管理员是否在线，每个管理员当前正在查看哪几个学生等）
*/
drop table if exists student;
create table student (
stu_grade char(4) not null,
stu_no char(8) not null primary key,        /* 学工号为8位，主键（原来的主键是stu_grade + stu_no） */
stu_name char(16) not null,
stu_password char(32) not null,
stu_sex char(2) not null default '男',
stu_class_fname char(32) not null,
stu_class_sname char(16) not null,
stu_term char(11) not null,
stu_cno char(13) not null,                   /* 课号扩展为13位 */
stu_wtype char(1) not null default '0',
stu_userlevel char(1) not null default '0',
stu_enable char(1) not null default '1'
) ENGINE=InnoDB;

/* 插入 学生数据
从examinations的student表导入的方法：
select * from student into outfile "/tmp/student.txt";
load data infile "/tmp/student.txt" into table student;
*/

insert into student values('2023', '1234567', '测试1', MD5('1234567'), '男', '/', '/', '2023/2024/1', '100084', '0', '0', '1');
insert into student values('2023', '2307102', '测试3', MD5('2307102'), '男', '/', '/', '2023/2024/1', '100084', '0', '0', '1');
insert into student values('2023', '2307103', '测试4', MD5('2307103'), '男', '/', '/', '2023/2024/1', '100084', '0', '0', '1');
insert into student values('2023', '2307104', '测试5', MD5('2307104'), '男', '/', '/', '2023/2024/1', '100084', '0', '0', '1');

/* 插入 普通管理员 / 超级管理员 */
insert into student values('2023', '1111', '管理1', MD5('1111'), '男', '/', '/', '2023/2024/1', '100084', '0', '1', '1');
insert into student values('2023', '1111', '管理1', MD5('1111'), '男', '/', '/', '2023/2024/1', '100084', '0', '1', '1');
insert into student values('2023', '2222', '管理2', MD5('2222'), '男', '/', '/', '2023/2024/1', '100084', '0', '1', '1');
insert into student values('2023', '3333', '管理3', MD5('3333'), '男', '/', '/', '2023/2024/1', '100084', '0', '1', '1');
insert into student values('2023', '4444', '超级管理', MD5('4444'), '男', '/', '/', '2023/2024/1', '100084', '0', '2', '1');
insert into student values('2023', '9999', 'root', MD5('9999'), '男', '/', '/', '2023/2024/1', '100084', '0', '9', '1');
insert into student values('2022', '2259999', '管理', MD5('2259999'), '男', '/', '/', '2022/2023/2', '100084', '0', '1', '1');

/* 创建监控映射表（monitor），指定普通管理员和对应可查看的学生 */
drop table if exists monitor;
create table monitor (
monitor_mno char(8),        /* 普通管理员学工号 */
monitor_sno char(8),        /* 对应学生的学号 */
monitor_starttime datetime, /* 可查看监控的起始时间 */
monitor_endtime datetime,   /* 可查看监控的结束时间 */
primary key(monitor_mno, monitor_sno),
foreign key(monitor_mno) references student(stu_no) on delete cascade on update cascade,
foreign key(monitor_sno) references student(stu_no) on delete cascade on update cascade
) ENGINE=InnoDB;

/* 插入测试数据 */
insert into monitor values('1111', '2307101', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('1111', '2307102', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('1111', '2307103', '2022-07-25 00:00:00', '2022-08-15 23:59:59');
insert into monitor values('1111', '2307104', '2022-07-25 00:00:00', '2022-08-15 23:59:59');
insert into monitor values('2222', '2307102', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('2222', '2307103', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('3333', '2307101', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('3333', '2307103', '2023-07-25 00:00:00', '2023-08-15 23:59:59');

insert into monitor values('2259999', '2307101', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('2259999', '2307102', '2023-07-25 00:00:00', '2023-08-15 23:59:59');
insert into monitor values('2259999', '2307103', '2022-07-25 00:00:00', '2022-08-15 23:59:59');
insert into monitor values('2259999', '2307104', '2022-07-25 00:00:00', '2022-08-15 23:59:59');

/*****************************
    监控管理 - 管理员查询自己分配的监考学生名单
 *****************************/
drop procedure if exists proc_get_monitor_stulist;
delimiter //
create procedure proc_get_monitor_stulist(in in_mno char(8), in in_type enum("valid","all"))
label:BEGIN
    /* 检查操作类型是否正确：
       valid：当前有效的学生名单，指当前时间在monitor表的monitor_starttime ~ monitor_endtime 之间
       all  ：该管理员对应的全部学生（不判断时间是否有效） */
    if in_type != "valid" and in_type != "all" then
        select "指定操作不是valid/all" as error;
        leave label; /* 退出存储过程 */
    end if;

    /* 检查in_mno的userlevel是否为1 */
    set @mon_userlevel = NULL;
    set @sqlcmd=concat("select stu_userlevel from student ");
    set @sqlcmd=concat(@sqlcmd, "where stu_no ='", in_mno, "' and stu_enable = '1' ");
    set @sqlcmd=concat(@sqlcmd, "into @mon_userlevel;");

    prepare stmt from @sqlcmd;
    execute stmt;

    if @mon_userlevel != 1 and @mon_userlevel != 2 then /* 不是 普通管理员/超级管理员 */
        select "指定用户不是管理员" as error;
        leave label; /* 退出存储过程 */
    end if;

    /* select * from student where stu_no in (select monitor_sno from monitor where monitor_mno = "3333" and now() >= monitor_starttime and now() <= monitor_endtime) ; */
    set @sqlcmd=concat("select stu_grade as grade, stu_no as sno, stu_name as name, stu_sex as sex, stu_class_sname as sname from student ");

    if @mon_userlevel = 1 then /* 普通管理员 */
        if in_type = "valid" then
            set @sqlcmd=concat(@sqlcmd, "where stu_no in (select monitor_sno from monitor where monitor_mno = '", in_mno,"' and now() >= monitor_starttime and now() <= monitor_endtime) ");
        else
            set @sqlcmd=concat(@sqlcmd, "where stu_no in (select monitor_sno from monitor where monitor_mno = '", in_mno,"') ");
        end if;
    else /* 超级管理员 */
        if in_type = "valid" then
            set @sqlcmd=concat(@sqlcmd, "where stu_no in (select distinct monitor_sno from monitor where now() >= monitor_starttime and now() <= monitor_endtime) ");
        else
            set @sqlcmd=concat(@sqlcmd, "where stu_no in (select distinct monitor_sno from monitor) ");
        end if;
    end if;

    /* 只查询enable为1的学生 */
    set @sqlcmd=concat(@sqlcmd, "and stu_enable = '1'; ");

    prepare stmt from @sqlcmd;
    execute stmt;

    set @sqlcmd="bye";
END //
delimiter ;

call proc_get_monitor_stulist("1111", "valid");
call proc_get_monitor_stulist("2222", "valid");
call proc_get_monitor_stulist("3333", "valid");
call proc_get_monitor_stulist("1111", "all");
call proc_get_monitor_stulist("4444", "valid");
call proc_get_monitor_stulist("4444", "all");

/* 创建日志表(log)，需要记录的信息有：
    用户login
    用户logout
    用户启动录屏（主动按开始录屏按钮）
    用户启动录屏（别动，由管理员统一发出）
    用户结束录屏（主动按结束录屏按钮）
    用户结束录屏（被动，由管理员统一结束）
    用户录屏中断（需要记录本次中断前的时长）
    ...
*/
drop table if exists logs;
create table logs(
log_id int auto_increment not null primary key,
log_cno char(16),
log_sno char(8) not null,
log_ipaddr char(16) not null,
log_date datetime not null default now(),
log_type char(64) not null, /* 用多个字符串记录日志类型(例：login / logout / start_record / end_record / disconnect 等) */
log_content varchar(1024),
log_second int not null,    /* 对于录屏中断的情况，记录时长，其它为NULL即可 */
foreign key(log_sno) references student(stu_no) on delete cascade on update cascade
) ENGINE=InnoDB;

drop procedure if exists proc_write_log;
delimiter $$
create procedure proc_write_log(in in_cno char(16), in in_sno char(8), in in_ipaddr char(25), in in_type char(64), in in_content varchar(1024), in in_second int)
begin
  insert into logs (log_cno, log_sno, log_ipaddr, log_type, log_content, log_second) values (in_cno, in_sno, in_ipaddr, in_type, in_content, in_second);
end $$
delimiter ;

/* =================== examinations 数据库 =================== */

/* 注意：使用之前先确保FEDERATED引擎能够正常使用！ */

/* 创建一样的表(名称可以不同) */
drop table if exists link_exam_stulist;
create table link_exam_stulist (
exam_student_list_exam_term char(11) NOT NULL,
exam_student_list_exam_cno char(16) NOT NULL,
exam_student_list_exam_no char(2) NOT NULL,
exam_student_list_grade char(4) DEFAULT NULL,
exam_student_list_stu_cno char(16) NOT NULL,
exam_student_list_stu_no char(8) NOT NULL,
exam_student_list_stu_name char(16) NOT NULL,
exam_student_list_class_fname char(32) DEFAULT NULL,
exam_student_list_class_sname char(16) DEFAULT NULL,
exam_student_list_start_time datetime DEFAULT NULL,
exam_student_list_end_time datetime DEFAULT NULL,
exam_student_list_seat char(16) DEFAULT NULL,
exam_student_list_is_forbidden enum('1','0') DEFAULT NULL,
exam_student_list_ipaddr_start char(15) NOT NULL,
exam_student_list_ipaddr_end char(15) NOT NULL,
exam_student_list_enable_new_ipaddr enum('1','0') NOT NULL DEFAULT '1',
exam_student_list_login_ipaddr1 char(15) DEFAULT NULL,
exam_student_list_login_ipaddr2 char(15) DEFAULT NULL,
exam_student_list_login_ipaddr3 char(15) DEFAULT NULL,
exam_student_list_cache text DEFAULT NULL,
PRIMARY KEY (exam_student_list_exam_term,exam_student_list_exam_cno,exam_student_list_exam_no,exam_student_list_stu_no)
) ENGINE=InnoDB;

/*****************************
    考试管理 - 普通管理员查询自己分配的监考学生名单所用的视图
    注：暂时不能 stu_grade = exam_student_list_grade，因为目前 exam_student_list_grade 为NULL
 *****************************/
drop view if exists view_monitor_list;
create view view_monitor_list(vm_no, vm_name, vm_sex)
as
select stu_no, stu_name, stu_sex from student where stu_userlevel in ('1','2');

drop view if exists view_monitor_exam_stulist;
create view view_monitor_exam_stulist(term, grade, cno, sno, name, sex, fname, sname, mno, starttime, endtime, eno, is_forbidden, enable_newip)
as
select stu_term, stu_grade, stu_cno, stu_no, stu_name, stu_sex, stu_class_fname, stu_class_sname, 
monitor_mno, monitor_starttime, monitor_endtime,
exam_student_list_exam_no, exam_student_list_is_forbidden, exam_student_list_enable_new_ipaddr
from student, view_monitor_list, monitor, link_exam_stulist
where stu_term = exam_student_list_exam_term 
and stu_no = exam_student_list_stu_no and stu_no = monitor_sno and monitor_sno = exam_student_list_stu_no and monitor_mno = vm_no
and stu_userlevel = '0' and stu_enable = '1';

select * from view_monitor_exam_stulist;
select * from view_monitor_exam_stulist where sno in (2307101);

/*****************************
    考试管理 - 普通管理员查询自己分配的监考学生名单（超级管理员不给考试管理的权限）
 *****************************/
drop procedure if exists proc_get_monitor_exam_stulist;
delimiter //
create procedure proc_get_monitor_exam_stulist(in in_term char(11), in in_cno char(8), in in_eno char(2), in in_mno char(8), in in_type enum("valid","all"))
label:BEGIN
    /* 检查操作类型是否正确：
       valid：当前有效的学生名单，指当前时间在monitor表的monitor_starttime ~ monitor_endtime 之间
       all  ：该管理员对应的全部学生（不判断时间是否有效） */
    if in_type != "valid" and in_type != "all" then
        select "指定操作不是valid/all" as error;
        leave label; /* 退出存储过程 */
    end if;

    /* 检查in_mno的userlevel是否为1 */
    set @mon_userlevel = NULL;
    set @sqlcmd=concat("select stu_userlevel from student ");
    set @sqlcmd=concat(@sqlcmd, "where stu_no ='", in_mno, "' and stu_enable = '1' ");
    set @sqlcmd=concat(@sqlcmd, "into @mon_userlevel;");

    prepare stmt from @sqlcmd;
    execute stmt;

    if @mon_userlevel != 1 then /* 不是 普通管理员 */
        select "指定用户不是普通管理员" as error;
        leave label; /* 退出存储过程 */
    end if;

    set @sqlcmd=concat("select grade, sno, name, sex, sname, is_forbidden, enable_newip from view_monitor_exam_stulist ");
    set @sqlcmd=concat(@sqlcmd, "where term = '", in_term,"' and cno = '", in_cno, "' and eno = '", in_eno,"' and mno = '", in_mno, "' ");

    if in_type = "valid" then
        set @sqlcmd=concat(@sqlcmd, "and sno in (select monitor_sno from monitor where monitor_mno = '", in_mno,"' and now() >= monitor_starttime and now() <= monitor_endtime) ");
    else
        set @sqlcmd=concat(@sqlcmd, "and sno in (select monitor_sno from monitor where monitor_mno = '", in_mno,"') ");
    end if;

    prepare stmt from @sqlcmd;
    execute stmt;

    set @sqlcmd="bye";
END //
delimiter ;

call proc_get_monitor_exam_stulist("2022/2023/2", "100084","04", "1111", "valid");
call proc_get_monitor_exam_stulist("2022/2023/2", "100084","04", "2222", "valid");
call proc_get_monitor_exam_stulist("2022/2023/2", "100084","04", "3333", "valid");
call proc_get_monitor_exam_stulist("2022/2023/2", "100084","04", "1111", "all");

/*****************************
    考试管理 - 在某场考试中允许学生参加考试/允许学生新IP登录
 *****************************/
drop procedure if exists proc_exam_student_management;
delimiter //
create procedure proc_exam_student_management(in in_term char(11), in in_cno char(8), in in_eno char(2), in in_mno char(8), in in_sno char(8), in in_type char(5), in in_op char(7) )
label:BEGIN
    if in_type != "exam" and in_type != "newip" then
        select "指定操作不是exam/newip" as error;
        leave label; # 退出存储过程
    end if;

    if in_op != "enable" and in_op != "disable" then
        select "指定操作不是enable/disable" as error;
        leave label; # 退出存储过程
    end if;

    /* 检查in_mno的userlevel是否为1 */
    set @mon_userlevel = NULL;
    set @sqlcmd=concat("select stu_userlevel from student ");
    set @sqlcmd=concat(@sqlcmd, "where stu_no ='", in_mno, "' and stu_enable = '1' ");
    set @sqlcmd=concat(@sqlcmd, "into @mon_userlevel;");

    prepare stmt from @sqlcmd;
    execute stmt;

    if @mon_userlevel != 1 then /* 不是 普通管理员 */
        select "指定用户不是普通管理员" as error;
        leave label; /* 退出存储过程 */
    end if;

    set @sqlcmd=concat("update link_exam_stulist set ");
    if in_type = "exam" then
        if in_op = "disable" then
            set @sqlcmd=concat(@sqlcmd, "exam_student_list_is_forbidden = '1' ");
        else
            set @sqlcmd=concat(@sqlcmd, "exam_student_list_is_forbidden = '0' ");
        end if;
    else
        if in_op = "disable" then
            set @sqlcmd=concat(@sqlcmd, "exam_student_list_enable_new_ipaddr = '0' ");
        else
            set @sqlcmd=concat(@sqlcmd, "exam_student_list_enable_new_ipaddr = '1' ");
        end if;
    end if;

    set @sqlcmd=concat(@sqlcmd, "where exam_student_list_exam_term = '", in_term,"' and exam_student_list_exam_cno = '", in_cno, "' and exam_student_list_exam_no = '", in_eno,"' and exam_student_list_stu_no = '", in_sno, "';");

    prepare stmt from @sqlcmd;
    execute stmt;

    set @sqlcmd="bye";
END //
delimiter ;

call proc_exam_student_management ("2022/2023/2", "100084", "04", "1111", "2307101", "exam", "disable");
call proc_exam_student_management ("2022/2023/2", "100084", "04", "1111", "2307101", "newip", "enable");
call proc_get_monitor_exam_stulist("2022/2023/2", "100084", "04", "1111", "valid");

call proc_exam_student_management ("2022/2023/2", "100084", "04", "1111", "2307101", "exam", "enable");
call proc_get_monitor_exam_stulist("2022/2023/2", "100084", "04", "1111", "valid");

call proc_exam_student_management ("2022/2023/2", "100084", "04", "1111", "2307101", "newip", "disable");
call proc_get_monitor_exam_stulist("2022/2023/2", "100084", "04", "1111", "valid");
