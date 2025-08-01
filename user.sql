set names gbk;
drop database if exists user;
create database user;
use user;

drop table if exists student;
create table student (
stu_grade char(4) not null,
stu_no char(8) not null,
stu_name char(16) not null,
stu_password char(32) not null,
stu_sex char(2) not null default '男',
stu_class_fname char(32) not null,
stu_class_sname char(16) not null,
stu_term char(11) not null,
stu_cno char(8) not null,
stu_wtype char(1) not null default '0',
stu_userlevel char(1) not null default '0',
stu_enable char(1) not null default '1',
primary key(stu_grade, stu_no)
) ENGINE=InnoDB CHARSET=gbk;

use user;
drop table if exists logs;
create table logs(
log_id int auto_increment not null primary key,
log_cno char(16),
log_sno char(8) not null,
log_ipaddr char(25) not null,
log_date datetime default now() not null,
log_content varchar(1000)
) ENGINE=InnoDB CHARSET=gbk;

drop procedure if exists addLog;
delimiter $$
create procedure addLog(in i_cno char(16), in i_sno char(8), in i_ipaddr char(25), in i_content varchar(1000))
begin
  insert into logs (log_cno, log_sno, log_ipaddr, log_content) values (i_cno, i_sno, i_ipaddr, i_content);
end $$
delimiter ;

