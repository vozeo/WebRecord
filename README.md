# WebRecord

![](https://img.shields.io/badge/Version-3.0-green?style=flat-square)

## Introductions

This project is a browser-side recording system based on WebRTC technology, with functions such as recording screen, recording camera, real-time view monitoring, and real-time server saving.

The project is written in Node.js + Javascript + Express.

This project has been tested by hundreds of people in several exams, and the performance is reliable.

## 数据库配置

Docker 安装 mariadb（已有可不安装）
```bash
docker run --name mariadb -d -p 3306:3306 -v /var/lib/mysql:/var/lib/mysql -e MARIADB_ROOT_PASSWORD=password mariadb
```

导入数据库表 `user.sql`

```bash
mysql -u root -ppassword < user.sql
```


## 中转服务器配置

填写配置文件

```bash
cp turnserver_example.conf turnserver.conf
```
参数的具体含义可以参考https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf

安装中转服务器，以下安装方法二选一：
### Docker
Docker 第一次安装并运行 coturn：

```bash
docker run --name coturn -d --network=host -v $(pwd)/turnserver.conf:/etc/coturn/turnserver.conf coturn/coturn
```

安装后运行 coturn：
```bash
docker start coturn
```

### 直接安装（Ubuntu）
Ubuntu直接安装并运行coturn：

```bash
sudo apt install coturn
sudo turnserver -o -c turnserver.conf
```

## 项目配置

### 安装 Node.js

不同的系统和软件包管理器安装方式各不相同，以下列出常见的几个，其余可以在官网https://nodejs.org/en/查询。

- Ubuntu
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - &&\
sudo apt-get install -y nodejs
```

- Debian
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - &&\
apt-get install -y nodejs
```

- CentOS, Fedora, Rocky
```bash
curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
```

### 生成证书

```bash
mkdir -p ssl && cd ssl
openssl req -days 3650 -x509 -newkey rsa:2048 -keyout private.key -out cert.crt 
```

### 填写配置

```bash
cp config_example.js config.js
```

注意 turnServer 相关的三个字段应与 `turnserver.conf` 中的相关字段一致。

### 安装软件包并打开服务器

```bash
pnpm i
node app.js
```

### 使用 pm2 进行进程管理（可选）

设置开机自启动

```bash
sudo pnpm i -g pm2
pm2 start app.js
pm2 save
pm2 startup
```


