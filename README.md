# cocode

Calm, precise, and collaborative. cocode is a streamlined fork of VS Code with first-class real-time collaboration and a minimal surface area.

---

## Overview

cocode focuses on what matters: writing and reviewing code together. It introduces built-in collaborative editing with color-coded cursors and selections, synchronized file operations, and simple language run tasks for C, C++, and Python. By removing non-essential features and telemetry, cocode stays fast, quiet, and predictable.

- **Real-time collaboration** powered by CRDTs
- **Color-coded presence** with names and selections
- **Project sync** for create/rename/delete events
- **Local first**: test on `localhost`, graduate to hosted
- **Lean build support**: C, C++, Python tasks

> Visual theming is designed to align with a calm, Apple-like developer aesthetic. Theming work is staged for later milestones.

---

## Quickstart (Localhost)

### Prerequisites
- Node.js 18+
- Git
- Toolchains for your language (e.g., `gcc/g++`, `python`)

### 1) Build the editor
```bash
# from repo root
pnpm install   # or yarn/npm if your fork requires it
pnpm build
```

### 2) Start the collaboration server
```bash
cd server
pnpm install
pnpm dev
# server listens on ws://localhost:3001
```

### 3) Launch cocode

Desktop: run the desktop build task your fork provides, then open a folder.

Web: run the web server task (typically `pnpm web` in VS Code forks) and open the served URL.

### 4) Start or join a session

Open the Command Palette and run:

- `cocode: Start Collaboration Session` (host)
- `cocode: Join Collaboration Session` (joiner)

Set **Settings → cocode Collaboration → Server URL** if not `ws://localhost:3001`.

---

## Collaboration

Each participant’s cursor and selection are shown with a consistent color and an inline name label.

Edits are merged via CRDTs; conflicts resolve automatically.

File create/rename/delete events are broadcast to all participants.

---

## Commands

- `cocode: Start Collaboration Session`
- `cocode: Join Collaboration Session`
- `cocode: Leave Collaboration Session`
- `cocode: Collab Status`
- `cocode: Scaffold C/C++/Python Tasks`

---

## Settings

- `cocode.collab.serverUrl`: WebSocket endpoint (default `ws://localhost:3001`)
- `cocode.collab.username`: Optional display name

---

## Build & Run (C / C++ / Python)

Use `cocode: Scaffold C/C++/Python Tasks` to create `.vscode/tasks.json` with:

- C++: `g++` build and run
- C: `gcc` build and run
- Python: `python` run

Invoke tasks from the Command Palette or the Run & Debug panel. Ensure your compiler/interpreter is on PATH.

---

## Architecture

**Extension**: `extensions/cocode-collab/`

- Text synchronization via a CRDT bridge
- Presence and cursor decorations
- File operation synchronization

**Server**: `server/`

- WebSocket fan-out per room
- Awareness relay for presence and selections

The extension supports both desktop and web extension hosts. The server is a minimal development service and can be replaced with a production-grade host later.

---

## Product Choices

- Telemetry is disabled by default.
- Non-essential built-in extensions and tours are removed to reduce surface area and startup time.
- Visuals will align with a calm developer aesthetic in a future milestone.

---

## Roadmap

- **v0 (this build):** Localhost collaboration, presence, file sync, language tasks.
- **v1:** Authenticated sessions, shareable invites, reconnect handling, buffered FS ops.
- **v2:** Hosted WebSocket (Edge runtime) and project rooms, read-only guests, audit trail.
- **v3:** Theming layer and motion per design extract; light/dark dual-accent system.

---

## License

cocode is a derivative work of VS Code. See LICENSE files for details.

