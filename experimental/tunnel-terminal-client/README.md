# Tunnel Terminal
## Requirements

- Node.js 22.x or 24.x and npm.
- An interactive terminal, such as Windows Terminal.
- GitHub CLI signed in with an account authorized for the tunnel: `gh auth login`.
- A running remote VS Code tunnel with agent-host support: launcher protocol 5+, port 31546, and Agent Host Protocol 0.9.0.

## Installation

Run from this project folder:
```powershell
npm ci
npm run build
npm link
```

## Usage

```powershell
tunnel                              # Connect; select a machine if needed
tunnel --tunnel my-machine          # Connect to a specific machine
tunnel --force-select               # Always show machine and host pickers
tunnel --list                       # List available machines
tunnel --tunnel my-machine --cwd file:///C:/work
tunnel --no-prompt-prefix            # Leave the remote prompt unchanged
tunnel --no-reuse                   # Connect directly, without a shared connection
tunnel --disconnect                 # Close shared connections
tunnel --help                       # Show all options
```

## Shared connections

Connecting to a machine starts a hidden local broker process that keeps the tunnel relay connected. Later `tunnel` runs, for example a Windows Terminal split pane (Alt+Shift+-), reuse it: they skip GitHub sign-in, tunnel discovery, and the relay handshake, and open their own shell in a couple of seconds. A plain `tunnel` reuses the shared connection when exactly one is open; `--tunnel` selects a specific one, and `--force-select` always shows the pickers.

Each pane has an independent shell, so closing one pane, including the first, does not affect the others. The broker exits after 60 minutes without open shells, or with `tunnel --disconnect`. It is reachable only through a random secret stored in the per-user state directory (`%LOCALAPPDATA%\tunnel-terminal-client` on Windows, `$XDG_STATE_HOME` or `~/.local/state` elsewhere), keeps the access token only in memory, and reconnects the relay if it drops.
