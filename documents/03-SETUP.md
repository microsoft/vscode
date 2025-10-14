# Specter IDE - Setup Guide

**Quick setup guide for developers joining the Specter project**

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required
- **Node.js** v22.15.1 or later ([Download](https://nodejs.org/))
- **Git** Latest version ([Download](https://git-scm.com/))
- **Python** 3.8+ ([Download](https://python.org/))
- **Code Editor** VS Code or similar (for editing before running Specter)

### Recommended
- **nvm** (Node Version Manager) for managing Node.js versions
- **certxgen** Our automation CLI ([Install Guide](https://github.com/bugb/certxgen))
- **Docker** For containerized tool testing (optional)

---

## macOS Setup

### 1. Install Node.js with nvm

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Reload shell configuration
source ~/.zshrc  # or ~/.bashrc

# Install Node.js 22
nvm install 22
nvm use 22

# Verify
node --version  # Should show v22.x.x
npm --version   # Should show 10.x.x
```

### 2. Install Development Tools

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3
brew install python@3.11

# Verify
python3 --version
```

### 3. Clone Repository

```bash
# Create workspace directory
mkdir -p ~/Documents/specter-workspace
cd ~/Documents/specter-workspace

# Clone the repository
git clone https://github.com/BugB-Tech/bsurf_b2c.git
cd bsurf_b2c

# Add upstream remote
git remote add upstream https://github.com/microsoft/vscode.git

# Verify remotes
git remote -v
# Should show:
# origin    https://github.com/BugB-Tech/bsurf_b2c.git
# upstream  https://github.com/microsoft/vscode.git
```

### 4. Install Dependencies

```bash
# Install npm packages (takes 5-10 minutes)
npm install

# This installs ~100,000 files and ~3 GB of dependencies
```

### 5. Build and Run

```bash
# Start watch mode (Terminal 1 - keep this running)
npm run watch

# Wait for: "Finished compilation with 0 errors"
# First build takes 15-30 minutes
# Subsequent builds are much faster (incremental)

# In a new terminal (Terminal 2):
cd ~/Documents/specter-workspace/bsurf_b2c
./scripts/code.sh

# Specter IDE should launch! 🎉
```

---

## Linux Setup

### 1. Install Node.js

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# Or using package manager (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install Development Tools

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential python3 python3-pip git

# Fedora
sudo dnf groupinstall "Development Tools"
sudo dnf install python3 python3-pip git

# Arch
sudo pacman -S base-devel python python-pip git
```

### 3. Clone and Build

```bash
# Clone repository
git clone https://github.com/BugB-Tech/bsurf_b2c.git
cd bsurf_b2c

# Add upstream
git remote add upstream https://github.com/microsoft/vscode.git

# Install dependencies
npm install

# Build
npm run watch &

# Run
./scripts/code.sh
```

---

## Windows Setup

### 1. Install Node.js

1. Download installer from [nodejs.org](https://nodejs.org/)
2. Choose "LTS" version (v22.x.x)
3. Run installer with default settings
4. Verify in PowerShell:
```powershell
node --version
```

### 2. Install Development Tools

```powershell
# Install Chocolatey (package manager)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Git and Python
choco install git python -y
```

### 3. Clone and Build

```powershell
# Clone repository
git clone https://github.com/BugB-Tech/bsurf_b2c.git
cd bsurf_b2c

# Add upstream
git remote add upstream https://github.com/microsoft/vscode.git

# Install dependencies
npm install

# Build (PowerShell Terminal 1)
npm run watch

# Run (PowerShell Terminal 2)
.\scripts\code.bat
```

---

## Installing certxgen (Optional but Recommended)

certxgen is our core automation framework with 100+ exploit templates.

### macOS/Linux

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Clone and install certxgen
git clone https://github.com/bugb/certxgen.git
cd certxgen
cargo build --release
cargo install --path .

# Verify
certxgen --version
```

### Windows

```powershell
# Install Rust
# Download from: https://rustup.rs/

# Clone and install certxgen
git clone https://github.com/bugb/certxgen.git
cd certxgen
cargo build --release
cargo install --path .

# Verify
certxgen --version
```

---

## Post-Installation Configuration

### 1. Configure Git

```bash
# Set your identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Set default branch
git config --global init.defaultBranch main

# Configure line endings
git config --global core.autocrlf input  # macOS/Linux
git config --global core.autocrlf true   # Windows
```

### 2. Checkout Development Branch

```bash
cd bsurf_b2c
git checkout -b bugb
git push -u origin bugb
```

### 3. Configure LLM API Keys (for AI features)

Create `.env` file in project root:

```bash
# .env
ANTHROPIC_API_KEY=your-claude-api-key
OPENAI_API_KEY=your-openai-api-key

# Optional: Self-hosted LLM
OLLAMA_BASE_URL=http://localhost:11434
```

**Never commit this file!** It's already in `.gitignore`.

---

## Development Workflow

### Daily Workflow

```bash
# 1. Update from origin
git checkout bugb
git pull origin bugb

# 2. Start watch mode (keep running)
npm run watch

# 3. In new terminal, run IDE
./scripts/code.sh

# 4. Make changes in:
#    src/vs/workbench/contrib/specter/
#    src/vs/workbench/services/specter/

# 5. Reload window to see changes
# In Specter: Cmd+R (Mac) or Ctrl+R (Windows/Linux)
```

### Creating a Feature

```bash
# Create feature branch
git checkout -b bugb/feature/your-feature-name

# Make changes...

# Test changes
# Reload Specter window (Cmd+R)

# Commit
git add .
git commit -m "feat: add your feature description"

# Push
git push origin bugb/feature/your-feature-name

# Create Pull Request on GitHub
```

---

## Troubleshooting

### Issue: `npm install` fails

```bash
# Solution 1: Clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Solution 2: Check Node version
node --version  # Must be v22.15.1+

# Solution 3: Increase memory limit
export NODE_OPTIONS="--max-old-space-size=8192"
npm install
```

### Issue: Build errors after `git merge`

```bash
# Clean rebuild
rm -rf .build out node_modules
npm install
npm run watch
```

### Issue: "Too many open files" (macOS)

```bash
# Increase file limit
ulimit -n 4096

# Make permanent (add to ~/.zshrc or ~/.bashrc)
echo "ulimit -n 4096" >> ~/.zshrc
```

### Issue: Changes not reflected in IDE

```bash
# Stop npm run watch (Ctrl+C)
rm -rf out
npm run watch
# Relaunch IDE
```

### Issue: Specter won't start

```bash
# Check what's actually built
ls -la .build/electron/

# If you see "Code - OSS.app" instead of "Specter.app":
# Need full rebuild after product name change
rm -rf .build
npm run watch
# Wait for compilation to finish
./scripts/code.sh
```

---

## IDE Shortcuts

### Development Mode

| Shortcut | Action |
|----------|--------|
| **Cmd+R** (Mac) / **Ctrl+R** (Win) | Reload window |
| **Cmd+Shift+P** | Command palette |
| **Cmd+K Cmd+T** | Change theme |
| **Cmd+`** | Toggle terminal |
| **Cmd+B** | Toggle sidebar |

### Debugging

| Shortcut | Action |
|----------|--------|
| **F12** | Open DevTools |
| **Cmd+Shift+I** | Toggle DevTools |
| **Cmd+K Cmd+I** | Show hover info |

---

## Testing Your Setup

### 1. Verify Specter is Running

- Window title should say **"Specter"** (not "Code - OSS")
- Welcome screen should show Specter branding
- Check "About" (Cmd+Shift+P → "About") should show Specter

### 2. Test Basic Features

```bash
# In Specter:
# 1. Open Command Palette (Cmd+Shift+P)
# 2. Should see standard VS Code commands
# 3. Open integrated terminal (Cmd+`)
# 4. Terminal should work
```

### 3. Test a Simple Code Change

```bash
# Edit product.json
# Change "Editing evolved" to "Security Testing Evolved"
# Save file
# Reload window (Cmd+R)
# Check welcome screen - should show new tagline
```

---

## Next Steps

After setup is complete:

1. **Read Documentation**
   - [Ideation Document](01-IDEATION.md) - Product vision
   - [Development Guide](02-DEVELOPMENT.md) - Architecture
   - [Roadmap](04-ROADMAP.md) - Timeline

2. **Join the Team**
   - Discord: [Join here](https://discord.gg/specter)
   - Slack: #specter-dev channel
   - Stand-ups: Mon/Wed/Fri 10am

3. **Pick Your First Task**
   - Check GitHub Issues labeled "good first issue"
   - Review [Contributing Guide](05-CONTRIBUTING.md)
   - Ask questions in Discord

4. **Set Up Your Environment**
   - Install security tools (nmap, etc.)
   - Configure API keys
   - Test certxgen integration

---

## Useful Commands

```bash
# Build commands
npm run watch              # Watch mode (incremental builds)
npm run compile            # One-time compilation
npm run clean              # (doesn't exist, use rm -rf .build out)

# Testing
npm test                   # Run all tests
npm test -- --grep "Agent" # Run specific tests

# Git
git fetch upstream         # Get Microsoft updates
git merge upstream/main    # Merge updates

# Utilities
du -sh node_modules        # Check dependencies size
npm list --depth=0         # Show top-level packages
```

---

## Getting Help

- **Documentation:** `/documents/` folder
- **Discord:** https://discord.gg/specter
- **Email:** dev@bugb.com
- **Issues:** https://github.com/BugB-Tech/bsurf_b2c/issues

---

## Environment Variables Reference

```bash
# .env file (create in project root)

# Required for AI features
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional: Self-hosted LLM
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Optional: Logging
DEBUG=specter:*
LOG_LEVEL=debug

# Optional: Development
NODE_ENV=development
SPECTER_DEV_MODE=true
```

---

## Performance Tips

- **SSD recommended** - Build is I/O intensive
- **16 GB+ RAM** - VS Code compilation is memory-heavy
- **Multi-core CPU** - Parallel compilation speeds up builds
- **Fast internet** - Initial `npm install` downloads ~3 GB

---

*Setup Guide Version: 1.0*  
*Last Updated: October 13, 2025*  
*Maintained by: BugB-Tech Team*
