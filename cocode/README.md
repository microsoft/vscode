# CoCode

**A lightweight, collaborative web IDE for C, C++, and Python**

CoCode is a VS Code-based web IDE with real-time collaboration, built-in compilation/execution, and OAuth authentication. It's designed for simplicity, reliability, and multi-user coding sessions.

## ✨ Features

- 🌐 **Web-based IDE** powered by OpenVSCode Server
- 👥 **Real-time collaboration** with color-coded cursors and presence
- 🔐 **OAuth authentication** (GitHub & Google)
- ⚙️ **Built-in compiler/executor** for C, C++, and Python
- 🎯 **Focused experience** - only C/C++/Python support
- 🐳 **Docker-first** - runs locally or deploys to a single VM

## 🚀 Quick Start

**New to CoCode?** See **[GETTING_STARTED.md](GETTING_STARTED.md)** for detailed setup instructions.

### Prerequisites

- Docker (20.10+) & Docker Compose (2.0+)
- OAuth credentials (GitHub and/or Google)

### Setup (3 steps)

1. **Clone and configure OAuth**

   ```bash
   git clone <repo-url> cocode
   cd cocode/deploy
   cp env.example env
   # Edit 'env' with your GitHub/Google OAuth credentials
   ```

2. **Start all services**

   ```bash
   docker compose up --build
   ```

3. **Open in browser**

   Navigate to: `http://localhost:8080`

   Login with GitHub or Google, then start coding!

## Architecture

CoCode consists of four core services:

- **Gateway** (`:8080`) - Authentication, session management, and request routing
- **OpenVSCode** (`:3000`) - Web-based VS Code instance
- **Yjs-WS** (`:1234`) - Real-time collaboration server (CRDT sync)
- **Builder** (`:7070`) - Code compilation and execution service

```
┌──────────┐
│  Client  │
└─────┬────┘
      │
┌─────▼────────┐      ┌──────────────┐
│   Gateway    │─────▶│  OpenVSCode  │
│ (Auth/Proxy) │      │   Server     │
└──────────────┘      └──────────────┘
      │
      ├──────────────▶┌──────────────┐
      │               │   Yjs-WS     │
      │               │  (Collab)    │
      │               └──────────────┘
      │
      └──────────────▶┌──────────────┐
                      │   Builder    │
                      │ (Compile/Run)│
                      └──────────────┘
```

## OAuth Setup

### GitHub

1. Go to https://github.com/settings/developers
2. Create a new OAuth App
3. Set callback URL to `http://localhost:8080/auth/callback/github`
4. Copy Client ID and Client Secret to `deploy/env`

### Google

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Set authorized redirect URI to `http://localhost:8080/auth/callback/google`
4. Copy Client ID and Client Secret to `deploy/env`

## How to Collaborate

1. **Login** to CoCode using GitHub or Google
2. **Open a workspace** - your personal workspace is auto-provisioned
3. **Share the room link** with collaborators
4. **Code together** - see cursors, selections, and edits in real-time

Each user gets a unique color-coded cursor with their name displayed.

## Compiling C++ Projects

CoCode supports multi-file C++ projects using CMake or Make.

### Using CMake (recommended)

1. Create `CMakeLists.txt` in your project root
2. Run tasks in order:
   - **C++: Configure (CMake)** - Generates build files
   - **C++: Build** - Compiles the project
   - **C++: Run** - Executes the binary

### Example Project Structure

```
my-project/
├── CMakeLists.txt
├── include/
│   └── util.hpp
└── src/
    ├── main.cpp
    └── util.cpp
```

See `examples/cpp-multi/` for a working example.

## Running Python

1. Open any `.py` file
2. Run task: **Python: Run current file**

## Supported Languages

- **C** - gcc, clang-format
- **C++** - g++/clang++, CMake, clangd (IntelliSense)
- **Python** - python3, pyright (type checking)

All other languages are intentionally disabled.

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[GETTING_STARTED.md](GETTING_STARTED.md)** | Detailed setup guide (OAuth, examples, troubleshooting) |
| **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** | Complete architecture overview and technical details |
| **[NEXT_STEPS.md](NEXT_STEPS.md)** | Development roadmap and implementation guide |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | How to contribute, code standards, PR process |
| **[ops/provisioning.md](ops/provisioning.md)** | Production deployment guide |
| **[ops/hardening.md](ops/hardening.md)** | Security checklist and best practices |
| **[brand.md](brand.md)** | Design system, colors, typography |

## 🏗️ Architecture

CoCode consists of four microservices:

```
┌──────────┐
│  Client  │
└─────┬────┘
      │
┌─────▼────────┐      ┌──────────────┐
│   Gateway    │─────▶│  OpenVSCode  │
│ (Auth/Proxy) │      │   Server     │
└──────┬───────┘      └──────────────┘
       │
       ├──────────────▶┌──────────────┐
       │               │   Yjs-WS     │
       │               │  (Collab)    │
       │               └──────────────┘
       │
       └──────────────▶┌──────────────┐
                       │   Builder    │
                       │ (Compile/Run)│
                       └──────────────┘
```

- **Gateway** (`:8080`) - Authentication, session management, routing
- **OpenVSCode** (`:3000`) - Web-based VS Code editor
- **Yjs-WS** (`:1234`) - Real-time collaboration server (CRDT)
- **Builder** (`:7070`) - Code compilation and execution

See **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** for detailed architecture.

## 🔒 Security

- All IDE and builder endpoints require authentication
- Workspaces are namespaced by user ID (`/workspaces/{userId}/`)
- Builder enforces CPU/memory limits and 30s timeouts
- Telemetry disabled across all services
- Extension marketplace disabled (curated extensions only)
- See **[ops/hardening.md](ops/hardening.md)** for complete checklist

## 🛠️ Development

### Project Structure

```
cocode/
├── services/
│   ├── gateway/           # Auth & routing (Express + Passport)
│   ├── collab-extension/  # VS Code web extension (Yjs)
│   ├── yjs-ws/            # Collaboration server
│   └── builder/           # Compile/execute service
├── docker/                # Dockerfiles for all services
├── deploy/                # Docker Compose configs
├── examples/              # Sample C++/Python projects
└── ops/                   # Deployment documentation
```

### Local Development

```bash
# Install dependencies
cd services/gateway && npm install
cd ../yjs-ws && npm install
cd ../builder && npm install
cd ../collab-extension && npm install

# Run all services
cd ../../deploy
docker compose up --build

# Rebuild specific service
docker compose up --build gateway

# View logs
docker compose logs -f openvscode
```

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for coding standards.

## 🧪 Testing

### Manual Testing Checklist

- [ ] OAuth login (GitHub & Google)
- [ ] Two users editing same file (see cursors)
- [ ] C++ multi-file CMake build (`examples/cpp-multi`)
- [ ] Python script execution (`examples/python`)
- [ ] Session persistence across reload
- [ ] Unauthorized access returns 401

See **[NEXT_STEPS.md](NEXT_STEPS.md)** for complete testing guide.

## ⚠️ Known Limitations

- **Debugging UI:** Use terminal with `gdb` for C++ debugging
- **Team size:** Tested up to ~10 concurrent users per file
- **Extension marketplace:** Intentionally disabled
- **Cloud sync:** Workspaces stored on server volumes only

## 🗺️ Roadmap

### Current Status (v0.9)

✅ **Complete:**
- Core services (Gateway, OpenVSCode, Yjs-WS, Builder)
- OAuth authentication (GitHub, Google)
- Real-time collaboration with Yjs
- C/C++/Python compilation and execution
- Docker Compose orchestration

🔜 **Coming Soon (v1.0):**
- [ ] Welcome page extension with branding
- [ ] Full security hardening
- [ ] Extension audit in CI/CD
- [ ] Production deployment tested

### Future Enhancements

- Room management UI (create/join with link)
- Yjs persistence (y-leveldb)
- File watcher for non-editor changes
- Presence panel (list of active users)
- Follow mode (viewport tracking)

See **[NEXT_STEPS.md](NEXT_STEPS.md)** for implementation details.

## 🤝 Contributing

We welcome contributions! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for:
- Development setup
- Code standards (TypeScript, tabs, JSDoc)
- Commit message format
- Pull request process

## 📄 License

MIT License - See **[LICENSE](LICENSE)** for details.

## 💬 Support

- **Issues:** Open a GitHub issue
- **Discussions:** Use GitHub Discussions
- **Security:** See **[ops/hardening.md](ops/hardening.md)**

---

**Built with ❤️ for collaborative coding**
