# vs/sessions — Agents Window

## Overview

The `vs/sessions` layer hosts the implementation of the **Agents Window**, a dedicated workbench experience optimized for agent session workflows. This is a distinct top-level layer within the VS Code architecture, sitting alongside `vs/workbench`.

The Agents Window (`Workbench`) provides a simplified, fixed-layout workbench tailored for agent session workflows. Unlike the standard VS Code workbench:

- **Fixed layout** — Part positions are not configurable via settings
- **Simplified chrome** — No activity bar, no status bar, no banner
- **Chat-first UX** — Chat bar is a primary part alongside sidebar and auxiliary bar
- **Modal editor** — Editors appear as modal overlays rather than in the main grid
- **Session-aware titlebar** — Titlebar shows the active session, session picker, and signed-in account widget
- **Provider model** — Session backends (local CLI, cloud, remote agent host) register as pluggable providers

**Key constraint:** `vs/sessions` may import from `vs/workbench` (and all layers below it), but `vs/workbench` must **never** import from `vs/sessions`.

## Documentation

| Document | Description |
|----------|-------------|
| [LAYOUT.md](LAYOUT.md) | Workbench layout specification — grid structure, parts, titlebar, per-session layout state |
| [LAYERS.md](LAYERS.md) | Import layering rules — what each layer can and cannot import, ESLint enforcement |
| [SESSIONS.md](SESSIONS.md) | Sessions architecture — layers, provider model, core interfaces, data flow, metadata contract |
| [MOBILE.md](MOBILE.md) | Mobile layout specification |
| [AI_CUSTOMIZATIONS.md](AI_CUSTOMIZATIONS.md) | AI customization design document |
| [copilot-customizations-spec.md](copilot-customizations-spec.md) | Copilot customizations specification |
| [contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md](contrib/providers/copilotChatSessions/COPILOT_CHAT_SESSIONS_PROVIDER.md) | Copilot chat sessions provider details |
| [contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md](contrib/providers/remoteAgentHost/REMOTE_AGENT_HOST_SESSIONS_PROVIDER.md) | Remote agent host provider details |

## Adding New Functionality

When adding features to the Agents Window:

1. **Core workbench code** (layout, parts, services) goes under `browser/` or `services/`
2. **Feature contributions** (views, actions, editors) go under `contrib/<featureName>/browser/`
3. **Session providers** go under `contrib/providers/<providerName>/browser/`
4. Register contributions by importing them in `sessions.desktop.main.ts` (or `sessions.common.main.ts` for browser-compatible code)
5. Non-provider `contrib/*` modules **must not** import from `contrib/providers/*` — see [LAYERS.md](LAYERS.md)
6. Update the layout spec ([LAYOUT.md](LAYOUT.md)) for any layout changes
7. Update the sessions spec ([SESSIONS.md](SESSIONS.md)) when changing provider interfaces or data flow
