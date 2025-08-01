# WebRTC 录制系统通信协议文档

## 概述

本文档描述了基于 Socket.IO 的 WebRTC 录制系统中服务端和客户端之间的通信协议。系统主要用于远程录制屏幕和摄像头内容，支持实时监控和状态管理。

## 系统架构

### 服务端组件
- **Socket Handler** (`services/socketHandler.js`): 处理 Socket.IO 连接和事件
- **User Manager** (`services/userManager.js`): 管理用户状态
- **Database** (`database.js`): 数据库操作和日志记录
- **Config** (`config.js`): 系统配置管理

### 客户端组件
- **Record Script** (`js/record.js`): 处理录制功能和 Socket.IO 通信

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

## Socket.IO 事件协议

### 1. 连接建立

#### 客户端 → 服务端
**事件**: `connect`
**触发时机**: Socket.IO 连接建立时
**处理**: 自动触发 `message` 事件进行在线状态更新

### 2. 消息事件 (message)

#### 客户端 → 服务端
**事件**: `message`
**参数**: 
- `srcId` (string): 用户ID
- `type` (string): 消息类型
- `args` (any): 参数
- `callback` (function): 回调函数

**消息类型**:

##### 2.1 在线状态
- **type**: `'online'`
- **args**: `true`
- **功能**: 建立用户在线连接
- **服务端处理**:
  - 增加用户在线计数
  - 记录登录日志
  - 广播用户状态更新

##### 2.2 开始录制
- **type**: `'screen'` | `'camera'`
- **args**: `[device, time]`
  - `device` (string): 设备ID
  - `time` (string): 开始时间
- **功能**: 开始屏幕或摄像头录制
- **服务端处理**:
  - 添加录制记录
  - 记录开始录制日志
  - 广播状态更新

##### 2.3 停止录制
- **type**: `'screen'` | `'camera'`
- **args**: `false`
- **功能**: 停止录制
- **服务端处理**:
  - 删除录制记录
  - 处理录制中断
  - 记录停止录制日志
  - 广播状态更新

### 3. 监控事件 (watch)

#### 客户端 → 服务端
**事件**: `watch`
**参数**:
- `srcId` (string): 监控者ID
- `dstId` (string): 被监控者ID

**功能**: 建立监控关系
**权限**: 仅管理员用户 (`stu_userlevel === '1'`)
**服务端处理**:
- 验证用户权限
- 更新被监控者的监控列表
- 记录监控日志
- 广播状态更新

### 4. 屏幕数量事件 (screen)

#### 客户端 → 服务端
**事件**: `screen`
**参数**:
- `srcId` (string): 用户ID
- `number` (number): 屏幕数量

**功能**: 更新用户屏幕数量
**服务端处理**:
- 更新用户屏幕数量
- 记录屏幕变化日志
- 广播状态更新

### 5. 文件上传事件 (file)

#### 客户端 → 服务端
**事件**: `file`
**参数**:
- `srcId` (string): 用户ID
- `type` (string): 录制类型 ('screen' | 'camera')
- `device` (string): 设备ID
- `time` (string): 时间戳
- `data` (Blob): 文件数据

**功能**: 上传录制文件片段
**文件命名**: `u{userId}-{type}-{time}-{device}.webm`
**服务端处理**:
- 创建或追加文件
- 更新累计录制时长
- 记录文件创建日志

### 6. 断开连接事件 (disconnect)

#### 客户端 → 服务端
**事件**: `disconnect`
**触发时机**: Socket.IO 连接断开时
**服务端处理**:
- 减少在线计数
- 清理监控关系
- 处理录制中断
- 记录断开连接日志
- 广播状态更新

## 服务端 → 客户端事件

### 1. 状态广播 (state)

**事件**: `state`
**参数**: `AllUsers` (object) - 所有用户状态
**触发时机**: 任何用户状态变化时
**客户端处理**: 更新界面显示

### 2. 通知事件 (notice)

**事件**: `notice`
**参数**:
- `target` (string): 目标用户 ('all' | userId)
- `data` (string): 通知内容
**客户端处理**: 显示系统通知

### 3. 录制控制 (record)

**事件**: `record`
**参数**: `arg` (boolean) - true: 开始录制, false: 停止录制
**客户端处理**: 
- 自动点击录制按钮
- 显示通知
- 停止时刷新页面

### 4. 用户禁用 (disable)

**事件**: `disable`
**参数**: `userId` (string) - 被禁用的用户ID
**客户端处理**: 如果是当前用户，跳转到登出页面

## 配置参数

### 视频配置 (videoConfig)
```javascript
{
  width: 1920,              // 视频宽度
  height: 1080,             // 视频高度
  frameRate: 15,            // 帧率
  sliceTime: 3000,          // 切片时间(毫秒)
  allowRecord: {            // 允许录制的类型
    screen: true,
    camera: false
  },
  mimeType: 'video/webm;codecs=h264' // 视频格式
}
```

### 网络配置 (networkConfig)
```javascript
{
  socketPort: 7080,                    // Socket.IO端口
  turnServerPort: 7100,                // TURN服务器端口
  turnServerUsername: 'username',      // TURN服务器用户名
  turnServerCredential: 'credential'   // TURN服务器凭证
}
```

## WebRTC 连接

### PeerJS 配置
- **Host**: 当前域名
- **Port**: Socket.IO端口
- **Path**: `/webrtc`
- **Secure**: true
- **ICE Servers**: 
  - STUN: `stun:stun.l.google.com:19302`
  - TURN: 自定义TURN服务器

### 连接流程
1. 创建 Peer 实例
2. 监听连接事件
3. 建立媒体流连接
4. 处理断线重连

## 错误处理

### 服务端错误处理
- 用户不存在错误
- 权限验证错误
- 文件操作错误
- 数据库操作错误

### 客户端错误处理
- 媒体设备访问失败
- 录制权限被拒绝
- 网络连接中断
- 浏览器兼容性问题

## 日志记录

### 日志类型
- `login`: 登录
- `logout`: 登出
- `start_record`: 开始录制
- `end_record`: 结束录制
- `interrupt`: 录制中断
- `monitor_open`: 打开监控
- `screen_change`: 屏幕变化
- `create_file`: 创建文件
- `error`: 错误信息

### 日志格式
存储过程: `proc_write_log(cno, stu_no, ipaddr, type, content, second)`

## 安全考虑

1. **用户认证**: 基于 Session 的用户认证
2. **权限控制**: 管理员权限验证
3. **数据验证**: 输入参数验证
4. **错误处理**: 完善的异常处理机制
5. **日志审计**: 详细的操作日志记录

## 性能优化

1. **文件分片**: 录制文件按时间切片上传
2. **状态管理**: 内存中维护用户状态
3. **连接复用**: Socket.IO 连接复用
4. **错误恢复**: 自动重连机制

## 通信流程示例

### 录制流程
```
1. 客户端连接
   Client -> Server: connect
   Client -> Server: message(userId, 'online', true)
   Server -> All: state(AllUsers)

2. 开始录制
   Client: 用户点击录制按钮
   Client: 获取媒体流 (getDisplayMedia/getUserMedia)
   Client -> Server: message(userId, 'screen', [device, time])
   Client -> Server: file(userId, 'screen', device, time, data) // 持续发送
   Server -> All: state(AllUsers)

3. 停止录制
   Client: 用户点击停止按钮
   Client -> Server: message(userId, 'screen', false)
   Server -> All: state(AllUsers)

4. 断开连接
   Client: 关闭页面/网络中断
   Client -> Server: disconnect
   Server: 清理用户状态和录制记录
   Server -> All: state(AllUsers)
```

### 监控流程
```
1. 管理员打开监控
   Admin Client -> Server: watch(adminId, studentId)
   Server: 验证管理员权限
   Server: 更新学生的 watchList
   Server -> All: state(AllUsers)

2. 建立 WebRTC 连接
   Admin Client: 创建 Peer 连接
   Student Client: 接收连接请求
   Student Client: 发送媒体流给管理员

3. 关闭监控
   Admin Client: 关闭监控页面
   Admin Client -> Server: disconnect
   Server: 减少 watchCount 或删除监控记录
   Server -> All: state(AllUsers)
```

## API 接口

### HTTP 接口

#### GET /information
**功能**: 获取系统配置信息
**返回**:
```javascript
{
  videoConfig: {...},
  networkConfig: {...},
  sessionUser: {...}
}
```

#### GET /stulist
**功能**: 获取学生列表 (需要管理员权限)
**返回**:
```javascript
{
  stulist: [...]
}
```

#### POST /disable
**功能**: 禁用用户 (需要管理员权限)
**参数**:
```javascript
{
  id: string // 用户ID
}
```
**返回**:
```javascript
{
  code: 0,
  message: "Success!"
}
```

## 文件存储

### 目录结构
```
video/
├── u{userId1}/
│   ├── u{userId1}-screen-{time}-{device}.webm
│   ├── u{userId1}-camera-{time}-{device}.webm
│   └── ...
├── u{userId2}/
│   └── ...
└── ...
```

### 文件命名规则
- 格式: `u{userId}-{type}-{time}-{device}.webm`
- 示例: `u2023001-screen-2024-01-15-14-30-25-abc123.webm`

## 状态同步机制

### 全局状态广播
每当发生以下事件时，服务端会向所有连接的客户端广播最新的用户状态：
- 用户上线/下线
- 开始/停止录制
- 建立/关闭监控
- 屏幕数量变化
- 用户被禁用

### 状态恢复
- 客户端重连时自动恢复录制状态
- 服务端重启时从数据库重新加载用户信息
- 录制中断时自动记录中断次数和时长

## 兼容性要求

### 浏览器支持
- Chrome 72+
- Firefox 66+
- Safari 12.1+
- Edge 79+

### 必需的 Web API
- `navigator.mediaDevices.getDisplayMedia()` (屏幕录制)
- `navigator.mediaDevices.getUserMedia()` (摄像头录制)
- `MediaRecorder API`
- `WebRTC API`
- `Socket.IO`
- `Notification API`

### 权限要求
- 屏幕录制权限
- 摄像头和麦克风权限
- 通知权限
- 窗口管理权限 (可选)

## 故障排除

### 常见问题

1. **录制无法开始**
   - 检查浏览器兼容性
   - 确认用户已授予媒体权限
   - 验证网络连接状态

2. **文件上传失败**
   - 检查服务器存储空间
   - 验证文件路径权限
   - 确认网络连接稳定

3. **监控连接失败**
   - 验证管理员权限
   - 检查 WebRTC 连接状态
   - 确认 TURN 服务器配置

4. **状态同步异常**
   - 检查 Socket.IO 连接
   - 验证服务端状态管理
   - 确认客户端事件监听

### 调试方法
- 查看浏览器控制台错误
- 检查服务端日志记录
- 使用网络面板监控通信
- 验证数据库连接状态
