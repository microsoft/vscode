# Next Steps for CoCode Development

This document outlines what needs to be done to complete CoCode and make it production-ready.

## Immediate Actions (Before First Run)

### 1. Initialize npm Dependencies

Each service needs its dependencies installed:

```bash
# Gateway
cd services/gateway
npm install

# Yjs-WS
cd ../yjs-ws
npm install

# Builder
cd ../builder
npm install

# Collab Extension
cd ../collab-extension
npm install
```

This will create `package-lock.json` files and `node_modules/` directories.

### 2. Test Docker Build

```bash
cd deploy
docker compose build
```

**Expected:** All four images build successfully without errors.

**If errors occur:**
- Check Dockerfile paths
- Verify TypeScript compiles
- Check for missing dependencies in package.json

### 3. Configure OAuth (Development)

Follow `GETTING_STARTED.md` to:
1. Create GitHub OAuth App
2. Create Google OAuth App
3. Copy credentials to `deploy/env`
4. Generate `SESSION_SECRET`

### 4. First Run Test

```bash
docker compose up
```

**Verify:**
- [ ] All 4 services start without errors
- [ ] Gateway logs: `Running on port 8080`
- [ ] OpenVSCode logs: `Web UI available at...`
- [ ] Yjs-WS logs: `Running on port 1234`
- [ ] Builder logs: `Running on port 7070`

### 5. Login Test

1. Navigate to `http://localhost:8080`
2. Click "Sign in with GitHub"
3. Authorize
4. Should redirect to `/ide` with VS Code loaded

**If this works, Phase 0-5 are complete!**

## Phase 6: Branding + Welcome Extension

### Tasks

1. **Create Welcome Extension**
   - New folder: `services/welcome-extension/`
   - Copy structure from `collab-extension`
   - Manifest: Activate on `onStartupFinished`
   - Show welcome webview on first visit

2. **Brand Theme Integration**
   - Read `brand.md` for color tokens
   - Parse CSS variables (--accent-1, --accent-2, etc.)
   - Apply to welcome page HTML/CSS

3. **Welcome Page UI**
   - Centered layout, max-width 800px
   - Hero: Italic title from `brand.md`
   - Features list
   - Buttons: "Get Started", "View Examples"
   - Styling from `ui-theme-extract.md` (gentle fade-ins, rounded corners)

4. **Status Bar Branding**
   - Add status bar item: `CoCode • Collaboration: Connected (N)`
   - Use gradient or accent-1 color for "CoCode"

### Files to Create

```
services/welcome-extension/
├── package.json
├── tsconfig.json
├── webpack.config.js
└── src/
    ├── extension.ts
    ├── welcomeView.ts
    └── media/
        ├── welcome.html
        ├── welcome.css
        └── (logo.svg if created)
```

### Integration

1. Build extension
2. Package as `.vsix`
3. Install in OpenVSCode Dockerfile:
   ```dockerfile
   COPY services/welcome-extension/dist/welcome-extension.vsix /tmp/
   RUN /usr/bin/openvscode-server --install-extension /tmp/welcome-extension.vsix
   ```

## Phase 7: Security Hardening

### Implement from `ops/hardening.md`

1. **Resource Limits**

   Edit `deploy/docker-compose.yml`:
   ```yaml
   builder:
     deploy:
       resources:
         limits:
           cpus: '2'
           memory: 2G
   ```

2. **Workspace Validation**

   In `services/gateway/src/middleware/requireAuth.ts`:
   ```typescript
   // Validate workspace path
   if (!workspacePath.startsWith(`/workspaces/${user.id}/`)) {
     return res.status(403).json({ error: 'Forbidden' });
   }
   ```

3. **Builder Sandbox**

   Edit `docker/builder.Dockerfile`:
   ```dockerfile
   # Remove package managers
   RUN apt-get remove -y apt apt-get

   # Restrict network (in docker-compose.yml)
   networks:
     builder_isolated:
       driver: bridge
       internal: true
   ```

4. **Input Validation**

   In `services/builder/src/server.ts`:
   ```typescript
   const ALLOWED_LANGS = ['c', 'cpp', 'python'];
   if (!ALLOWED_LANGS.includes(lang)) {
     return res.status(400).json({ error: 'Invalid language' });
   }
   ```

5. **Log Rotation**

   Add to all services in docker-compose.yml:
   ```yaml
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

### Security Testing

- [ ] Test unauthorized access returns 401
- [ ] Test workspace path validation
- [ ] Test builder timeout (write infinite loop, verify kill at 30s)
- [ ] Test output size limit (generate >1MB output)
- [ ] Scan images: `docker scan cocode_builder`

## Phase 8: Extension Audit Script

### Implement `scripts/audit-extensions.sh`

```bash
#!/bin/bash

# Query OpenVSCode container for installed extensions
EXTENSIONS=$(docker exec cocode_openvscode /usr/bin/openvscode-server --list-extensions)

ALLOWED=(
  "llvm-vs-code-extensions.vscode-clangd"
  "ms-vscode.cmake-tools"
  "ms-python.pyright"
  "cocode.collab-extension"
  "cocode.welcome-extension"
)

# Check if any unauthorized extensions are installed
for ext in $EXTENSIONS; do
  if [[ ! " ${ALLOWED[@]} " =~ " ${ext} " ]]; then
    echo "ERROR: Unauthorized extension found: $ext"
    exit 1
  fi
done

echo "✓ Extension audit passed"
exit 0
```

### Run in CI

Add to `.github/workflows/ci.yml`:

```yaml
- name: Start services
  run: docker compose up -d

- name: Wait for services
  run: sleep 30

- name: Audit extensions
  run: bash scripts/audit-extensions.sh
```

## Testing Checklist

### Manual Tests

- [ ] **Auth:** Login with GitHub and Google
- [ ] **Session:** Reload page, still logged in
- [ ] **Collab:** Two users, same file, see cursors
- [ ] **C++ Build:** Run CMake configure → build → run
- [ ] **Python Run:** Execute python script via task
- [ ] **Security:** Access `/ide` without login → 401
- [ ] **Timeout:** Write infinite loop, verify kill

### Automated Tests (Future)

Consider adding:
- Unit tests for Gateway routes (Jest)
- Integration tests for Builder API (Supertest)
- E2E tests for collaboration (Playwright)

## Optional Enhancements

### Room Management UI

**Goal:** Users can create/join rooms with URLs like `/ide/room/abc123`

1. **Gateway route:** `GET /ide/room/:roomId`
2. **Provision workspace:** `/workspaces/{userId}/rooms/{roomId}`
3. **Pass to Yjs:** Use roomId in WebSocket connection

### Yjs Persistence

**Goal:** Faster cold loads by persisting Yjs docs to disk

1. Install `y-leveldb` in yjs-ws service
2. Configure persistence in `services/yjs-ws/src/server.ts`:
   ```typescript
   const persistence = require('y-leveldb').LeveldbPersistence('./db');
   setupWSConnection(conn, req, { persistence });
   ```
3. Mount volume in docker-compose.yml:
   ```yaml
   yjs-ws:
     volumes:
       - yjs-db:/app/db
   ```

### File Watcher

**Goal:** Sync file renames/moves through Yjs

1. Use `chokidar` to watch workspace
2. On file rename/move, broadcast event via Yjs
3. Update document keys in collab extension

## Production Deployment

See `ops/provisioning.md` for full guide.

**Quick summary:**

1. **Server:** Ubuntu 22.04, Docker installed
2. **Domain:** Point DNS to server IP
3. **OAuth:** Update callback URLs to production domain
4. **HTTPS:** Use Traefik + Let's Encrypt (see `deploy/traefik.yml`)
5. **Firewall:** Block internal ports (3000, 1234, 7070)
6. **Deploy:** `docker compose up -d`
7. **Monitor:** Set up health check cron

## Documentation Updates

Before release:

- [ ] Update README.md with final features
- [ ] Add screenshots/GIFs of collaboration
- [ ] Create video demo (optional)
- [ ] Write blog post (optional)

## Release Checklist

- [ ] All phases complete (0-8)
- [ ] Security hardening applied
- [ ] Extension audit passes in CI
- [ ] Manual tests pass
- [ ] Documentation complete
- [ ] Production deployment tested
- [ ] LICENSE and copyright headers added
- [ ] Version tagged (v1.0.0)

## Support & Maintenance

### Regular Tasks

- **Weekly:** Check for security updates
- **Monthly:** Rotate OAuth secrets (if leaked)
- **Quarterly:** Update dependencies

### Monitoring

Set up:
- Health check endpoint monitoring (`/health`)
- Log aggregation (optional: ELK stack)
- Alerts for service downtime

### Backup Strategy

- **Workspaces:** Daily tar backup to S3/Backblaze
- **Yjs DB:** Daily snapshot (if persistence enabled)
- **Configs:** Keep `deploy/env` in secure vault

---

## Current Status

✅ **Complete:**
- Phase 0: Repository structure
- Phase 1: OpenVSCode Docker baseline
- Phase 2: Auth Gateway (OAuth, sessions)
- Phase 3: Yjs collaboration server + extension
- Phase 4: Language restriction (C/C++/Python)
- Phase 5: Builder service (compile/execute)
- Phase 8: Docker Compose integration

⏳ **In Progress:**
- npm dependencies need installation

🔜 **Next Up:**
- Phase 6: Welcome extension + branding
- Phase 7: Security hardening
- Extension audit script implementation

---

**Ready to develop!** Follow the tasks above in order. Start with "Immediate Actions" to get the stack running.
