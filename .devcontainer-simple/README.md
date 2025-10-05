# Simple Dev Container for VS Code

A lightweight alternative to the full GUI dev container for developers who prefer terminal-based workflows.

## 🚀 Quick Start

### Option 1: Using VS Code
1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Select: **Dev Containers: Reopen in Container**
4. Choose this configuration when prompted

### Option 2: Manual Setup
```bash
# Clone the repository
git clone https://github.com/microsoft/vscode.git
cd vscode

# Copy this devcontainer as the default
cp -r .devcontainer-simple .devcontainer

# Reopen in container
code .
```

## 📦 What's Included

### System Dependencies
- **Build Tools:** gcc, g++, make, python3
- **Native Modules:** libsecret, libxkbfile, krb5
- **Electron Runtime:** All necessary X11/GTK libraries

### Development Tools
- Node.js 22.x (LTS)
- TypeScript, ESLint support
- Git, GitHub CLI
- node-gyp, yarn, vsce

### VS Code Extensions
- ESLint
- EditorConfig
- TypeScript Nightly
- GitHub Pull Requests
- GitLens

## 🔧 Features

✅ **Lightweight** - No VNC/desktop environment (6GB RAM vs 9GB)
✅ **Fast Setup** - Auto-installs dependencies on container creation
✅ **Optimized** - Uses Docker volumes for node_modules performance
✅ **Debug Ready** - Preconfigured ports and settings

## 🎯 Workflow

After container starts:

```bash
# Watch mode (auto-compile on changes)
npm run watch

# In VS Code: Press F5 to launch debugger
# Or manually:
bash scripts/code.sh
```

## 📊 Comparison with Full Dev Container

| Feature | Simple (.devcontainer-simple) | Full (.devcontainer) |
|---------|------------------------------|----------------------|
| RAM Required | 6GB | 9GB |
| GUI Support | ❌ No | ✅ VNC Desktop |
| Setup Time | ~3 min | ~8 min |
| Rust Toolchain | ❌ No | ✅ Yes |
| Use Case | CLI development | Full GUI testing |

## 🐛 Debugging

The container forwards these ports:
- **9229** - Node.js debug port (for --inspect)
- **3000** - Development server (if applicable)

Press **F5** in VS Code to attach the debugger automatically.

## 🔄 Rebuilding

If you modify the Dockerfile:

```bash
# Rebuild container
Ctrl+Shift+P > Dev Containers: Rebuild Container

# Or from command line
docker compose -f .devcontainer-simple/docker-compose.yml build --no-cache
```

## 📝 Notes

- Node modules are stored in a Docker volume for better performance
- Git safe directory is configured to avoid permission warnings
- Runs as non-root user (`node`) for security
- Electron binaries are not downloaded (use local build)

## 🆚 When to Use Which?

**Use Simple (.devcontainer-simple) when:**
- You prefer terminal/CLI workflows
- You're doing TypeScript/JavaScript development
- You want faster startup and less resource usage
- You don't need to test GUI features

**Use Full (.devcontainer) when:**
- You need to test Electron GUI
- You want a full desktop environment
- You're working on native UI features
- You need Rust toolchain

## 🤝 Contributing

This is an unofficial lightweight alternative. For the official dev container, see `.devcontainer/`.
