#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 uvicorn 启动 - 最小化版本
"""

import uvicorn
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok"}

if __name__ == "__main__":
    print("测试 1: 使用 0.0.0.0")
    try:
        uvicorn.run(app, host="0.0.0.0", port=8002)
    except Exception as e:
        print(f"失败: {e}")
        import traceback
        traceback.print_exc()
