#!/bin/bash
# 启动脚本

set -e

echo "=================================="
echo "VS Code 更新服务器启动脚本"
echo "=================================="

# 检查 Python 版本
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python 版本: $python_version"

# 检查是否安装了依赖
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

echo "激活虚拟环境..."
source venv/bin/activate

echo "安装/更新依赖..."
pip install -r requirements.txt

# 创建必要的目录
mkdir -p packages

# 检查配置文件
if [ ! -f "versions-config.json" ]; then
    echo "警告: versions-config.json 不存在"
fi

# 加载环境变量
if [ -f ".env" ]; then
    echo "加载环境变量..."
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "=================================="
echo "启动服务器..."
echo "=================================="

# 启动服务器
python main.py
