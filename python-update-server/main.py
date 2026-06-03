#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VS Code 更新服务器 - FastAPI 实现
Python 3.7+ 兼容版本
自动从 packages 目录扫描版本信息
支持灰度发布（Gradual Rollout）
"""

import os
import sys
import json
import hashlib
import logging
import glob
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Response, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# 加载 .env 文件
try:
    from dotenv import load_dotenv
    # 加载当前目录的 .env 文件
    env_path = Path(__file__).parent / '.env'
    load_dotenv(dotenv_path=env_path)
    print(f"✅ 已加载配置文件: {env_path}")
except ImportError:
    print("⚠️  未安装 python-dotenv，将使用环境变量或默认值")
except Exception as e:
    print(f"⚠️  加载 .env 文件失败: {e}")

# 导入灰度发布引擎
from rollout_engine import RolloutStrategyEngine

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
    'PORT': int(os.getenv('PORT', 8001)),
    'BASE_URL': os.getenv('BASE_URL', 'http://127.0.0.1:8001'),
    'PACKAGES_DIR': os.getenv('PACKAGES_DIR', './python-update-server/packages'),
    'MAX_UPLOAD_SIZE': 5 * 1024 * 1024 * 1024,  # 5GB
    'ADMIN_PASSWORD_MD5': os.getenv('ADMIN_PASSWORD_MD5', '0192023a7bbd73250516f069df18b500'),  # 默认: admin123
}

# 打印配置信息（调试用）
print("=" * 60)
print("📋 服务器配置:")
print(f"  HOST: {CONFIG['HOST']}")
print(f"  PORT: {CONFIG['PORT']}")
print(f"  BASE_URL: {CONFIG['BASE_URL']}")
print(f"  PACKAGES_DIR: {CONFIG['PACKAGES_DIR']}")
print(f"  ADMIN_PASSWORD_MD5: {CONFIG['ADMIN_PASSWORD_MD5'][:8]}... (已加密)")
print("=" * 60)

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

# 挂载静态文件目录（用于管理后台）
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    logger.info(f"静态文件目录已挂载: {static_dir}")
else:
    logger.warning(f"静态文件目录不存在: {static_dir}")

# 版本配置缓存
versions_config: Dict[str, Any] = {}
packages_last_scan: Optional[float] = None

# 灰度发布引擎
rollout_engine: Optional[RolloutStrategyEngine] = None

# 管理员认证 Token 存储（简单的内存存储）
admin_tokens: Dict[str, datetime] = {}  # token -> 过期时间


def verify_admin_token(token: str) -> bool:
    """验证管理员 Token"""
    if not token or token not in admin_tokens:
        return False

    # 检查是否过期（24小时有效期）
    if datetime.now() > admin_tokens[token]:
        del admin_tokens[token]
        return False

    return True


def generate_admin_token() -> str:
    """生成管理员 Token"""
    import secrets
    token = secrets.token_urlsafe(32)
    # Token 24小时有效
    from datetime import timedelta
    admin_tokens[token] = datetime.now() + timedelta(hours=24)
    return token


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
    同时扫描 backup 目录获取旧版本信息
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

    # 列出 packages 目录的内容
    if packages_dir.exists():
        logger.info(f"packages 目录内容:")
        for item in packages_dir.iterdir():
            logger.info(f"  - {item.name} ({'文件' if item.is_file() else '目录'})")
    # test-workbench_change end

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

        # test-workbench_change: 扫描 backup 目录获取旧版本信息
        backup_dir = packages_dir / 'backup'
        if backup_dir.exists():
            logger.info("扫描 backup 目录...")
            backup_product_json = backup_dir / 'product.json'

            if backup_product_json.exists():
                try:
                    with open(backup_product_json, 'r', encoding='utf-8') as f:
                        backup_product_info = json.load(f)

                    backup_commit = backup_product_info.get('commit', '')
                    backup_version = backup_product_info.get('version', '')
                    backup_quality = backup_product_info.get('quality', 'stable')

                    if backup_commit and backup_version:
                        logger.info(f"从 backup/product.json 读取: version={backup_version}, commit={backup_commit}")

                        # 扫描 backup 目录中的安装包
                        backup_files: List[Path] = []
                        for ext in extensions:
                            backup_files.extend(backup_dir.glob(ext))

                        backup_files = [f for f in backup_files if f.name != 'product.json']

                        if backup_files:
                            logger.info(f"找到 {len(backup_files)} 个备份安装包")

                            for file_path in backup_files:
                                filename = file_path.name
                                platform = detect_platform_from_filename(filename)

                                if not platform:
                                    continue

                                file_hash = calculate_file_hash(file_path)
                                backup_key = f"{platform}/{backup_quality}/backup"

                                versions_config[backup_key] = {
                                    'version': backup_version,
                                    'commit': backup_commit,
                                    'filename': f"backup/{filename}",
                                    'hash': file_hash,
                                    'supportsFastUpdate': True,
                                    'fileSize': file_path.stat().st_size,
                                    'lastModified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                                    'is_backup': True
                                }

                                logger.info(f"  → 备份版本: {backup_key}: {filename}")
                        else:
                            logger.warning("backup 目录中未找到安装包文件")
                    else:
                        logger.warning(f"backup/product.json 缺少必要字段")
                except Exception as e:
                    logger.error(f"读取 backup/product.json 失败: {e}")
            else:
                logger.info("backup 目录中未找到 product.json")
        else:
            logger.info("未找到 backup 目录")
        # test-workbench_change end

        return versions_config

    except Exception as e:
        logger.error(f"扫描 packages 目录失败: {e}", exc_info=True)
        return versions_config


@app.on_event("startup")
async def startup_event():
    """启动时初始化"""
    global rollout_engine

    logger.info("=" * 60)
    logger.info("VS Code 更新服务器启动中...")
    logger.info(f"主机: {CONFIG['HOST']}:{CONFIG['PORT']}")
    logger.info(f"基础 URL: {CONFIG['BASE_URL']}")
    logger.info(f"安装包目录: {CONFIG['PACKAGES_DIR']}")

    # 创建必要的目录
    Path(CONFIG['PACKAGES_DIR']).mkdir(parents=True, exist_ok=True)

    # 初始化灰度发布引擎
    # test-workbench_change: 传入 product.json 路径
    rollout_engine = RolloutStrategyEngine(
        config_path=os.path.join(CONFIG['PACKAGES_DIR'], 'rollout-config.json'),
        product_json_path=os.path.join(CONFIG['PACKAGES_DIR'], 'product.json')
    )
    logger.info("灰度发布引擎已初始化")

    # 扫描 packages 目录
    scan_packages_directory()
    logger.info("=" * 60)


@app.get("/")
async def root():
    """根路径 - 重定向到管理后台"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/static/admin.html")


@app.get("/api")
async def api_info():
    """API 信息"""
    return {
        "service": "VS Code Update Server",
        "version": "1.0.0",
        "status": "running",
        "mode": "auto-scan",
        "admin_panel": "/static/admin.html",
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


def extract_client_id(request: Request) -> Tuple[str, str]:
    """
    提取客户端唯一标识（基于 IP 地址）

    Args:
        request: FastAPI Request 对象

    Returns:
        (client_ip, client_id): 客户端 IP 和 ID（16 字符的十六进制字符串）
    """
    # 获取客户端 IP
    client_ip = request.client.host if request.client else "unknown"

    # 尝试从 X-Forwarded-For 获取真实 IP（如果有代理）
    forwarded_for = request.headers.get('X-Forwarded-For')
    if forwarded_for:
        # X-Forwarded-For 可能包含多个 IP，取第一个
        client_ip = forwarded_for.split(',')[0].strip()

    # 使用 SHA256 哈希生成客户端 ID（用于一致性哈希）
    client_id = hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    return client_ip, client_id


@app.get("/api/update/{platform}/{quality}/{commit}")
async def check_update(
    platform: str,
    quality: str,
    commit: str,
    request: Request
):
    """
    检查更新（支持灰度发布和版本回退）

    Args:
        platform: 平台标识，如 win32-x64-user
        quality: 质量通道，如 stable, insider
        commit: 当前版本的 commit hash
    """
    logger.info(f"更新检查: platform={platform}, quality={quality}, commit={commit}")

    # 提取客户端 IP 和 ID
    client_ip, client_id = extract_client_id(request)
    logger.info(f"  客户端: {client_ip}")

    # 重新扫描目录（支持热更新）
    config = scan_packages_directory()

    # 构建版本键
    version_key = f"{platform}/{quality}"
    platform_quality = version_key

    # test-workbench_change: 支持 quality 映射
    # 如果找不到对应的 quality，尝试映射到 stable
    if version_key not in config:
        # 尝试映射：test -> stable, insider -> stable
        fallback_quality = "stable"
        fallback_key = f"{platform}/{fallback_quality}"

        if fallback_key in config:
            logger.info(f"  → 未找到 {version_key}，使用 fallback: {fallback_key}")
            version_key = fallback_key
            platform_quality = fallback_key
        else:
            logger.info(f"  → 未找到版本配置: {version_key}")
            logger.info(f"  → 可用的版本: {list(config.keys())}")
            return Response(status_code=204)  # No Content
    # test-workbench_change end

    latest_version = config[version_key]

    # test-workbench_change: 版本回退机制（需要启用回滚开关）
    # 检查是否存在备份版本且回滚功能已启用
    backup_key = f"{platform}/{quality}/backup"
    backup_version = config.get(backup_key)

    if backup_version and rollout_engine and rollout_engine.is_rollback_enabled():
        logger.info(f"  → 回滚功能已启用，新版本存在问题")

        # 如果客户端的 commit 是当前最新版本（需要回退的版本）
        if commit == latest_version.get('commit'):
            logger.info(f"  → 客户端 {client_ip} 使用新版本 {commit[:8]}，推送备份版本进行回退")

            # 构建回退更新信息
            filename = backup_version.get('filename')
            rollback_info = {
                'version': backup_version.get('commit', ''),
                'productVersion': backup_version.get('version', ''),
                'url': f"{CONFIG['BASE_URL']}/download/{filename}",
                'timestamp': int(datetime.now().timestamp() * 1000),
                'sha256hash': backup_version.get('hash', '')
            }

            logger.info(f"  → 回退到版本: {backup_version.get('version')} (commit: {backup_version.get('commit')[:8]})")
            return rollback_info

        # 如果客户端已经是备份版本（旧版本），不更新
        elif commit == backup_version.get('commit'):
            logger.info(f"  → 客户端 {client_ip} 已是备份版本 {commit[:8]}，无需更新 (204)")
            return Response(status_code=204)

        # 如果客户端是其他版本，也不更新（避免更新到有问题的新版本）
        else:
            logger.info(f"  → 客户端 {client_ip} 使用其他版本 {commit[:8]}，回滚期间禁止更新 (204)")
            return Response(status_code=204)

    elif backup_version and not (rollout_engine and rollout_engine.is_rollback_enabled()):
        logger.debug(f"  → 检测到备份版本，但回滚功能未启用")
    # test-workbench_change end

    # 灰度发布决策
    target_commit = commit  # 默认保持当前版本

    if rollout_engine:
        # 使用灰度发布引擎决定目标版本
        target_commit = rollout_engine.decide_version(
            client_ip=client_ip,
            client_id=client_id,
            current_commit=commit,
            platform_quality=platform_quality
        )
    else:
        # 如果灰度引擎未初始化，使用最新版本
        target_commit = latest_version.get('commit')

    # 检查是否需要更新
    if commit == target_commit:
        logger.info(f"  → 客户端 {client_ip} 已是目标版本 (204)")
        return Response(status_code=204)

    # 构建更新信息（符合 VS Code IUpdate 接口）
    filename = latest_version.get('filename')
    update_info = {
        'version': latest_version.get('commit', ''),           # commit hash
        'productVersion': latest_version.get('version', ''),   # 版本号
        'url': f"{CONFIG['BASE_URL']}/download/{filename}",
        'timestamp': int(datetime.now().timestamp() * 1000),
        'sha256hash': latest_version.get('hash', '')           # 注意：VS Code 期望 sha256hash
    }

    logger.info(f"  → 客户端 {client_ip} 发现更新: {latest_version.get('version')}")
    return update_info


@app.get("/download/{filename:path}")
async def download_file(filename: str, request: Request):
    """
    下载安装包（支持 backup 目录）

    Args:
        filename: 文件名（可能包含 backup/ 前缀）
    """
    logger.info(f"下载请求: {filename}")

    # test-workbench_change: 支持 backup 目录
    # 检查是否是 backup 目录的文件
    if filename.startswith('backup/'):
        # 移除 backup/ 前缀，获取实际文件名
        actual_filename = filename[7:]  # 去掉 "backup/"
        file_path = Path(CONFIG['PACKAGES_DIR']) / 'backup' / actual_filename
        logger.info(f"  → 从 backup 目录下载: {actual_filename}")
    else:
        file_path = Path(CONFIG['PACKAGES_DIR']) / filename
    # test-workbench_change end

    # 安全检查：防止路径遍历攻击
    if '..' in filename:
        logger.warning(f"  → 非法文件名（包含 ..）: {filename}")
        raise HTTPException(status_code=403, detail="非法的文件名")

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
        filename=file_path.name,  # 使用实际文件名，不包含 backup/
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


# ============================================================================
# 管理员认证接口
# ============================================================================

@app.post("/api/md5")
async def generate_md5(request: Request):
    """
    生成字符串的 MD5 值（用于生成密码哈希）

    Request Body:
    {
        "text": "admin123"
    }

    Returns:
    {
        "text": "admin123",
        "md5": "0192023a7bbd73250516f069df18b500"
    }
    """
    try:
        data = await request.json()
        text = data.get('text')

        if not text:
            raise HTTPException(status_code=400, detail="缺少 text 字段")

        # 计算 MD5
        md5_hash = hashlib.md5(text.encode('utf-8')).hexdigest()

        return {
            "text": text,
            "md5": md5_hash
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成 MD5 失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/login")
async def admin_login(request: Request):
    """
    管理员登录

    Request Body:
    {
        "password": "admin123"
    }

    Returns:
    {
        "status": "success",
        "token": "xxx",
        "expires_in": 86400
    }
    """
    try:
        data = await request.json()
        password = data.get('password')

        if not password:
            raise HTTPException(status_code=400, detail="缺少密码")

        # 计算密码的 MD5
        password_md5 = hashlib.md5(password.encode('utf-8')).hexdigest()

        # 验证密码
        if password_md5 != CONFIG['ADMIN_PASSWORD_MD5']:
            logger.warning(f"管理员登录失败: 密码错误")
            raise HTTPException(status_code=401, detail="密码错误")

        # 生成 Token
        token = generate_admin_token()
        logger.info(f"管理员登录成功，Token: {token[:8]}...")

        return {
            "status": "success",
            "token": token,
            "expires_in": 86400  # 24小时
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"登录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/verify")
async def verify_admin(request: Request):
    """
    验证 Token 是否有效

    Request Body:
    {
        "token": "xxx"
    }
    """
    try:
        data = await request.json()
        token = data.get('token')

        if not token:
            raise HTTPException(status_code=400, detail="缺少 Token")

        is_valid = verify_admin_token(token)

        return {
            "valid": is_valid
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"验证失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def require_admin_auth(request: Request):
    """管理员认证依赖"""
    auth_header = request.headers.get('Authorization')

    if not auth_header:
        raise HTTPException(status_code=401, detail="未提供认证信息")

    # 支持 Bearer Token
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
    else:
        token = auth_header

    if not verify_admin_token(token):
        raise HTTPException(status_code=401, detail="认证失败或 Token 已过期")

    return True


# ============================================================================
# 管理接口（需要认证）
# ============================================================================

@app.post("/admin/rescan")
async def rescan_packages(request: Request):
    """
    重新扫描 packages 目录（管理接口）
    需要管理员认证
    """
    # 验证管理员权限
    require_admin_auth(request)

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


# ============================================================================
# 灰度发布管理 API
# ============================================================================

@app.post("/admin/rollout/config")
async def create_rollout_config(request: Request):
    """
    创建或更新灰度发布配置

    注意：target_version 和 target_commit 现在从 product.json 自动读取

    Request Body:
    {
        "platform_quality": "win32-x64-user/stable",
        "rollout_percentage": 1.0,
        "stages": [...]  // 可选
    }
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()

        platform_quality = data.get('platform_quality')
        rollout_percentage = data.get('rollout_percentage', 1.0)
        stages = data.get('stages')

        # test-workbench_change: 不再需要 target_version 和 target_commit 参数
        if not platform_quality:
            raise HTTPException(
                status_code=400,
                detail="缺少必需字段: platform_quality"
            )

        config = rollout_engine.create_rollout(
            platform_quality=platform_quality,
            rollout_percentage=rollout_percentage,
            stages=stages
        )

        # 获取从 product.json 读取的版本信息用于返回
        product_info = rollout_engine.get_product_info()

        return {
            "status": "success",
            "message": f"灰度发布配置已创建: {platform_quality}",
            "config": config.to_dict(),
            "target_version": product_info['version'],
            "target_commit": product_info['commit']
        }

    except Exception as e:
        logger.error(f"创建灰度配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/rollout/advance")
async def advance_rollout_stage(request: Request):
    """
    推进到下一阶段

    Request Body:
    {
        "platform_quality": "win32-x64-user/stable"
    }
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()
        platform_quality = data.get('platform_quality')

        if not platform_quality:
            raise HTTPException(status_code=400, detail="缺少 platform_quality 字段")

        success = rollout_engine.advance_stage(platform_quality)

        if success:
            status = rollout_engine.get_status(platform_quality)
            return {
                "status": "success",
                "message": f"已推进到阶段 {status['current_stage']}",
                "rollout_percentage": status['rollout_percentage']
            }
        else:
            return {
                "status": "failed",
                "message": "无法推进（可能已是最后阶段）"
            }

    except Exception as e:
        logger.error(f"推进阶段失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/rollout/switch-stage")
async def switch_rollout_stage(request: Request):
    """
    切换到指定阶段

    Request Body:
    {
        "platform_quality": "win32-x64-user/stable",
        "stage_index": 2
    }
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()
        platform_quality = data.get('platform_quality')
        stage_index = data.get('stage_index')

        if not platform_quality:
            raise HTTPException(status_code=400, detail="缺少 platform_quality 字段")

        if stage_index is None:
            raise HTTPException(status_code=400, detail="缺少 stage_index 字段")

        success = rollout_engine.switch_to_stage(platform_quality, stage_index)

        if success:
            status = rollout_engine.get_status(platform_quality)
            return {
                "status": "success",
                "message": f"已切换到阶段 {stage_index + 1} ({status['rollout_percentage']}%)",
                "rollout_percentage": status['rollout_percentage'],
                "current_stage": status['current_stage']
            }
        else:
            return {
                "status": "failed",
                "message": "切换失败（配置不存在或阶段索引无效）"
            }

    except Exception as e:
        logger.error(f"切换阶段失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/admin/rollout/pause")
async def pause_rollout(request: Request):
    """
    暂停或恢复灰度发布

    Request Body:
    {
        "platform_quality": "win32-x64-user/stable",
        "paused": true
    }
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()
        platform_quality = data.get('platform_quality')
        paused = data.get('paused', True)

        if not platform_quality:
            raise HTTPException(status_code=400, detail="缺少 platform_quality 字段")

        if paused:
            success = rollout_engine.pause_rollout(platform_quality)
            action = "暂停"
        else:
            success = rollout_engine.resume_rollout(platform_quality)
            action = "恢复"

        if success:
            return {
                "status": "success",
                "message": f"已{action}灰度发布: {platform_quality}"
            }
        else:
            return {
                "status": "failed",
                "message": f"未找到配置: {platform_quality}"
            }

    except Exception as e:
        logger.error(f"暂停/恢复失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))





@app.get("/admin/rollout/status/{platform_quality:path}")
async def get_rollout_status(platform_quality: str):
    """
    查询灰度发布状态

    Example: /admin/rollout/status/win32-x64-user/stable
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    status = rollout_engine.get_status(platform_quality)

    if status:
        return status
    else:
        raise HTTPException(
            status_code=404,
            detail=f"未找到配置: {platform_quality}"
        )


@app.get("/admin/rollout/list")
async def list_rollout_configs():
    """列出所有灰度发布配置"""
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    configs = {}
    for platform_quality in rollout_engine.configs.keys():
        configs[platform_quality] = rollout_engine.get_status(platform_quality)

    return {
        "configs": configs,
        "count": len(configs)
    }


@app.get("/admin/product-info")
async def get_product_info():
    """
    读取 product.json 中的版本信息

    Returns:
        {
            "gitVersion": "v1.0.3",
            "commit": "12934b91e86ec2d0537879d544ee923f6a8e1b75",
            "date": "2026-05-08T15:23:12+08:00"
        }
    """
    try:
        # test-workbench_change: 使用配置的 PACKAGES_DIR 路径
        product_json_path = Path(CONFIG['PACKAGES_DIR']) / 'product.json'

        if not product_json_path.exists():
            raise HTTPException(status_code=404, detail="product.json 文件不存在")

        with open(product_json_path, 'r', encoding='utf-8') as f:
            product_data = json.load(f)

        return {
            "gitVersion": product_data.get('gitVersion', ''),
            "commit": product_data.get('commit', ''),
            "date": product_data.get('date', ''),
            "found": True
        }
    except json.JSONDecodeError as e:
        logger.error(f"解析 product.json 失败: {e}")
        raise HTTPException(status_code=500, detail=f"解析 product.json 失败: {str(e)}")
    except Exception as e:
        logger.error(f"读取 product.json 失败: {e}")
        raise HTTPException(status_code=500, detail=f"读取 product.json 失败: {str(e)}")


@app.get("/admin/client-id")
async def get_client_id(request: Request, ip: Optional[str] = None):
    """
    查询客户端 ID

    Query Parameters:
        ip: 客户端 IP 地址（可选，不提供则使用请求者的 IP）

    Example:
        GET /admin/client-id
        GET /admin/client-id?ip=192.168.1.100
    """
    if ip:
        # 使用提供的 IP
        client_ip = ip
    else:
        # 使用请求者的 IP
        client_ip = request.client.host if request.client else "unknown"

        # 尝试从 X-Forwarded-For 获取真实 IP
        forwarded_for = request.headers.get('X-Forwarded-For')
        if forwarded_for:
            client_ip = forwarded_for.split(',')[0].strip()

    # 计算 client_id
    client_id = hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    return {
        "client_ip": client_ip,
        "client_id": client_id,
        "full_hash": hashlib.sha256(client_ip.encode()).hexdigest()
    }


@app.post("/admin/rollout/whitelist")
async def manage_whitelist(request: Request):
    """
    管理白名单（使用 IP 地址）

    Request Body:
    {
        "platform_quality": "win32-x64-user/stable",
        "ip": "192.168.1.100",
        "action": "add" | "remove"
    }
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()
        platform_quality = data.get('platform_quality')
        ip = data.get('ip')
        action = data.get('action', 'add')

        if not platform_quality:
            raise HTTPException(status_code=400, detail="缺少必需字段: platform_quality")

        if not ip:
            raise HTTPException(status_code=400, detail="缺少必需字段: ip")

        if action == 'add':
            success = rollout_engine.add_to_whitelist(platform_quality, ip)
            message = f"已添加到白名单: {ip}"
        elif action == 'remove':
            success = rollout_engine.remove_from_whitelist(platform_quality, ip)
            message = f"已从白名单移除: {ip}"
        else:
            raise HTTPException(status_code=400, detail=f"不支持的操作: {action}")

        if success:
            return {
                "status": "success",
                "message": message,
                "ip": ip
            }
        else:
            if action == 'remove':
                return {"status": "failed", "message": f"IP 不在白名单中: {ip}"}
            else:
                return {"status": "failed", "message": f"未找到配置: {platform_quality}"}

    except Exception as e:
        logger.error(f"管理白名单失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/rollout/blacklist")
async def manage_blacklist(request: Request):
    """
    管理黑名单（使用 IP 地址）

    Request Body:
    {
        "platform_quality": "win32-x64-user/stable",
        "ip": "192.168.1.100",
        "action": "add" | "remove"
    }
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()
        platform_quality = data.get('platform_quality')
        ip = data.get('ip')
        action = data.get('action', 'add')

        if not platform_quality:
            raise HTTPException(status_code=400, detail="缺少必需字段: platform_quality")

        if not ip:
            raise HTTPException(status_code=400, detail="缺少必需字段: ip")

        if action == 'add':
            success = rollout_engine.add_to_blacklist(platform_quality, ip)
            message = f"已添加到黑名单: {ip}"
        elif action == 'remove':
            success = rollout_engine.remove_from_blacklist(platform_quality, ip)
            message = f"已从黑名单移除: {ip}"
        else:
            raise HTTPException(status_code=400, detail=f"不支持的操作: {action}")

        if success:
            return {
                "status": "success",
                "message": message,
                "ip": ip
            }
        else:
            if action == 'remove':
                return {"status": "failed", "message": f"IP 不在黑名单中: {ip}"}
            else:
                return {"status": "failed", "message": f"未找到配置: {platform_quality}"}

    except Exception as e:
        logger.error(f"管理黑名单失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """404 错误处理"""
    return JSONResponse(
        status_code=404,
        content={"detail": "资源不存在"}
    )


# test-workbench_change: 版本回滚管理 API
@app.post("/admin/rollback/toggle")
async def toggle_rollback(request: Request):
    """
    启用或禁用版本回滚功能

    Request Body:
    {
        "enabled": true  // true 启用，false 禁用
    }

    说明：
    - 启用后，所有使用新版本的客户端将收到回退到备份版本的更新
    - 禁用后，回滚功能不生效，按正常灰度发布逻辑处理
    - 需要在 packages/backup 目录中准备好旧版本的文件
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        data = await request.json()
        enabled = data.get('enabled', False)

        if enabled:
            # 启用回滚
            rollout_engine.enable_rollback()

            # 检查是否存在备份版本
            config = scan_packages_directory()
            backup_keys = [k for k in config.keys() if k.endswith('/backup')]

            if not backup_keys:
                logger.warning("启用回滚功能，但未找到备份版本")
                return {
                    "status": "warning",
                    "message": "回滚功能已启用，但未找到备份版本",
                    "enabled": True,
                    "backup_versions_count": 0,
                    "note": "请确保 packages/backup 目录中有 product.json 和安装包文件"
                }

            return {
                "status": "success",
                "message": "回滚功能已启用",
                "enabled": True,
                "backup_versions_count": len(backup_keys),
                "backup_versions": backup_keys
            }
        else:
            # 禁用回滚
            rollout_engine.disable_rollback()

            return {
                "status": "success",
                "message": "回滚功能已禁用",
                "enabled": False
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"切换回滚功能失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/rollback/status")
async def get_rollback_status():
    """
    查询版本回滚状态

    返回：
    - 回滚功能是否启用
    - 当前可用的备份版本信息
    """
    if not rollout_engine:
        raise HTTPException(status_code=500, detail="灰度发布引擎未初始化")

    try:
        # 获取回滚开关状态
        is_enabled = rollout_engine.is_rollback_enabled()

        # 扫描备份版本
        config = scan_packages_directory()

        # 查找所有备份版本
        backup_versions = {}
        for key, value in config.items():
            if key.endswith('/backup'):
                platform_quality = key.replace('/backup', '')
                backup_versions[platform_quality] = {
                    'version': value.get('version'),
                    'commit': value.get('commit'),
                    'filename': value.get('filename'),
                    'fileSize': value.get('fileSize'),
                    'lastModified': value.get('lastModified')
                }

        if not backup_versions:
            return {
                "enabled": is_enabled,
                "status": "no_backup",
                "message": "未找到备份版本" if is_enabled else "回滚功能已禁用，且未找到备份版本",
                "backup_versions": {},
                "note": "要启用回滚功能，请先在 packages/backup 目录中准备备份文件"
            }

        return {
            "enabled": is_enabled,
            "status": "available" if is_enabled else "disabled",
            "message": f"回滚功能{'已启用' if is_enabled else '已禁用'}，找到 {len(backup_versions)} 个备份版本",
            "backup_versions": backup_versions
        }

    except Exception as e:
        logger.error(f"查询回退状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/upload-package")
async def upload_package(
    request: Request,
    exe_file: UploadFile = File(...),
    product_file: UploadFile = File(...)
):
    """
    上传新版本更新包

    功能：
    1. 将当前 packages 目录中的文件移动到 backup 目录
    2. 如果 backup 目录已存在，重命名为 backup_YYYYMMDD_HHMMSS
    3. 上传新的 exe 和 product.json 文件到 packages 目录

    参数：
    - exe_file: TestAgentStudio.exe 文件
    - product_file: product.json 文件
    """
    # 验证管理员权限
    require_admin_auth(request)

    try:
        packages_dir = Path(CONFIG['PACKAGES_DIR'])
        backup_dir = packages_dir / "backup"

        # 验证文件类型
        if not exe_file.filename.endswith('.exe'):
            raise HTTPException(status_code=400, detail="exe_file 必须是 .exe 文件")

        if not product_file.filename.endswith('.json'):
            raise HTTPException(status_code=400, detail="product_file 必须是 .json 文件")

        # 1. 处理现有的 backup 目录
        if backup_dir.exists():
            # 重命名现有 backup 目录，添加时间戳
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            old_backup_dir = packages_dir / f"backup_{timestamp}"
            backup_dir.rename(old_backup_dir)
            logger.info(f"已将旧备份目录重命名为: {old_backup_dir}")

        # 2. 创建新的 backup 目录
        backup_dir.mkdir(exist_ok=True)

        # 3. 移动当前文件到 backup 目录
        current_exe = packages_dir / "TestAgentStudio.exe"
        current_product = packages_dir / "product.json"

        files_moved = []
        if current_exe.exists():
            current_exe.rename(backup_dir / "TestAgentStudio.exe")
            files_moved.append("TestAgentStudio.exe")
            logger.info(f"已移动 TestAgentStudio.exe 到 backup 目录")

        if current_product.exists():
            current_product.rename(backup_dir / "product.json")
            files_moved.append("product.json")
            logger.info(f"已移动 product.json 到 backup 目录")

        # 创建 backup 目录的 README
        readme_path = backup_dir / "README.md"
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(f"# 备份版本\n\n")
            f.write(f"备份时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"备份文件:\n")
            for file in files_moved:
                f.write(f"- {file}\n")

        # 4. 保存上传的新文件
        new_exe_path = packages_dir / "TestAgentStudio.exe"
        new_product_path = packages_dir / "product.json"

        # 保存 exe 文件
        with open(new_exe_path, 'wb') as f:
            content = await exe_file.read()
            f.write(content)
        logger.info(f"已保存新的 TestAgentStudio.exe ({len(content)} bytes)")

        # 保存 product.json 文件
        with open(new_product_path, 'wb') as f:
            content = await product_file.read()
            f.write(content)
        logger.info(f"已保存新的 product.json")

        # 5. 读取新版本信息
        with open(new_product_path, 'r', encoding='utf-8') as f:
            product_info = json.load(f)

        # 6. 重新扫描 packages 目录
        global packages_config
        packages_config = scan_packages_directory()

        logger.info(f"上传完成: {product_info.get('gitVersion', 'unknown')}")

        return {
            "status": "success",
            "message": "更新包上传成功",
            "new_version": {
                "version": product_info.get('gitVersion'),
                "commit": product_info.get('commit'),
                "date": product_info.get('date')
            },
            "backup_info": {
                "files_moved": files_moved,
                "backup_location": str(backup_dir)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传更新包失败: {e}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")
# test-workbench_change end


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
