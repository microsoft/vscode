# AI Studio IDE

A lightweight AI-powered desktop IDE built for solo founders. Fast, minimal, and production-ready.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Zustand
- **Editor:** Monaco Editor
- **Terminal:** xterm.js
- **Desktop:** Electron
- **Backend:** Node.js, Express
- **Database:** SQLite (better-sqlite3)
- **AI:** OpenAI-compatible API
- **Build:** Vite + esbuild
- **Package:** Electron Builder

## Project Structure

```
app/
├── frontend/          # React UI (Vite)
│   └── src/
│       ├── components/  # React components
│       ├── stores/      # Zustand state management
│       ├── styles/      # Tailwind CSS
│       └── types/       # TypeScript types
├── electron/          # Electron main process
├── backend/           # Express REST API
│   └── src/
│       ├── routes/      # API endpoints
│       ├── services/    # Business logic
│       └── middleware/  # Auth, validation
├── shared/            # Shared types & utilities
├── ai/                # AI provider integration
├── storage/           # SQLite database layer
└── scripts/           # Build & dev scripts
```

## Features

### Core IDE
- Monaco Editor with multi-tab editing
- File explorer with tree view
- Built-in terminal (xterm.js)
- Command palette (Ctrl+Shift+P)
- File search across project
- Auto-save
- Syntax highlighting for 25+ languages

### AI Assistant
- AI chat sidebar with streaming responses
- Explain selected code
- Fix code errors
- Generate files and components
- Terminal command suggestions
- OpenAI-compatible (works with GPT, Claude, DeepSeek, etc.)

### Business Ready
- Local-first auth (expandable to full auth)
- Subscription-ready architecture
- Usage tracking
- Settings system with persistence
- Error logging

## Quick Start

### Prerequisites
- Node.js 20+
- npm 9+

### Development

```bash
cd app

# Install dependencies
npm install
cd frontend && npm install && cd ..

# Start development (Vite + Electron)
npm run dev
```

### Build

```bash
# Build for current platform
npm run package

# Platform-specific builds
npm run package:win    # Windows .exe
npm run package:mac    # macOS .dmg
npm run package:linux  # Linux AppImage
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+Shift+P | Command Palette |
| Ctrl+O | Open Folder |
| Ctrl+B | Toggle Sidebar |
| Ctrl+` | Toggle Terminal |
| Ctrl+Shift+A | Toggle AI Panel |
| Ctrl+S | Save File |
| Ctrl+Shift+F | Search in Files |
| Ctrl+, | Settings |

## AI Configuration

1. Open Settings (Ctrl+,)
2. Enter your API key under **AI > API Key**
3. Choose your preferred model
4. Optionally set a custom base URL for alternative providers

Supports any OpenAI-compatible API (OpenAI, Anthropic via proxy, DeepSeek, Ollama, etc.)

## Releases & Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide.

### Quick Release

```bash
cd app

# Set your GitHub token
export GH_TOKEN=your_token

# Release a patch version (1.0.0 → 1.0.1)
./scripts/release.sh patch
```

This bumps the version, tags, pushes, and GitHub Actions builds + publishes installers for all platforms automatically.

### Manual Publish

```bash
npm run publish          # Build + publish to GitHub Releases
npm run publish:win      # Windows only
npm run publish:mac      # macOS only
npm run publish:linux    # Linux only
```

### Auto Updates

Built-in via `electron-updater`. The app checks for updates on startup and every 4 hours. Updates download in the background and install on next quit.

## Architecture Decisions

- **Single codebase** — everything in one repo
- **No microservices** — embedded backend in Electron
- **SQLite** — zero-config local database
- **Zustand** — minimal state management
- **Vite** — fast HMR development
- **esbuild** — fast Electron compilation
- **IPC** — secure Electron IPC with context isolation
- **GitHub Releases** — automated CI/CD with Electron Builder
- **electron-updater** — seamless auto-updates

## License

MIT
