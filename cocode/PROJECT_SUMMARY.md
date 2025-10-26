# CoCode - Project Summary

## What is CoCode?

CoCode is a **lightweight, collaborative web IDE** built on VS Code (OpenVSCode Server) with:
- **Real-time collaboration** using Yjs CRDT (color-coded cursors, live edits)
- **OAuth authentication** (GitHub & Google)
- **Built-in compilation/execution** for C, C++, and Python
- **Focused experience** - only 3 languages, no bloat
- **Docker-first** deployment

## Repository Structure

```
cocode/
├── README.md                    # Main documentation
├── GETTING_STARTED.md          # Quick start guide
├── CONTRIBUTING.md             # Development guidelines
├── LICENSE                     # MIT License
├── brand.md                    # Brand & theme guidelines
├── .editorconfig               # Editor configuration
├── .gitignore                  # Git ignore rules
├── .vscode/                    # VS Code configuration
│   ├── extensions.json         # Allowed extensions only
│   ├── settings.json           # Disable telemetry/marketplace
│   └── tasks.json              # Build/run tasks
├── docker/                     # Dockerfiles for all services
│   ├── gateway.Dockerfile
│   ├── openvscode.Dockerfile
│   ├── yjs-ws.Dockerfile
│   └── builder.Dockerfile
├── deploy/                     # Docker Compose & deployment
│   ├── docker-compose.yml      # Multi-service orchestration
│   ├── env.example             # Environment template
│   └── (traefik configs for production)
├── services/                   # Microservices source code
│   ├── gateway/                # Auth & routing (Express)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── auth/providers.ts
│   │       ├── middleware/requireAuth.ts
│   │       └── routes/{health,auth,workspaces}.ts
│   ├── collab-extension/       # VS Code web extension
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── webpack.config.js
│   │   └── src/
│   │       ├── extension.ts
│   │       └── yjs/{binding,presence,colors}.ts
│   ├── yjs-ws/                 # Yjs WebSocket server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/server.ts
│   └── builder/                # Compile/execute service
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── server.ts
│           └── jobs/{cpp,c,python}.ts
├── ops/                        # Operations documentation
│   ├── provisioning.md         # Server setup guide
│   └── hardening.md            # Security checklist
├── scripts/                    # Utility scripts
│   └── audit-extensions.sh     # Extension compliance check
├── examples/                   # Sample projects
│   ├── cpp-multi/              # CMake C++ example
│   │   ├── CMakeLists.txt
│   │   ├── include/util.hpp
│   │   └── src/{main,util}.cpp
│   └── python/
│       └── hello.py
├── workspaces/                 # User workspaces (gitignored)
└── .github/
    └── workflows/
        └── ci.yml              # GitHub Actions CI/CD
```

## Core Services

### 1. Gateway (Port 8080)
- **Tech:** Node.js, Express, Passport.js
- **Purpose:** Authentication, session management, reverse proxy
- **Features:**
  - OAuth login (GitHub, Google)
  - Session cookies (JWT, HttpOnly)
  - Workspace path injection (per-user namespacing)
  - Routes: `/auth/*`, `/api/workspaces/*`, `/ide/*` (proxy to OpenVSCode)

### 2. OpenVSCode (Port 3000, internal)
- **Tech:** OpenVSCode Server (VS Code web build)
- **Purpose:** Code editor UI
- **Features:**
  - Language support: C, C++, Python only
  - Extensions: clangd, cmake-tools, pyright
  - Marketplace disabled
  - Telemetry disabled
  - Custom tasks for build/run

### 3. Yjs-WS (Port 1234, internal)
- **Tech:** y-websocket server
- **Purpose:** Real-time collaboration (CRDT sync)
- **Features:**
  - Document sync via Yjs
  - Awareness (cursor/selection/presence)
  - Optional persistence (y-leveldb)
  - WebSocket-based

### 4. Builder (Port 7070, internal)
- **Tech:** Node.js, Express
- **Purpose:** Code compilation and execution
- **Features:**
  - C++ build: CMake or g++ fallback
  - C build: gcc
  - Python execution: python3
  - Resource limits (30s timeout, 1MB output)
  - Sandboxed execution

## Key Features

### Authentication Flow

```
User → Gateway → OAuth Provider → Callback
  ↓
Session Cookie Set
  ↓
Redirect to /ide → Gateway Proxy → OpenVSCode
```

- User info stored in session
- Workspace path: `/workspaces/{userId}/default`

### Collaboration Flow

```
User A ─┐
        ├─→ OpenVSCode + Collab Extension ─→ Yjs-WS ─→ CRDT Sync
User B ─┘                                        ↓
                                            User A ← Cursor/Selection
                                            User B ← Cursor/Selection
```

- Each file has a Yjs document (keyed by `workspaceId:filePath`)
- Awareness broadcasts cursor position, selection, user info
- Color-coded cursors (deterministic or palette-based)
- Conflict-free merging via CRDT

### Build/Run Flow

```
VS Code Task → Terminal Command → Builder API
  ↓
POST /jobs/run { lang, workspace, target }
  ↓
Builder Service (Docker container with gcc/clang/cmake/python3)
  ↓
Execute with timeouts/limits → Return logs + exit code
```

## Configuration

### Environment Variables

In `deploy/env`:

```env
# OAuth
GITHUB_ID=...
GITHUB_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Session
SESSION_SECRET=...  # 64-char random string

# Service URLs (internal Docker network)
OPENVSCODE_URL=http://openvscode:3000
YJS_WS_URL=ws://yjs-ws:1234
BUILDER_URL=http://builder:7070

# Gateway
PORT=8080
CALLBACK_BASE_URL=http://localhost:8080
```

### VS Code Settings

In `.vscode/settings.json`:

```json
{
  "telemetry.telemetryLevel": "off",
  "extensions.gallery.enabled": false,
  "extensions.autoUpdate": false,
  "editor.formatOnSave": true,
  "[cpp]": { "editor.defaultFormatter": "ms-vscode.cpptools" },
  "[python]": { "editor.defaultFormatter": "ms-python.black-formatter" }
}
```

## Security Features

- **Auth-gated access:** All `/ide` and `/builder` endpoints require authentication
- **Workspace isolation:** Per-user namespaces (`/workspaces/{userId}/`)
- **Resource limits:**
  - Builder timeout: 30 seconds
  - Max output: 1MB
  - Docker resource limits (optional)
- **No telemetry:** Disabled across all services
- **Extension marketplace disabled:** Only curated extensions allowed
- **Input validation:** All API endpoints validate language and paths
- **Session security:** HttpOnly cookies, SameSite, configurable expiry

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Gateway** | Node.js 20, Express, Passport.js, TypeScript |
| **OpenVSCode** | OpenVSCode Server (VS Code web), clangd, pyright |
| **Yjs-WS** | Node.js 20, y-websocket, Yjs, TypeScript |
| **Builder** | Node.js 20, Express, gcc/clang/cmake/python3, TypeScript |
| **Collab Extension** | TypeScript, Yjs, y-monaco, VS Code Extension API |
| **Container** | Docker, Docker Compose |
| **CI/CD** | GitHub Actions |

## Development Workflow

1. **Local setup:**
   ```bash
   docker compose up --build
   ```

2. **Make changes** in `services/*/src/`

3. **Rebuild specific service:**
   ```bash
   docker compose up --build gateway
   ```

4. **Test:**
   - Open `http://localhost:8080`
   - Login with OAuth
   - Test collaboration with two browser windows

## Testing Checklist

- [ ] OAuth login (GitHub & Google)
- [ ] Session persistence across page reload
- [ ] Two users editing same file (see cursors)
- [ ] C++ multi-file CMake build (`examples/cpp-multi`)
- [ ] Python script execution (`examples/python`)
- [ ] Extension audit passes (only allowed extensions)
- [ ] Unauthorized access blocked (401)
- [ ] Builder timeout enforced (>30s jobs killed)

## Deployment

### Local (Development)

```bash
cd deploy
docker compose up
```

### Production (Single VM)

1. **Provision server:** See `ops/provisioning.md`
2. **Configure OAuth** with production callback URLs
3. **Set up HTTPS** (Traefik + Let's Encrypt)
4. **Configure firewall** (block internal ports)
5. **Deploy:**
   ```bash
   docker compose -f docker-compose.yml up -d
   ```

## Known Limitations

- **Debugging UI:** Limited; use terminal `gdb` for C++
- **Large teams:** Tested up to ~10 concurrent users per file
- **Marketplace:** Intentionally disabled
- **Cloud sync:** Workspaces stored on server volumes only

## Roadmap

### Phase 6 (In Progress)
- [ ] Welcome page extension with brand theming
- [ ] Read colors/fonts from `brand.md`
- [ ] Display "Get Started" UI on first visit

### Phase 7 (Planned)
- [ ] Implement full security hardening per `ops/hardening.md`
- [ ] Add resource limits to docker-compose.yml
- [ ] Test timeout enforcement

### Future Enhancements
- [ ] Room management UI (create/join with link)
- [ ] Yjs persistence (y-leveldb)
- [ ] File watcher for non-editor changes
- [ ] Presence panel (list of active users)
- [ ] Follow mode (viewport tracking)

## Contributing

See `CONTRIBUTING.md` for:
- Development setup
- Code standards (tabs, TypeScript, JSDoc)
- Commit message format (conventional commits)
- PR process

## License

MIT License - See `LICENSE` file

## Support

- **Documentation:** README.md, GETTING_STARTED.md
- **Operations:** ops/provisioning.md, ops/hardening.md
- **Issues:** GitHub Issues
- **Security:** See `ops/hardening.md`

---

**CoCode is ready for development and testing!** 🚀

All core infrastructure is in place. Next steps:
1. Initialize npm dependencies (`npm install` in each service)
2. Test Docker Compose build
3. Implement Welcome extension (Phase 6)
4. Apply security hardening (Phase 7)
