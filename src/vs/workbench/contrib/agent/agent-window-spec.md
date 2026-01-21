# Agent Window Architecture

The Agent window is a minimal VS Code window type with custom HTML/JS/layout (not standard workbench), its own extension host, and minimal service footprint.

## File Structure

```
src/vs/code/electron-browser/agent/
  agent.html                    -- HTML shell with CSP

src/vs/workbench/
  workbench.agent.desktop.main.ts  -- Entry point
  electron-browser/
    agent.main.ts               -- Bootstrap, service initialization
  contrib/agent/
    browser/
      agentWindow.ts            -- UI layout and chat components
```

## Layering

Follows VS Code's standard layering pattern:

| Layer | Purpose | Import Rules |
|-------|---------|--------------|
| `electron-browser/` | Service bootstrap | No `contrib/` imports |
| `contrib/agent/browser/` | UI code | Can import from `contrib/` (chat components, etc.) |

This matches how features like `contrib/debug/` and `contrib/chat/` are structured.

## Key Concepts

### Service Setup

The entry point imports `workbench.desktop.main.js` which registers all singletons via side-effects. Then:

1. **Core platform services** are created manually (main process, product, environment, files, storage, etc.)
2. **Registered singletons** are collected via `getSingletonServiceDescriptors()`
3. **Stub services** are provided for unused features (notifications, layout)

### CSP Configuration

The HTML entry point requires specific Content Security Policy settings:
- `trusted-types` must include policy names used by the code (e.g., `agentWindow`)
- `blob:` for dynamically loaded modules
- `'unsafe-inline'` for import map script injection

### CSS Loading

CSS files can't be loaded as ES modules. VS Code uses import maps with blob URLs - the main process passes `configuration.cssModules` which get converted to blob URLs containing JS that loads CSS via `<link>` elements.

## Testing

Open via Command Palette: `Developer: Agent Window`

## Learnings

1. **Service dependencies**: When adding services, always add their dependencies. Extension service alone requires ~15+ dependent services.

2. **SharedProcessRemoteService**: Services registered via `registerSharedProcessRemoteService` require `ISharedProcessService` first.

3. **Extension Management vs Extension Service**:
   - `IExtensionService` - lifecycle, activation, API
   - `IWorkbenchExtensionManagementService` - installed extensions

4. **Platform imports**: Use `electron-browser` services for desktop, `browser` for web.
