# CoCode Quick Start Guide

Welcome to CoCode! This guide will get you up and running in under 10 minutes.

## Prerequisites

- **Docker** (20.10+) and **Docker Compose** (2.0+)
- **OAuth Credentials** (GitHub and/or Google)

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd cocode-v2/cocode
```

**Note:** The project files are in the `cocode` subdirectory of the repository.

## Step 2: Configure OAuth

### GitHub OAuth Setup

1. Go to https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** CoCode (Local)
   - **Homepage URL:** `http://localhost:8080`
   - **Authorization callback URL:** `http://localhost:8080/auth/callback/github`
4. Click **"Register application"**
5. Copy **Client ID** and **Client Secret**

### Google OAuth Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Fill in:
   - **Name:** CoCode (Local)
   - **Authorized redirect URIs:** `http://localhost:8080/auth/callback/google`
5. Click **"Create"**
6. Copy **Client ID** and **Client Secret**

### Configure Environment

```bash
cp deploy/env.example deploy/env
nano deploy/env  # or use your favorite editor
```

**Note:** Run these commands from the `cocode` directory (where this README is located).

Fill in your OAuth credentials:

```env
# GitHub
GITHUB_ID=your_github_client_id_here
GITHUB_SECRET=your_github_client_secret_here

# Google
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Session Secret (generate a random string)
SESSION_SECRET=your_random_64_character_string_here
```

**Generate a random session secret:**

```bash
# On Linux/Mac
openssl rand -hex 32

# On Windows (PowerShell)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})
```

## Step 3: Start CoCode

```bash
# From the cocode/ directory (where this README is)
cd deploy
docker compose up --build
```

**Or** run from the `cocode/` directory without changing directories:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env up --build
```

This will:
- Build all Docker images (~5-10 minutes first time)
- Start all services (Gateway, OpenVSCode, Yjs-WS, Builder)
- Mount example projects

You'll see logs from all services. Wait until you see:

```
cocode_gateway    | [Gateway] Running on port 8080
cocode_openvscode | [openvscode-server] Web UI available at http://localhost:3000
cocode_yjs        | [Yjs-WS] Running on port 1234
cocode_builder    | [Builder] Running on port 7070
```

## Step 4: Access CoCode

1. Open your browser to: **http://localhost:8080**
2. You'll see a login page (or be redirected to `/ide` if already logged in)
3. Click **"Sign in with GitHub"** or **"Sign in with Google"**
4. Authorize the application
5. You'll be redirected to the VS Code editor!

## Step 5: Try the Examples

### C++ Multi-File Example

1. In the Explorer sidebar, navigate to `/examples/cpp-multi/`
2. Open `src/main.cpp`
3. Open the **Terminal** (View → Terminal or `` Ctrl+` ``)
4. Run the build tasks:

   **Option A: Using VS Code Tasks**
   - Press `Ctrl+Shift+P` (Command Palette)
   - Type "Tasks: Run Task"
   - Select **"C++: Configure (CMake)"**
   - Then select **"C++: Build"**
   - Then select **"C++: Run"**

   **Option B: Using Terminal**
   ```bash
   cd /workspaces/examples/cpp-multi
   cmake -S . -B build
   cmake --build build
   ./build/main
   ```

You should see:

```
Hello from util(), CoCode User!
Multi-file C++ compilation successful!
```

### Python Example

1. Navigate to `/examples/python/`
2. Open `hello.py`
3. Run task: **"Python: Run current file"**

   Or in terminal:
   ```bash
   cd /workspaces/examples/python
   python3 hello.py
   ```

You should see:

```
Hello from CoCode Python!
Python execution successful!
Sum of [1, 2, 3, 4, 5] = 15
```

## Step 6: Test Collaboration

1. **Open two browser windows** (or use an incognito window)
2. **Sign in with different accounts** in each window
3. **Open the same file** (e.g., `examples/cpp-multi/src/main.cpp`)
4. **Start typing** in one window
5. **Watch the magic!** You'll see:
   - The other user's cursor with their name
   - Real-time edits appearing instantly
   - Color-coded selections

## Common Tasks

### Stop CoCode

```bash
# In the terminal running docker compose, press Ctrl+C
# Or in another terminal (from cocode/deploy/ directory):
docker compose down

# Or from cocode/ directory:
docker compose -f deploy/docker-compose.yml down
```

### Restart CoCode

```bash
# From cocode/deploy/:
docker compose restart

# Or from cocode/:
docker compose -f deploy/docker-compose.yml restart
```

### View Logs

```bash
# All services (from cocode/deploy/):
docker compose logs -f

# Specific service (from cocode/deploy/):
docker compose logs -f gateway
docker compose logs -f openvscode

# Or from cocode/:
docker compose -f deploy/docker-compose.yml logs -f gateway
```

### Clean Restart

```bash
# From cocode/deploy/:
docker compose down
docker compose up --build --force-recreate

# Or from cocode/:
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml up --build --force-recreate
```

## Troubleshooting

### Gateway won't start

**Error:** `SESSION_SECRET is required`

**Solution:** Make sure you've set `SESSION_SECRET` in `deploy/env`

---

**Error:** OAuth callback fails

**Solution:**
- Verify callback URLs match exactly in OAuth provider settings
- Check that `CALLBACK_BASE_URL` in `deploy/env` is `http://localhost:8080`

### OpenVSCode shows "Cannot connect"

**Solution:**
- Check that all services are running: `docker compose -f deploy/docker-compose.yml ps`
- Restart services: `docker compose -f deploy/docker-compose.yml restart`

### Collaboration not working

**Symptoms:** Can't see other users' cursors

**Solution:**
- Check Yjs-WS is running: `docker compose -f deploy/docker-compose.yml logs yjs-ws`
- Check browser console for WebSocket errors
- Verify both users opened the same file path

### Build tasks fail

**Error:** `cmake: command not found` or `gcc: command not found`

**Solution:** This shouldn't happen - build tools are in the builder container. If you're running commands in the wrong terminal:
- Use VS Code's integrated terminal (it runs inside the OpenVSCode container)
- Or use the Builder API through VS Code tasks

## Next Steps

### Create Your Own Project

1. Create a new folder in `/workspaces/`
2. Add your C/C++/Python files
3. Create `CMakeLists.txt` for C++ projects
4. Use VS Code tasks to build and run

### Invite Collaborators

Currently, room sharing requires manually sharing the URL. Future versions will add room management UI.

For now:
1. Both users must be logged in
2. Both must open the same workspace path
3. Files sync automatically when opened

### Deploy to Production

See `ops/provisioning.md` for deployment to a server with:
- HTTPS/SSL
- Domain configuration
- Firewall setup
- Monitoring

## Getting Help

- **Documentation:** See `README.md` and files in `ops/`
- **Issues:** Open a GitHub issue
- **Contributing:** See `CONTRIBUTING.md`

---

**Enjoy coding together with CoCode!** 🚀
