#!/bin/bash

# WebRTC SSL证书生成脚本
# 用于生成根CA和服务器证书，适合内网测试

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

# 检查OpenSSL是否安装
check_openssl() {
    if ! command -v openssl &> /dev/null; then
        print_error "OpenSSL未安装，请先安装OpenSSL"
        exit 1
    fi
    print_info "OpenSSL版本: $(openssl version)"
}

# 获取本机IP地址
get_local_ips() {
    local ips=""
    
    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ips=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | tr '\n' ',' | sed 's/,$//')
    # Linux
    else
        ips=$(hostname -I | tr ' ' ',' | sed 's/,$//')
    fi
    
    echo "$ips"
}

# 生成根CA证书
generate_ca_certificate() {
    local cert_dir="ssl"
    local ca_key="$cert_dir/ca.key"
    local ca_cert="$cert_dir/ca.crt"

    print_info "生成根CA证书..."

    # 生成CA私钥
    openssl genrsa -out "$ca_key" 4096

    # 生成CA证书
    openssl req -new -x509 -days 3650 -key "$ca_key" -out "$ca_cert" \
        -subj "/C=CN/ST=Beijing/L=Beijing/O=WebRTC Test CA/OU=Certificate Authority/CN=WebRTC Test Root CA" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,cRLSign" \
        -addext "subjectKeyIdentifier=hash"

    # 设置文件权限
    chmod 600 "$ca_key"
    chmod 644 "$ca_cert"

    print_success "根CA证书生成完成！"
    print_info "CA私钥: $ca_key"
    print_info "CA证书: $ca_cert"
}

# 生成服务器证书配置文件
create_server_cert_config() {
    local cert_dir="ssl"
    local config_file="$cert_dir/server.conf"

    # 获取本机IP地址
    local_ips=$(get_local_ips)

    # 构建SAN扩展
    local san_section="DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = 127.0.0.1
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0"

    local counter=3
    # 添加本机IP到SAN
    if [[ -n "$local_ips" ]]; then
        IFS=',' read -ra IP_ARRAY <<< "$local_ips"
        for ip in "${IP_ARRAY[@]}"; do
            if [[ -n "$ip" ]]; then
                san_section="$san_section
IP.$counter = $ip"
                ((counter++))
            fi
        done
    fi

    # 添加常用内网IP段
    san_section="$san_section
IP.$counter = 192.168.1.1"
    ((counter++))
    san_section="$san_section
IP.$counter = 192.168.0.1"
    ((counter++))
    san_section="$san_section
IP.$counter = 10.0.0.1"
    ((counter++))
    san_section="$san_section
IP.$counter = 172.16.0.1"

    # 创建配置文件
    cat > "$config_file" << EOF
[req]
default_bits = 2048
prompt = no
distinguished_name = req_distinguished_name
req_extensions = v3_req

[req_distinguished_name]
C = CN
ST = Beijing
L = Beijing
O = WebRTC Test
OU = IT Department
CN = localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
$san_section
EOF

    print_info "服务器证书配置文件已创建: $config_file"
}

# 生成服务器证书
generate_server_certificate() {
    local cert_dir="ssl"
    local ca_key="$cert_dir/ca.key"
    local ca_cert="$cert_dir/ca.crt"
    local server_key="$cert_dir/private.key"
    local server_csr="$cert_dir/server.csr"
    local server_cert="$cert_dir/cert.crt"
    local config_file="$cert_dir/server.conf"

    print_info "生成服务器证书..."

    # 生成服务器私钥
    openssl genrsa -out "$server_key" 2048

    # 生成证书签名请求
    openssl req -new -key "$server_key" -out "$server_csr" -config "$config_file"

    # 使用CA签发服务器证书
    openssl x509 -req -in "$server_csr" -CA "$ca_cert" -CAkey "$ca_key" \
        -CAcreateserial -out "$server_cert" -days 365 \
        -extensions v3_req -extfile "$config_file"

    # 清理临时文件
    rm -f "$server_csr"

    # 设置文件权限
    chmod 600 "$server_key"
    chmod 644 "$server_cert"

    print_success "服务器证书生成完成！"
    print_info "服务器私钥: $server_key"
    print_info "服务器证书: $server_cert"
}

# 生成完整的证书链
generate_certificate() {
    local cert_dir="ssl"

    # 创建ssl目录
    mkdir -p "$cert_dir"

    # 备份现有证书
    if [[ -f "$cert_dir/cert.crt" ]]; then
        print_warning "发现现有证书，正在备份..."
        backup_suffix="backup.$(date +%Y%m%d_%H%M%S)"
        [[ -f "$cert_dir/ca.crt" ]] && cp "$cert_dir/ca.crt" "$cert_dir/ca.crt.$backup_suffix"
        [[ -f "$cert_dir/ca.key" ]] && cp "$cert_dir/ca.key" "$cert_dir/ca.key.$backup_suffix"
        cp "$cert_dir/cert.crt" "$cert_dir/cert.crt.$backup_suffix"
        cp "$cert_dir/private.key" "$cert_dir/private.key.$backup_suffix"
    fi

    # 获取本机IP地址
    local_ips=$(get_local_ips)
    print_info "检测到的本机IP地址: $local_ips"

    # 生成证书链
    generate_ca_certificate
    create_server_cert_config
    generate_server_certificate
}

# 验证证书
verify_certificate() {
    local ca_cert="ssl/ca.crt"
    local certificate="ssl/cert.crt"

    if [[ ! -f "$certificate" ]]; then
        print_error "证书文件不存在: $certificate"
        return 1
    fi

    print_info "验证证书信息..."

    # 显示CA证书信息
    if [[ -f "$ca_cert" ]]; then
        echo
        print_info "根CA证书信息:"
        openssl x509 -in "$ca_cert" -noout -subject
        print_info "CA证书有效期:"
        openssl x509 -in "$ca_cert" -noout -dates
    fi

    # 显示服务器证书基本信息
    echo
    print_info "服务器证书主题信息:"
    openssl x509 -in "$certificate" -noout -subject

    print_info "服务器证书有效期:"
    openssl x509 -in "$certificate" -noout -dates

    print_info "证书SAN扩展:"
    openssl x509 -in "$certificate" -noout -text | grep -A 5 "Subject Alternative Name" || print_warning "未找到SAN扩展"

    # 验证证书链
    if [[ -f "$ca_cert" ]]; then
        print_info "验证证书链..."
        if openssl verify -CAfile "$ca_cert" "$certificate" > /dev/null 2>&1; then
            print_success "证书链验证成功 ✓"
        else
            print_error "证书链验证失败 ✗"
            return 1
        fi
    fi

    # 验证证书和私钥匹配
    cert_hash=$(openssl x509 -in ssl/cert.crt -noout -modulus | openssl md5)
    key_hash=$(openssl rsa -in ssl/private.key -noout -modulus | openssl md5)

    if [[ "$cert_hash" == "$key_hash" ]]; then
        print_success "证书和私钥匹配 ✓"
    else
        print_error "证书和私钥不匹配 ✗"
        return 1
    fi
}

# 显示CA证书安装指导
show_ca_installation_guide() {
    echo
    print_success "🔐 为了让浏览器完全信任证书，请安装根CA证书到系统信任列表："
    echo

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        print_info "📱 macOS 安装步骤:"
        echo "1. 双击 ssl/ca.crt 文件"
        echo "2. 在钥匙串访问中找到 'WebRTC Test Root CA'"
        echo "3. 双击证书，展开'信任'部分"
        echo "4. 将'使用此证书时'设置为'始终信任'"
        echo "5. 关闭窗口并输入密码确认"
        echo
        print_info "或者使用命令行:"
        echo "sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ssl/ca.crt"
    else
        # Linux
        print_info "🐧 Linux 安装步骤:"
        echo "Ubuntu/Debian:"
        echo "sudo cp ssl/ca.crt /usr/local/share/ca-certificates/webrtc-test-ca.crt"
        echo "sudo update-ca-certificates"
        echo
        echo "CentOS/RHEL/Fedora:"
        echo "sudo cp ssl/ca.crt /etc/pki/ca-trust/source/anchors/webrtc-test-ca.crt"
        echo "sudo update-ca-trust"
        echo
        echo "Firefox (需要单独添加):"
        echo "1. 打开 Firefox 设置 -> 隐私与安全 -> 证书 -> 查看证书"
        echo "2. 点击'证书颁发机构' -> '导入'"
        echo "3. 选择 ssl/ca.crt 文件"
        echo "4. 勾选'信任此CA来标识网站'"
    fi

    echo
    print_info "🌐 Windows 安装步骤:"
    echo "1. 双击 ssl/ca.crt 文件"
    echo "2. 点击'安装证书'"
    echo "3. 选择'本地计算机' -> 下一步"
    echo "4. 选择'将所有的证书都放入下列存储' -> 浏览"
    echo "5. 选择'受信任的根证书颁发机构' -> 确定"
    echo "6. 完成安装"
}

# 显示使用说明
show_usage_instructions() {
    echo
    print_success "🎉 SSL证书生成完成！"
    echo
    print_info "📁 生成的文件:"
    echo "   - ssl/ca.crt      (根CA证书 - 需要安装到系统)"
    echo "   - ssl/ca.key      (根CA私钥 - 请妥善保管)"
    echo "   - ssl/cert.crt    (服务器证书)"
    echo "   - ssl/private.key (服务器私钥)"
    echo

    show_ca_installation_guide

    echo
    print_info "🚀 启动应用后，可以访问以下地址:"
    echo "   - https://localhost:7080"
    echo "   - https://127.0.0.1:7080"

    # 显示本机IP访问地址
    local_ips=$(get_local_ips)
    if [[ -n "$local_ips" ]]; then
        IFS=',' read -ra IP_ARRAY <<< "$local_ips"
        for ip in "${IP_ARRAY[@]}"; do
            if [[ -n "$ip" ]]; then
                echo "   - https://$ip:7080"
            fi
        done
    fi

    echo
    print_success "✅ 安装CA证书后，浏览器将显示绿色锁图标，不再有安全警告！"
    echo
    print_warning "⚠️  注意事项:"
    echo "- CA私钥(ca.key)请妥善保管，不要泄露"
    echo "- 此证书仅用于开发测试，生产环境请使用正式CA签发的证书"
    echo "- 如需重新生成，请先从系统中删除旧的CA证书"
}

# 主函数
main() {
    echo "========================================"
    echo "    WebRTC SSL证书生成工具"
    echo "========================================"
    echo
    
    check_openssl
    generate_certificate
    verify_certificate
    show_usage_instructions
}

# 运行主函数
main "$@"
