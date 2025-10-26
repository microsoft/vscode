# CoCode Deployment Plan

## Goal
Deploy a collaborative VS Code web instance to Vercel with:
- Multi-user collaboration (Yjs)
- C++, C, Python support only
- GitHub/Google OAuth
- Code compilation service
- Custom UI elements from portfolio

## Current Problem
- Using pre-built Gitpod OpenVSCode Docker image (incompatible with proxy)
- Gateway proxy corrupting WebSocket frames
- Cannot access VS Code workbench through proxy

## Solution: Build from Source

### Phase 1: Get VS Code Web Running Locally (CURRENT STEP)
1. Install dependencies: `npm install`
2. Build VS Code: Run `VS Code - Build` task
3. Download extensions: `npm run download-builtin-extensions`
4. Test locally: `./scripts/code-web.sh --port 8080`
5. Verify it works at `http://localhost:8080`

### Phase 2: Add Collaboration Features
1. Integrate Yjs for real-time collaboration
2. Add cursor tracking and presence indicators
3. Connect to Yjs WebSocket server
4. Test multi-user editing

### Phase 3: Customize for C++/C/Python
1. Remove unnecessary language extensions
2. Keep only: cpp, c, python extensions
3. Add C++ compilation integration with Builder service
4. Strip out unused features to reduce bundle size

### Phase 4: Add Authentication
1. Implement OAuth (GitHub, Google)
2. Session management
3. User workspace isolation

### Phase 5: Production Build
1. Build optimized production bundle
2. Extract static assets
3. Prepare for Vercel deployment

### Phase 6: Deploy to Vercel
1. Upload static VS Code web bundle
2. Deploy Yjs WebSocket server separately (Railway/Render)
3. Deploy Builder service separately (for C++ compilation)
4. Configure Vercel serverless functions for auth
5. Set up domain and SSL

## Immediate Next Steps

1. **Stop Docker containers** (they're not the solution):
   ```bash
   cd cocode/deploy
   docker compose down
   ```

2. **Install VS Code dependencies**:
   ```bash
   cd f:/git\ repo\ store/cocode-v2
   npm install
   ```

3. **Start build tasks** in VS Code:
   - Open Command Palette (Ctrl+Shift+P)
   - Run "Tasks: Run Task"
   - Select "VS Code - Build"

4. **Test locally**:
   ```bash
   ./scripts/code-web.sh --port 8080
   ```

## Why Docker Approach Failed
- Gitpod OpenVSCode expects direct access, not proxy
- Path rewriting breaks VS Code's remote protocol
- WebSocket binary frames get corrupted
- Missing vsda authentication modules in Gitpod image

## Why Building from Source is Better
- Full control over features
- Can customize for specific languages
- Proper integration with collaboration services
- Smaller bundle size (remove unused features)
- Works with Vercel's static hosting

## Existing Backend Services (Keep These!)

The `cocode/services/` directory contains valuable backend microservices that should be PRESERVED:

### 1. Gateway Service (`cocode/services/gateway/`)
- **Purpose**: Authentication proxy and session management
- **Features**: GitHub OAuth login, session cookies, request proxying
- **Tech**: Express.js, Passport.js, TypeScript
- **Status**: ✅ Working correctly
- **Port**: 8080
- **Keep**: Yes - needs to proxy to custom VS Code build instead of Gitpod image

### 2. Yjs-WS Service (`cocode/services/yjs-ws/`)
- **Purpose**: WebSocket server for real-time collaboration
- **Features**: Yjs CRDT synchronization, multi-user document editing
- **Tech**: Node.js, ws library, Yjs
- **Status**: ✅ Working correctly
- **Port**: 1234
- **Keep**: Yes - VS Code frontend needs to integrate with this

### 3. Builder Service (`cocode/services/builder/`)
- **Purpose**: C++ code compilation and execution
- **Features**: Compile C++ projects, return compilation errors
- **Tech**: Node.js, Express.js, child_process for g++
- **Status**: ✅ Working correctly
- **Port**: 7070
- **Keep**: Yes - VS Code frontend needs API calls to this

### 4. OpenVSCode Docker (REPLACE THIS)
- **Current**: Using `gitpod/openvscode-server:latest` pre-built image
- **Problem**: Cannot be customized, breaks with Gateway proxy, no Yjs integration
- **Solution**: Build custom VS Code web from `src/` directory
- **Action**: Replace Docker service with custom build

## Correct Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (User)                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Gateway Service (Port 8080)                                 │
│ - GitHub OAuth authentication                               │
│ - Session management                                        │
│ - Proxy to VS Code web                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Custom VS Code Web Build (NEW - build from src/)           │
│ - Built from this repository's src/ directory               │
│ - Customized for C++/C/Python only                          │
│ - Integrated with Yjs client for collaboration              │
│ - Makes API calls to Builder service                        │
│ - Serves on port 3000 (replaces Gitpod container)          │
└──────────┬─────────────────────────────────┬────────────────┘
           │                                 │
           ▼                                 ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ Yjs-WS (Port 1234)       │    │ Builder (Port 7070)      │
│ - Real-time collab       │    │ - C++ compilation        │
│ - WebSocket server       │    │ - Execute code           │
│ - Multi-user sync        │    │ - Return output          │
└──────────────────────────┘    └──────────────────────────┘
```

## What Needs to Change

### Current Setup (Broken)
- ❌ Using pre-built Gitpod OpenVSCode Docker image
- ❌ Gateway proxy corrupts WebSocket frames
- ❌ No integration with Yjs-WS
- ❌ No integration with Builder
- ❌ Cannot customize VS Code features

### New Setup (Correct)
- ✅ Build VS Code from `src/` directory in this repo
- ✅ Add Yjs client library to VS Code
- ✅ Add Builder API client to VS Code
- ✅ Configure VS Code to work behind Gateway proxy
- ✅ Keep all existing backend services (Gateway, Yjs-WS, Builder)
- ✅ Deploy custom VS Code build to replace Gitpod container

## Integration Points

### VS Code ↔ Gateway
- Gateway handles authentication (already working)
- Gateway proxies requests to VS Code (needs proper configuration)
- VS Code needs to support being served from `/ide` path

### VS Code ↔ Yjs-WS
- Add Yjs client library to VS Code: `y-websocket`, `yjs`
- Create VS Code extension: `cocode-collab-extension`
- Connect to `ws://localhost:1234/yjs` (or `wss://` in production)
- Sync editor content across users

### VS Code ↔ Builder
- Add API client to call `http://localhost:7070/compile`
- Create VS Code extension: `cocode-cpp-builder`
- Send C++ code to Builder service
- Display compilation output in terminal

## Docker Compose Changes Needed

Update `cocode/deploy/docker-compose.yml`:

**Before (Broken)**:
```yaml
openvscode:
  image: gitpod/openvscode-server:latest  # Pre-built, can't customize
  ports:
    - "3000:3000"
```

**After (Correct)**:
```yaml
openvscode:
  build:
    context: ../../  # Build from repo root
    dockerfile: cocode/docker/custom-vscode.Dockerfile
  ports:
    - "3000:3000"
  environment:
    - YJS_WS_URL=ws://yjs-ws:1234
    - BUILDER_URL=http://builder:7070
```

## Next Steps Summary

1. ✅ **Keep existing services**: Gateway, Yjs-WS, Builder all work correctly
2. 🔄 **Build VS Code from source**: Run `npm install` → Build tasks → Test locally
3. 🔧 **Add Yjs integration**: Create extension to connect to Yjs-WS
4. 🔧 **Add Builder integration**: Create extension to call Builder API
5. 🐳 **Create custom Dockerfile**: Build VS Code web for Docker
6. 🚀 **Deploy to Vercel**: Static VS Code + serverless functions for auth
