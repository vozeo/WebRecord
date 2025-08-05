#!/bin/bash

# WebRTC监控系统打包脚本
# 简单的tar压缩，排除冗余文件

set -e

# 获取版本信息
VERSION="2.0"
PACKAGE_NAME="webrtc-monitor-v${VERSION}"
BUILD_DATE=$(date '+%Y-%m-%d_%H%M%S')

echo "=========================================="
echo "    WebRTC监控系统打包脚本"
echo "=========================================="

# 创建打包目录
mkdir -p dist

# 创建压缩包，排除不需要的文件
echo "创建压缩包..."
tar -czf "dist/${PACKAGE_NAME}.tar.gz" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='trash' \
    --exclude='recordings' \
    --exclude='logs' \
    --exclude='temp' \
    --exclude='.git' \
    --exclude='.claude' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    --exclude='Thumbs.db' \
    --exclude='*.swp' \
    --exclude='*.swo' \
    --exclude='coverage' \
    --exclude='.pm2' \
    .

# 显示打包结果
ARCHIVE_SIZE=$(du -h "dist/${PACKAGE_NAME}.tar.gz" | cut -f1)

echo "=========================================="
echo "    打包完成！"
echo "=========================================="
echo "压缩包: dist/${PACKAGE_NAME}.tar.gz"
echo "大小: ${ARCHIVE_SIZE}"
echo "版本: v${VERSION}"
echo "构建时间: ${BUILD_DATE}"
echo ""
echo "包含的文件:"
echo "- 完整源码 (src/)"
echo "- 前端文件 (public/, views/)"
echo "- 配置文件 (config.ts, package.json)"
echo "- 数据库文件 (database.sql, user.sql)"
echo "- 脚本文件 (scripts/)"
echo "- 文档 (docs/)"
echo "- 测试文件 (tests/)"
echo ""
echo "排除的文件:"
echo "- node_modules/"
echo "- 录制文件 (recordings/)"
echo "- 日志文件 (logs/)"
echo "- 临时文件 (temp/)"
echo "- 旧代码 (trash/)"
echo "- 其他临时文件" 