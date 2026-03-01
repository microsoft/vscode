# Mia Terminal

> Terminal profile for miadi-code agent.

## Desired Outcome
Developers launch a pre-configured terminal profile that connects to the miadi-code agent — providing CLI-based agentic interaction alongside the graphical panels, with link detection for narrative references.

## Current Reality
VS Code terminal supports custom profiles but none exist for narrative agents.

## Structural Tension
Terminal is where many developers feel most powerful. Providing a miadi-code terminal profile respects that preference while connecting to the narrative system.

---

## Components

### TerminalProfile
Registered terminal profile for miadi-code.
- **Behavior:** Register a terminal profile via `TerminalProfileProvider`:
  - **Name**: "Mia Agent Terminal"
  - **Icon**: Three-circle icon
  - **Shell**: Launches `miadi-code` CLI if available, falls back to default shell with mia environment variables set
  - **Environment**: Sets `MIA_SERVER_URL`, `MIA_SESSION_ID`, `MIA_UNIVERSE` from VS Code settings
  - Appears in terminal profile dropdown alongside bash/zsh/PowerShell

### TerminalLinkProvider
Clickable links in terminal output.
- **Behavior:** Register a `TerminalLinkProvider` that detects:
  - `STC:chart-id` → Opens chart detail webview
  - `BEAT:beat-id` → Opens beat in story monitor
  - `NCP:file.ncp.json` → Opens file in editor
  - `SPEC:spec-name` → Opens referenced specification
  - Links highlighted with universe accent color on hover

### TerminalCommandDetection
Terminal command observation.
- **Behavior:** Monitor terminal command execution (via shell integration API when available):
  - Detect `git commit`, `git push` → Suggest story beat creation
  - Detect `npm test`, `pytest` → Log test cycle as engineering beat
  - Detect `miaco` commands → Show results in appropriate sidebar view
  - Detection is passive — suggestions appear as non-intrusive notifications

---

## Supporting Structures
- Extension directory: `extensions/mia-terminal/`
- Activation: `onTerminalProfile:mia.agent`
- Depends on: `mia.three-universe` (for settings, server URL)
- Shell integration required for command detection (graceful degradation without it)
- Fulfills: `mia-code-server/rispecs/agentic-ide/06-terminal-integration`
