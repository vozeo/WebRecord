# WebRTC监控系统 - 项目介绍

![](https://img.shields.io/badge/Version-2.0-green?style=flat-square)
![](https://img.shields.io/badge/TypeScript-4A90E2?style=flat-square&logo=typescript&logoColor=white)
![](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)

## 项目概述

WebRTC监控系统是一个基于WebRTC技术的视频监控系统，主要用于在线考试或远程监控场景。系统采用TypeScript + Node.js + Express后端，纯HTML + JavaScript前端架构，经过完全重构，移除了模板渲染依赖，采用纯API模式，提高了架构的清晰度和可维护性。

### 主要功能

- 🎥 **屏幕录制**: 支持高清屏幕录制，可配置分辨率和帧率
- 📹 **摄像头录制**: 支持摄像头录制功能
- 👀 **实时监控**: 管理员可实时查看学生录制状态
- 💾 **自动保存**: 录制内容自动保存到服务器
- 🔐 **权限管理**: 支持学生和管理员两种角色
- 📊 **状态监控**: 实时显示在线状态、录制状态、中断次数等
- 🔔 **通知系统**: 支持全体或单个用户通知
- ⏰ **考试管理**: 支持考试时间控制和学生管理
- 📁 **文件管理**: 支持录制文件的查看、下载和删除
- 🔒 **安全认证**: Session-based认证，支持权限分级
- 🔄 **自动重连**: 网络中断时自动重连并继续录制
- 📈 **性能监控**: 实时显示录制时长、中断次数等统计信息

### 2.0版本重构改进

- ✅ **移除art-template依赖**: 不再使用服务端模板渲染，改为纯前端API调用模式
- ✅ **全局错误处理**: 实现了完整的错误捕获机制，确保服务器稳定运行
- ✅ **代码分离**: 清晰分离服务端和客户端代码
- ✅ **TypeScript重构**: 优化了代码结构和类型安全
- ✅ **API标准化**: 统一的API响应格式和错误处理
- ✅ **JavaScript模板系统**: 创建了`template.js`替代art-template，保持统一的页面结构
- ✅ **简化的HTML**: 移除所有模板语法，使用纯HTML + JavaScript动态加载内容

## 技术架构

### 后端技术栈
- **Node.js**: 运行时环境
- **TypeScript**: 类型安全的JavaScript超集
- **Express.js**: Web框架
- **Socket.IO**: 实时通信
- **MySQL/MariaDB**: 数据库
- **Redis**: Session存储
- **HTTPS**: 安全传输
- **PeerJS**: WebRTC连接管理
- **Coturn**: TURN/STUN服务器

### 前端技术栈
- **HTML5**: 页面结构
- **Bootstrap 5**: UI框架
- **JavaScript ES6+**: 业务逻辑
- **WebRTC API**: 媒体录制
- **Socket.IO Client**: 实时通信
- **Template.js**: 统一模板系统(替代art-template)

### 系统架构图
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   学生端浏览器   │    │   管理员浏览器   │    │   TURN服务器    │
│                │    │                │    │   (Coturn)     │
│ - 录制界面      │    │ - 监控界面      │    │                │
│ - WebRTC录制    │    │ - 实时查看      │    │ - NAT穿透      │
│ - Socket连接    │    │ - 学生管理      │    │ - 中继服务      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴───────────┐
                    │     WebRecord服务器      │
                    │                        │
                    │ ┌─────────────────────┐ │
                    │ │    Express应用      │ │
                    │ │ - 路由处理          │ │
                    │ │ - 认证中间件        │ │
                    │ │ - 静态文件服务      │ │
                    │ └─────────────────────┘ │
                    │ ┌─────────────────────┐ │
                    │ │   Socket.IO服务     │ │
                    │ │ - 实时通信          │ │
                    │ │ - 状态同步          │ │
                    │ │ - 文件传输          │ │
                    │ └─────────────────────┘ │
                    │ ┌─────────────────────┐ │
                    │ │    业务服务层       │ │
                    │ │ - 用户管理          │ │
                    │ │ - 录制管理          │ │
                    │ │ - 文件管理          │ │
                    │ └─────────────────────┘ │
                    └─────────────┬───────────┘
                                  │
                    ┌─────────────┴───────────┐
                    │      数据存储层         │
                    │                        │
                    │ ┌─────────┐ ┌─────────┐ │
                    │ │ MySQL   │ │ Redis   │ │
                    │ │ 用户数据 │ │ Session │ │
                    │ │ 日志记录 │ │ 缓存    │ │
                    │ └─────────┘ └─────────┘ │
                    │ ┌─────────────────────┐ │
                    │ │     文件系统        │ │
                    │ │   录制文件存储      │ │
                    │ └─────────────────────┘ │
                    └─────────────────────────┘
```

## 项目结构

```
WebRTC/
├── src/                      # TypeScript源码目录
│   ├── app.ts               # 应用主入口文件
│   ├── types/               # TypeScript类型定义
│   │   └── index.ts
│   ├── controllers/         # 控制器层
│   │   ├── apiController.ts # API控制器
│   │   ├── authController.ts # 认证控制器
│   │   ├── pageController.ts # 页面控制器
│   │   └── fileController.ts # 文件控制器
│   ├── middleware/          # 中间件
│   │   ├── auth.ts          # 认证中间件
│   │   └── errorHandler.ts  # 全局错误处理
│   ├── routes/              # 路由配置
│   │   └── index.ts
│   └── services/            # 业务逻辑服务层
│       ├── database.ts      # 数据库服务
│       ├── socketHandler.ts # Socket.IO处理
│       ├── userManager.ts   # 用户管理服务
│       └── utils.ts         # 工具函数
├── public/                  # 前端静态资源
│   ├── js/                 # 客户端JavaScript
│   │   ├── record.js       # 录制功能
│   │   ├── template.js     # 模板系统
│   │   ├── errorHandler.js # 错误处理
│   │   └── logger.js       # 日志系统
│   ├── css/                # 样式文件
│   └── assets/             # 其他静态资源
├── views/                  # HTML模板文件
│   ├── index.html          # 首页
│   ├── login.html          # 登录页
│   ├── record.html         # 录制页
│   ├── monitor.html        # 监控页
│   ├── history.html        # 历史记录页
│   ├── password.html       # 密码修改页
│   ├── live.html           # 实时视频页
│   └── monitor_file.html   # 文件监控页
├── scripts/                # 脚本文件
│   ├── check_password.js   # 密码检查脚本
│   ├── reset_admin_password.js # 重置管理员密码
│   ├── generate_ssl_cert.sh # SSL证书生成
│   └── install_ca_cert.sh  # CA证书安装
├── docs/                   # 项目文档
├── tests/                  # 测试文件
├── ssl/                    # SSL证书目录
├── config.ts               # 配置文件
├── package.json            # 依赖管理
└── tsconfig.json           # TypeScript配置
```

## 核心功能详解

### 1. 录制功能
- **屏幕录制**: 使用MediaRecorder API录制屏幕内容
- **摄像头录制**: 支持前置/后置摄像头录制
- **文件切片**: 录制文件按时间切片上传，避免大文件传输问题
- **自动重连**: 网络中断时自动重连并继续录制
- **多设备支持**: 支持多屏幕录制
- **录制控制**: 支持开始、停止、暂停录制

### 2. 实时监控
- **状态同步**: 通过Socket.IO实时同步学生状态
- **在线监控**: 显示学生在线状态、录制状态、中断次数
- **实时通知**: 支持全体或单个用户发送通知
- **考试管理**: 控制考试开始/结束时间
- **监控关系**: 管理员可监控指定学生

### 3. 文件管理
- **自动存储**: 录制文件自动保存到服务器
- **文件列表**: 按学生ID组织文件结构
- **下载功能**: 支持录制文件下载
- **删除功能**: 支持文件删除（管理员权限）
- **文件命名**: `u{userId}-{type}-{time}-{device}.webm`

### 4. 权限系统
- **用户角色**: 学生(0)、管理员(>=1)、超级管理员(>=5)
- **Session认证**: 基于Redis的Session存储
- **权限控制**: 不同角色访问不同功能
- **安全退出**: 支持安全登出和Session清理

## 数据结构

### 用户状态对象 (AllUsers)
```javascript
{
  [userId]: {
    stu_no: string,           // 学号
    stu_cno: string,          // 课程号
    stu_name: string,         // 姓名
    stu_grade: string,        // 年级
    stu_userlevel: string,    // 用户级别 ('1' = 管理员)
    stu_class_sname: string,  // 班级名称
    watchList: {},            // 监控列表
    recordList: {             // 录制列表
      camera: {},             // 摄像头录制
      screen: {}              // 屏幕录制
    },
    online: number,           // 在线连接数
    screenNumber: number,     // 屏幕数量
    interruptions: number,    // 中断次数
    accumulatedDuration: number, // 累计录制时长(毫秒)
    lastStartTime: number     // 最后开始时间
  }
}
```

### 录制状态对象 (RecordList)
```javascript
{
  screen: {
    state: 'end'|'start'|'pause', // 录制状态
    device: string,               // 设备ID
    stream: MediaStream,          // 媒体流
    recorder: MediaRecorder,      // 录制器
    peer: Peer                    // WebRTC连接
  },
  camera: {
    // 同上结构
  }
}
```

## API接口

### 系统配置
- `GET /api/information` - 获取系统配置信息

### 认证相关
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `POST /api/change-password` - 修改密码

### 学生管理
- `GET /api/stulist` - 获取学生列表
- `POST /api/disable` - 禁用用户
- `POST /api/manage` - 考试管理

### 文件管理
- `GET /api/file` - 获取文件列表
- `GET /api/record_file_list` - 获取录制文件列表
- `GET /api/download/:studentId/:filename` - 下载文件
- `DELETE /api/files/:studentId/:filename` - 删除文件

### 消息推送
- `POST /api/emit` - 发送通知/录制指令

## 页面路由

- `/` - 首页
- `/login` - 登录页面
- `/record` - 录制页面
- `/monitor` - 监控页面
- `/history` - 历史记录页面
- `/password` - 密码修改页面
- `/live` - 实时视频页面
- `/monitor_file` - 文件监控页面

## Socket.IO事件协议

### 客户端到服务器事件

#### 1. 连接建立
- **事件**: `connect`
- **触发时机**: Socket.IO 连接建立时
- **处理**: 自动触发 `message` 事件进行在线状态更新

#### 2. 消息事件 (message)
- **事件**: `message`
- **参数**: 
  - `srcId` (string): 用户ID
  - `type` (string): 消息类型
  - `args` (any): 参数
  - `callback` (function): 回调函数

**消息类型**:
- **在线状态**: `type: 'online', args: true`
- **开始录制**: `type: 'screen'|'camera', args: [device, time]`
- **停止录制**: `type: 'screen'|'camera', args: false`

#### 3. 监控事件 (watch)
- **事件**: `watch`
- **参数**: `srcId` (监控者ID), `dstId` (被监控者ID)
- **权限**: 仅管理员用户

#### 4. 屏幕数量事件 (screen)
- **事件**: `screen`
- **参数**: `srcId` (用户ID), `number` (屏幕数量)

#### 5. 文件上传事件 (file)
- **事件**: `file`
- **参数**: 
  - `srcId` (string): 用户ID
  - `type` (string): 录制类型 ('screen' | 'camera')
  - `device` (string): 设备ID
  - `time` (string): 时间戳
  - `data` (Blob): 文件数据

#### 6. 断开连接事件 (disconnect)
- **事件**: `disconnect`
- **触发时机**: Socket.IO 连接断开时

### 服务器到客户端事件

#### 1. 状态广播 (state)
- **事件**: `state`
- **参数**: `AllUsers` (object) - 所有用户状态
- **触发时机**: 任何用户状态变化时

#### 2. 通知事件 (notice)
- **事件**: `notice`
- **参数**: `target` (目标用户), `data` (通知内容)

#### 3. 录制控制 (record)
- **事件**: `record`
- **参数**: `arg` (boolean) - true: 开始录制, false: 停止录制

#### 4. 用户禁用 (disable)
- **事件**: `disable`
- **参数**: `userId` (string) - 被禁用的用户ID

## 配置说明

主要配置在`config.ts`文件中：

```typescript
export const serverConfig = {
    keyPath: './ssl/private.key',
    certPath: './ssl/cert.crt',
    savePath: './recordings',
    sessionSecret: 'your-session-secret'
};

export const networkConfig = {
    socketPort: 7081
};

export const videoConfig = {
    width: 1920,
    height: 1080,
    frameRate: 15,
    sliceTime: 3000
};
```

## 性能优化

- **文件切片上传**: 避免大文件传输超时
- **连接池管理**: 数据库连接池优化
- **错误日志限制**: 防止内存泄漏
- **静态文件缓存**: 提高访问速度
- **WebRTC优化**: 支持多种编解码器
- **Socket.IO优化**: 使用房间机制减少广播开销

## 安全特性

- **HTTPS加密**: 所有通信使用SSL/TLS加密
- **Session安全**: 基于Redis的安全Session存储
- **权限验证**: 严格的权限控制机制
- **文件访问控制**: 防止未授权文件访问
- **输入验证**: 所有用户输入进行验证
- **CSRF保护**: 防止跨站请求伪造

## 故障排除

### 常见问题

1. **Redis连接失败**: 检查Redis服务是否正常运行
2. **SSL证书错误**: 确保证书文件路径正确且有效
3. **端口占用**: 检查配置的端口是否被占用
4. **WebRTC连接失败**: 检查HTTPS配置和浏览器权限
5. **录制文件上传失败**: 检查网络连接和文件权限
6. **Socket.IO连接失败**: 检查防火墙和网络配置

### 日志查看

- 应用日志直接输出到控制台
- 错误日志通过全局错误处理器记录
- 可通过`/health`接口查看系统健康状态
- 数据库操作日志记录在MySQL中

## 开发注意事项

1. **API格式**: 所有API返回统一的响应格式
2. **错误处理**: 使用`asyncHandler`包装异步函数
3. **类型安全**: 充分利用TypeScript类型检查
4. **代码分离**: 服务端代码在`src/`，客户端代码在`public/js/`
5. **权限控制**: 所有敏感操作都需要权限验证
6. **Socket.IO事件**: 使用category:action格式命名事件
7. **文件上传**: 使用切片上传避免大文件问题

## 版本历史

### v2.0 (当前版本)
- 完全重构为TypeScript
- 移除art-template依赖
- 实现纯API模式
- 优化错误处理机制
- 提升代码可维护性
- 增强Socket.IO协议

### v1.0 (历史版本)
- 基于Node.js + Express
- 使用art-template模板引擎
- 基础WebRTC录制功能

## 贡献指南

欢迎提交Issue和Pull Request！

### 开发流程
1. Fork项目
2. 创建功能分支
3. 提交代码
4. 创建Pull Request

### 代码规范
- 使用TypeScript编写后端代码
- 遵循ES6+语法规范
- 使用驼峰命名法
- 添加适当的注释
- 遵循Socket.IO事件命名规范

## 许可证

MIT License

---

**注意**: 这是从原始项目重构而来的TypeScript版本，保持了核心功能的同时提升了代码质量和可维护性。系统支持高并发录制和实时监控，适用于在线考试、远程监控等场景。 