#!/bin/bash

# CA证书安装脚本
# 用于将WebRTC Test Root CA安装到系统信任列表

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查CA证书文件
check_ca_cert() {
    local ca_cert="ssl/ca.crt"
    
    if [[ ! -f "$ca_cert" ]]; then
        print_error "CA证书文件不存在: $ca_cert"
        print_info "请先运行 ./generate_ssl_cert.sh 生成证书"
        exit 1
    fi
    
    print_info "找到CA证书文件: $ca_cert"
    
    # 显示证书信息
    print_info "CA证书信息:"
    openssl x509 -in "$ca_cert" -noout -subject -dates
}

# macOS安装CA证书
install_ca_macos() {
    local ca_cert="ssl/ca.crt"
    
    print_info "在macOS上安装CA证书..."
    
    # 方法1: 使用security命令安装到系统钥匙串
    print_info "尝试安装到系统钥匙串..."
    if sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$ca_cert"; then
        print_success "CA证书已成功安装到系统钥匙串！"
        return 0
    else
        print_warning "自动安装失败，请手动安装"
        
        # 方法2: 手动安装指导
        echo
        print_info "手动安装步骤:"
        echo "1. 双击 ssl/ca.crt 文件"
        echo "2. 在钥匙串访问中找到 'WebRTC Test Root CA'"
        echo "3. 双击证书，展开'信任'部分"
        echo "4. 将'使用此证书时'设置为'始终信任'"
        echo "5. 关闭窗口并输入密码确认"
        
        # 打开证书文件
        print_info "正在打开证书文件..."
        open "$ca_cert"
        
        return 1
    fi
}

# Linux安装CA证书
install_ca_linux() {
    local ca_cert="ssl/ca.crt"
    
    print_info "在Linux上安装CA证书..."
    
    # 检测Linux发行版
    if [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        print_info "检测到Debian/Ubuntu系统"
        sudo cp "$ca_cert" /usr/local/share/ca-certificates/webrtc-test-ca.crt
        sudo update-ca-certificates
        print_success "CA证书已安装到系统信任列表"
        
    elif [[ -f /etc/redhat-release ]]; then
        # CentOS/RHEL/Fedora
        print_info "检测到RedHat系列系统"
        sudo cp "$ca_cert" /etc/pki/ca-trust/source/anchors/webrtc-test-ca.crt
        sudo update-ca-trust
        print_success "CA证书已安装到系统信任列表"
        
    else
        print_warning "未识别的Linux发行版，请手动安装"
        print_info "通用安装方法:"
        echo "1. 将 ssl/ca.crt 复制到系统CA目录"
        echo "2. 更新CA信任列表"
        return 1
    fi
    
    # Firefox需要单独安装
    print_warning "Firefox浏览器需要单独安装CA证书:"
    echo "1. 打开 Firefox 设置 -> 隐私与安全 -> 证书 -> 查看证书"
    echo "2. 点击'证书颁发机构' -> '导入'"
    echo "3. 选择 ssl/ca.crt 文件"
    echo "4. 勾选'信任此CA来标识网站'"
}

# 验证安装
verify_installation() {
    print_info "验证CA证书安装..."
    
    # 检查系统是否信任我们的CA
    if openssl verify -CApath /etc/ssl/certs ssl/cert.crt > /dev/null 2>&1 || \
       openssl verify -CAfile ssl/ca.crt ssl/cert.crt > /dev/null 2>&1; then
        print_success "CA证书安装验证成功！"
        return 0
    else
        print_warning "无法验证CA证书安装状态"
        return 1
    fi
}

# 显示测试说明
show_test_instructions() {
    echo
    print_success "🎉 CA证书安装完成！"
    echo
    print_info "🧪 测试步骤:"
    echo "1. 启动你的WebRTC应用"
    echo "2. 在浏览器中访问 https://localhost:7080"
    echo "3. 如果看到绿色锁图标，说明证书安装成功！"
    echo
    print_info "🔍 如果仍有安全警告:"
    echo "- 重启浏览器"
    echo "- 清除浏览器缓存"
    echo "- 检查证书是否正确安装在系统信任列表中"
    echo
    print_warning "⚠️  卸载说明:"
    echo "如需卸载CA证书，请在系统钥匙串/证书管理器中删除 'WebRTC Test Root CA'"
}

# 主函数
main() {
    echo "========================================"
    echo "    CA证书安装工具"
    echo "========================================"
    echo
    
    check_ca_cert
    
    # 根据操作系统选择安装方法
    if [[ "$OSTYPE" == "darwin"* ]]; then
        install_ca_macos
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        install_ca_linux
    else
        print_error "不支持的操作系统: $OSTYPE"
        print_info "请手动安装CA证书到系统信任列表"
        exit 1
    fi
    
    verify_installation
    show_test_instructions
}

# 运行主函数
main "$@"
