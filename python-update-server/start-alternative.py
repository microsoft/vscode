#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
替代启动方式 - 使用 uvicorn.Config
"""

import os
import sys
import asyncio
import uvicorn
from main import app, CONFIG

if __name__ == "__main__":
    print(f"启动配置: host={CONFIG['HOST']}, port={CONFIG['PORT']}")

    # 方法 1: 使用 Config 对象
    try:
        config = uvicorn.Config(
            app,
            host=CONFIG['HOST'],
            port=CONFIG['PORT'],
            log_level="info",
            access_log=True,
            loop="asyncio"
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        print(f"启动失败: {e}")
        import traceback
        traceback.print_exc()
