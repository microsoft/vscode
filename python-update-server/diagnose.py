#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
诊断脚本 - 检查 packages 目录和 product.json
"""

import os
import sys
from pathlib import Path

# 获取配置
PACKAGES_DIR = os.getenv('PACKAGES_DIR', './packages')

print("=" * 60)
print("诊断信息")
print("=" * 60)

# 1. 检查当前工作目录
print(f"\n1. 当前工作目录: {os.getcwd()}")

# 2. 检查 PACKAGES_DIR 配置
print(f"\n2. PACKAGES_DIR 配置: {PACKAGES_DIR}")

# 3. 转换为 Path 对象
packages_dir = Path(PACKAGES_DIR)
print(f"   绝对路径: {packages_dir.resolve()}")

# 4. 检查目录是否存在
print(f"\n3. packages 目录存在: {packages_dir.exists()}")
if packages_dir.exists():
    print(f"   是否为目录: {packages_dir.is_dir()}")

    # 5. 列出目录内容
    print(f"\n4. 目录内容:")
    try:
        for item in packages_dir.iterdir():
            print(f"   - {item.name} ({'目录' if item.is_dir() else '文件'})")
    except Exception as e:
        print(f"   错误: {e}")

    # 6. 检查 product.json
    product_json_path = packages_dir / 'product.json'
    print(f"\n5. product.json 路径: {product_json_path}")
    print(f"   存在: {product_json_path.exists()}")

    if product_json_path.exists():
        print(f"   是文件: {product_json_path.is_file()}")
        print(f"   大小: {product_json_path.stat().st_size} bytes")
        print(f"   权限: {oct(product_json_path.stat().st_mode)}")

        # 7. 尝试读取
        print(f"\n6. 尝试读取 product.json:")
        try:
            with open(product_json_path, 'r', encoding='utf-8') as f:
                import json
                data = json.load(f)
                print(f"   ✓ 读取成功")
                print(f"   version: {data.get('version', 'N/A')}")
                print(f"   commit: {data.get('commit', 'N/A')}")
                print(f"   quality: {data.get('quality', 'N/A')}")
        except Exception as e:
            print(f"   ✗ 读取失败: {e}")
    else:
        # 检查是否有大小写问题
        print(f"\n   检查大小写问题:")
        try:
            for item in packages_dir.iterdir():
                if item.name.lower() == 'product.json':
                    print(f"   ! 找到文件但大小写不同: {item.name}")
        except Exception as e:
            print(f"   错误: {e}")

else:
    print(f"   目录不存在!")

print("\n" + "=" * 60)
