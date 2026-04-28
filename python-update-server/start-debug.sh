#!/bin/bash
# 调试启动脚本

echo "=========================================="
echo "系统诊断"
echo "=========================================="

# 检查 hostname 解析
echo "1. 检查 hostname:"
hostname
echo ""

# 检查 /etc/hosts
echo "2. 检查 /etc/hosts:"
cat /etc/hosts | grep -E "127.0.0.1|localhost"
echo ""

# 检查网络接口
echo "3. 检查网络接口:"
ip addr show | grep -E "inet |lo:"
echo ""

# 检查 DNS 解析
echo "4. 测试 DNS 解析:"
getent hosts localhost
getent hosts 127.0.0.1
echo ""

# 检查端口占用
echo "5. 检查端口 8002 是否被占用:"
netstat -tuln | grep 8002 || echo "端口 8002 未被占用"
echo ""

echo "=========================================="
echo "启动服务器"
echo "=========================================="

# 启动服务器
python3 main.py
