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
tunnel --help                       # Show all options
```
