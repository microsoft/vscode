# Python 3.7 SSL 问题解决方案

## 问题说明

Python 3.7 在 Windows 上可能缺少 SSL 模块或 SSL 支持不完整，导致 pip 无法通过 HTTPS 下载包。

## 解决方案

### 方案 1：使用修复后的启动脚本（推荐）

直接运行修复后的 `start.bat`：

```batch
start.bat
```

这个脚本会自动使用 `--trusted-host` 参数绕过 SSL 验证。

### 方案 2：手动安装依赖

如果 `start.bat` 失败，运行专门的安装脚本：

```batch
install-python37.bat
```

这个脚本会尝试多种方法安装依赖：
1. 使用 trusted hosts（绕过 SSL）
2. 升级 pip 后重试
3. 使用 HTTP 镜像

### 方案 3：手动下载 wheel 文件

如果所有自动方法都失败：

1. **下载以下文件**（访问 https://pypi.org/）：
   - `fastapi-0.95.2-py3-none-any.whl`
   - `uvicorn-0.22.0-py3-none-any.whl`
   - `pydantic-1.10.12-cp37-cp37m-win_amd64.whl`
   - `starlette-0.27.0-py3-none-any.whl`
   - `typing_extensions-4.7.1-py3-none-any.whl`
   - `python_multipart-0.0.6-py3-none-any.whl`
   - `python_dotenv-1.0.0-py3-none-any.whl`

2. **将所有 .whl 文件放到 `python-update-server` 目录**

3. **安装**：
```batch
pip install fastapi-0.95.2-py3-none-any.whl
pip install uvicorn-0.22.0-py3-none-any.whl
pip install pydantic-1.10.12-cp37-cp37m-win_amd64.whl
pip install starlette-0.27.0-py3-none-any.whl
pip install typing_extensions-4.7.1-py3-none-any.whl
pip install python_multipart-0.0.6-py3-none-any.whl
pip install python_dotenv-1.0.0-py3-none-any.whl
```

### 方案 4：升级 Python（长期解决方案）

Python 3.7 已于 2023 年停止维护，建议升级到：
- **Python 3.8**（稳定）
- **Python 3.11**（推荐，性能更好）
- **Python 3.12/3.13**（最新）

下载地址：https://www.python.org/downloads/

## 快速测试

安装完成后，测试依赖是否正常：

```batch
python -c "import fastapi; print('FastAPI OK')"
python -c "import uvicorn; print('Uvicorn OK')"
python -c "import pydantic; print('Pydantic OK')"
```

如果都显示 "OK"，就可以运行 `start.bat` 启动服务器了。

## 常见错误

### 错误 1：SSL module is not available
**原因**：Python 3.7 安装不完整
**解决**：使用 `--trusted-host` 参数（已在脚本中处理）

### 错误 2：Could not fetch URL
**原因**：网络问题或 SSL 证书问题
**解决**：运行 `install-python37.bat` 尝试多种方法

### 错误 3：No matching distribution found
**原因**：pip 无法连接到 PyPI
**解决**：手动下载 wheel 文件（方案 3）

## 版本说明

为了兼容 Python 3.7，使用了以下固定版本：
- FastAPI 0.95.2（最后一个完全支持 Python 3.7 的版本）
- Uvicorn 0.22.0
- Pydantic 1.10.12
- Starlette 0.27.0

这些版本都经过测试，可以在 Python 3.7 上正常运行。
