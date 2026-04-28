#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VS Code 更新服务器 - FastAPI 实现
Python 3.7+ 兼容版本
自动从 packages 目录扫描版本信息
"""

import os
import sys
import json
import hashlib
import logging
import glob
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
import uvicorn

# 配置日志 - 简化版本，避免编码问题
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# 配置
CONFIG = {
    'HOST': os.getenv('HOST', '0.0.0.0'),
    'PORT': int(os.getenv('PORT', 8002)),  # 改为 8002 端口
    'BASE_URL': os.getenv('BASE_URL', 'http://127.0.0.1:8002'),  # 更新基础 URL
    'PACKAGES_DIR': os.getenv('PACKAGES_DIR', './packages'),
    'MAX_UPLOAD_SIZE': 5 * 1024 * 1024 * 1024,  # 5GB
}

# 创建 FastAPI 应用
app = FastAPI(
    title="VS Code Update Server",
    description="生产级 VS Code 更新服务器 - 自动扫描版本",
    version="1.0.0"
)

# 添加中间件
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 版本配置缓存
versions_config: Dict[str, Any] = {}
packages_last_scan: Optional[float] = None


class UpdateInfo(BaseModel):
    """更新信息模型"""
    url: str
    name: str
    version: str
    productVersion: str
    hash: str = ""
    timestamp: int
    supportsFastUpdate: bool = True


def detect_platform_from_filename(filename: str) -> Optional[str]:
    """
    从文件名推断平台
    """
    filename_lower = filename.lower()

    # Windows
    if filename_lower.endswith('.exe'):
        if 'arm64' in filename_lower:
            return 'win32-arm64-user'
        else:
            return 'win32-x64-user'

    # macOS
    elif filename_lower.endswith('.dmg'):
        if 'arm64' in filename_lower or 'apple-silicon' in filename_lower:
            return 'darwin-arm64'
        else:
            return 'darwin-x64'

    # Linux
    elif filename_lower.endswith(('.deb', '.rpm', '.appimage')):
        if 'arm64' in filename_lower or 'aarch64' in filename_lower:
            return 'linux-arm64'
        elif 'arm' in filename_lower or 'armhf' in filename_lower:
            return 'linux-arm'
        else:
            return 'linux-x64'

    # 压缩包 - 需要更多信息判断
    elif filename_lower.endswith(('.zip', '.tar.gz')):
        if 'win' in filename_lower or 'windows' in filename_lower:
            return 'win32-x64-archive'
        elif 'darwin' in filename_lower or 'mac' in filename_lower:
            return 'darwin-x64'
        elif 'linux' in filename_lower:
            return 'linux-x64'

    return None


def calculate_file_hash(file_path: Path) -> str:
    """计算文件的 SHA256 hash"""
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            # 分块读取，避免大文件占用过多内存
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        logger.error(f"计算文件 hash 失败: {e}")
        return ""


def scan_packages_directory() -> Dict[str, Any]:
    """
    扫描 packages 目录，自动生成版本配置
    从 product.json 读取 commit 和 version
    从文件名获取 filename
    """
    global versions_config, packages_last_scan

    packages_dir = Path(CONFIG['PACKAGES_DIR'])

    if not packages_dir.exists():
        logger.warning(f"packages 目录不存在: {packages_dir}")
        return {}

    # 检查目录是否有变化
    try:
        current_mtime = packages_dir.stat().st_mtime
        if packages_last_scan is not None and current_mtime <= packages_last_scan:
            # 目录未变化，返回缓存
            return versions_config
    except Exception:
        pass

    logger.info("扫描 packages 目录...")
    new_config = {}

    # 查找 product.json
    product_json_path = packages_dir / 'product.json'

    if not product_json_path.exists():
        logger.error(f"未找到 product.json: {product_json_path}")
        logger.error("请将 product.json 文件放到 packages 目录中")
        return versions_config  # 返回旧配置

    try:
        # 读取 product.json
        with open(product_json_path, 'r', encoding='utf-8') as f:
            product_info = json.load(f)

        commit = product_info.get('commit', '')
        version = product_info.get('version', '')
        quality = product_info.get('quality', 'stable')

        if not commit or not version:
            logger.error(f"product.json 缺少必要字段: commit={commit}, version={version}")
            return versions_config

        logger.info(f"从 product.json 读取: version={version}, commit={commit}, quality={quality}")

        # 扫描安装包文件
        # 支持的文件扩展名
        extensions = ['*.exe', '*.dmg', '*.deb', '*.rpm', '*.AppImage', '*.zip', '*.tar.gz']

        found_files: List[Path] = []
        for ext in extensions:
            found_files.extend(packages_dir.glob(ext))

        # 排除 product.json
        found_files = [f for f in found_files if f.name != 'product.json']

        if not found_files:
            logger.warning(f"未在 {packages_dir} 中找到安装包文件")
            logger.warning(f"支持的文件类型: {', '.join(extensions)}")
            return versions_config

        logger.info(f"找到 {len(found_files)} 个安装包文件")

        # 为每个文件生成配置
        for file_path in found_files:
            filename = file_path.name

            # 根据文件名推断平台
            platform = detect_platform_from_filename(filename)

            if not platform:
                logger.warning(f"无法识别平台: {filename}")
                continue

            # 计算文件 hash
            logger.info(f"  计算 {filename} 的 hash...")
            file_hash = calculate_file_hash(file_path)

            # 生成配置键
            version_key = f"{platform}/{quality}"

            new_config[version_key] = {
                'version': version,
                'commit': commit,
                'filename': filename,
                'hash': file_hash,
                'supportsFastUpdate': True,
                'fileSize': file_path.stat().st_size,
                'lastModified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
            }

            logger.info(f"  → {version_key}: {filename} ({file_path.stat().st_size} bytes, hash: {file_hash[:16]}...)")

        if new_config:
            versions_config = new_config
            packages_last_scan = datetime.now().timestamp()
            logger.info(f"版本配置已更新: {len(new_config)} 个版本")
        else:
            logger.warning("未生成任何版本配置")

        return versions_config

    except Exception as e:
        logger.error(f"扫描 packages 目录失败: {e}", exc_info=True)
        return versions_config


@app.on_event("startup")
async def startup_event():
    """启动时初始化"""
    logger.info("=" * 60)
    logger.info("VS Code 更新服务器启动中...")
    logger.info(f"主机: {CONFIG['HOST']}:{CONFIG['PORT']}")
    logger.info(f"基础 URL: {CONFIG['BASE_URL']}")
    logger.info(f"安装包目录: {CONFIG['PACKAGES_DIR']}")

    # 创建必要的目录
    Path(CONFIG['PACKAGES_DIR']).mkdir(parents=True, exist_ok=True)

    # 扫描 packages 目录
    scan_packages_directory()
    logger.info("=" * 60)


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "VS Code Update Server",
        "version": "1.0.0",
        "status": "running",
        "mode": "auto-scan",
        "endpoints": {
            "health": "/health",
            "update_check": "/api/update/{platform}/{quality}/{commit}",
            "download": "/download/{filename}",
            "versions": "/versions",
            "rescan": "/admin/rescan"
        }
    }


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/api/update/{platform}/{quality}/{commit}")
async def check_update(
    platform: str,
    quality: str,
    commit: str,
    request: Request
):
    """
    检查更新

    Args:
        platform: 平台标识，如 win32-x64-user
        quality: 质量通道，如 stable, insider
        commit: 当前版本的 commit hash
    """
    logger.info(f"更新检查: platform={platform}, quality={quality}, commit={commit}")

    # 重新扫描目录（支持热更新）
    config = scan_packages_directory()

    # 构建版本键
    version_key = f"{platform}/{quality}"

    # 查找对应的版本配置
    if version_key not in config:
        logger.info(f"  → 未找到版本配置: {version_key}")
        logger.info(f"  → 可用的版本: {list(config.keys())}")
        return Response(status_code=204)  # No Content

    latest_version = config[version_key]

    # 检查是否已是最新版本
    if commit == latest_version.get('commit'):
        logger.info(f"  → 已是最新版本 (204)")
        return Response(status_code=204)

    # 构建更新信息
    filename = latest_version.get('filename')
    update_info = UpdateInfo(
        url=f"{CONFIG['BASE_URL']}/download/{filename}",
        name=latest_version.get('version', ''),
        version=latest_version.get('commit', ''),
        productVersion=latest_version.get('version', ''),
        hash=latest_version.get('hash', ''),
        timestamp=int(datetime.now().timestamp() * 1000),
        supportsFastUpdate=latest_version.get('supportsFastUpdate', True)
    )

    logger.info(f"  → 发现更新: {latest_version.get('version')}")
    return update_info


@app.get("/download/{filename}")
async def download_file(filename: str, request: Request):
    """
    下载安装包

    Args:
        filename: 文件名
    """
    logger.info(f"下载请求: {filename}")

    # 安全检查：防止路径遍历攻击
    if '..' in filename or '/' in filename or '\\' in filename:
        logger.warning(f"  → 非法文件名: {filename}")
        raise HTTPException(status_code=403, detail="非法的文件名")

    # 构建文件路径
    file_path = Path(CONFIG['PACKAGES_DIR']) / filename

    # 检查文件是否存在
    if not file_path.exists() or not file_path.is_file():
        logger.warning(f"  → 文件不存在: {file_path}")
        raise HTTPException(status_code=404, detail="文件不存在")

    # 检查文件扩展名（安全限制）
    allowed_extensions = {'.exe', '.dmg', '.deb', '.rpm', '.appimage', '.zip', '.tar.gz'}
    if file_path.suffix.lower() not in allowed_extensions:
        logger.warning(f"  → 不允许的文件类型: {file_path.suffix}")
        raise HTTPException(status_code=403, detail="不允许的文件类型")

    logger.info(f"  → 开始传输: {file_path.name} ({file_path.stat().st_size} bytes)")

    # 返回文件
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type='application/octet-stream',
        headers={
            'Cache-Control': 'public, max-age=604800, immutable',
            'Accept-Ranges': 'bytes'
        }
    )


@app.get("/versions")
async def list_versions():
    """列出所有可用版本"""
    config = scan_packages_directory()
    return {
        "versions": config,
        "count": len(config),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/admin/rescan")
async def rescan_packages(request: Request):
    """
    重新扫描 packages 目录（管理接口）
    生产环境建议添加认证
    """
    global packages_last_scan
    packages_last_scan = None  # 强制重新扫描
    config = scan_packages_directory()

    return {
        "status": "success",
        "message": "packages 目录已重新扫描",
        "versions_count": len(config),
        "versions": config
    }


@app.get("/admin/calculate-hash/{filename}")
async def calculate_hash(filename: str):
    """
    计算文件 hash（管理接口）
    生产环境建议添加认证
    """
    # 安全检查
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=403, detail="非法的文件名")

    file_path = Path(CONFIG['PACKAGES_DIR']) / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    logger.info(f"计算文件 hash: {filename}")
    file_hash = calculate_file_hash(file_path)

    return {
        "filename": filename,
        "hash": file_hash,
        "algorithm": "sha256",
        "size": file_path.stat().st_size
    }


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """404 错误处理"""
    return JSONResponse(
        status_code=404,
        content={"detail": "资源不存在"}
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """500 错误处理"""
    logger.error(f"内部错误: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "内部服务器错误"}
    )


if __name__ == "__main__":
    # 运行服务器
    try:
        logger.info(f"尝试启动服务器: host={CONFIG['HOST']}, port={CONFIG['PORT']}")
        uvicorn.run(
            app,  # 直接传递 app 对象，避免字符串导入可能的 DNS 问题
            host=CONFIG['HOST'],
            port=CONFIG['PORT'],
            log_level="info",
            access_log=True,
            reload=False  # 生产环境设置为 False
        )
    except Exception as e:
        logger.error(f"启动失败: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
