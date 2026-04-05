#!/bin/bash

# TSCode Welcome Page 测试脚本

echo "========================================="
echo "TSCode Welcome Page 测试脚本"
echo "========================================="
echo ""

# 1. 检查编译输出文件是否存在
echo "1. 检查编译输出文件..."
if [ -f "out/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcome.js" ]; then
    echo "   ✓ tscodeWelcome.js 存在"
else
    echo "   ✗ tscodeWelcome.js 不存在 - 需要重新编译"
    exit 1
fi

if [ -f "out/vs/workbench/contrib/welcomeGettingStarted/browser/tscodeWelcomeInput.js" ]; then
    echo "   ✓ tscodeWelcomeInput.js 存在"
else
    echo "   ✗ tscodeWelcomeInput.js 不存在 - 需要重新编译"
    exit 1
fi

echo ""

# 2. 检查关键代码是否存在
echo "2. 检查关键代码..."

if grep -q "tscodeWelcomePage" "out/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.js"; then
    echo "   ✓ startupPage.js 包含 tscodeWelcomePage"
else
    echo "   ✗ startupPage.js 不包含 tscodeWelcomePage"
    exit 1
fi

if grep -q "TscodeWelcomePage" "out/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.js"; then
    echo "   ✓ gettingStarted.contribution.js 包含 TscodeWelcomePage"
else
    echo "   ✗ gettingStarted.contribution.js 不包含 TscodeWelcomePage"
    exit 1
fi

echo ""

# 3. 检查配置文件
echo "3. 检查用户配置..."
CONFIG_FILE="$HOME/.vscode-oss-dev/User/settings.json"

if [ -f "$CONFIG_FILE" ]; then
    if grep -q "tscodeWelcomePage" "$CONFIG_FILE"; then
        echo "   ✓ settings.json 包含 tscodeWelcomePage 配置"
        echo "   当前配置："
        grep "startupEditor" "$CONFIG_FILE" | head -1
    else
        echo "   ⚠ settings.json 不包含 tscodeWelcomePage 配置"
        echo "   请添加: \"workbench.startupEditor\": \"tscodeWelcomePage\""
    fi
else
    echo "   ⚠ settings.json 不存在"
    echo "   请在 VS Code 中设置 workbench.startupEditor"
fi

echo ""

# 4. 检查是否有运行的实例
echo "4. 检查运行的实例..."
RUNNING=$(ps aux | grep -i "code-oss-dev" | grep -v grep | wc -l)
if [ $RUNNING -gt 0 ]; then
    echo "   ⚠ 发现 $RUNNING 个运行的实例"
    echo "   建议关闭所有实例后重新启动"
else
    echo "   ✓ 没有运行的实例"
fi

echo ""

# 5. 提供启动命令
echo "========================================="
echo "测试步骤："
echo "========================================="
echo ""
echo "1. 如果有运行的实例，请先关闭所有窗口"
echo ""
echo "2. 清除缓存（可选）："
echo "   rm -rf ~/.vscode-oss-dev"
echo ""
echo "3. 启动应用："
echo "   ./scripts/code.sh"
echo ""
echo "4. 打开开发者工具："
echo "   Help > Toggle Developer Tools"
echo ""
echo "5. 在 Console 中查找以下日志："
echo "   - [TSCode Debug] run() called"
echo "   - [TSCode Debug] isStartupPageEnabled: true"
echo "   - [TSCode Debug] startupEditorSetting.value: tscodeWelcomePage"
echo "   - [TSCode Debug] Opening TSCode Welcome"
echo ""
echo "6. 如果看不到日志，请添加调试代码（参考 TSCODE_WELCOME_TEST.md）"
echo ""
echo "========================================="
