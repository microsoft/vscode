---
applyTo: "**/agent/**"
description: Architecture documentation for VS Code Agent window component
---

# Agent Window Architecture

For complete implementation details, see:
`src/vs/workbench/contrib/agent/agent-window-spec.md`

## Quick Reference

The Agent window is a minimal VS Code window type with:
- Custom HTML/JS/layout (not standard workbench)
- Its own extension host
- Minimal service footprint

### Testing
Open via Command Palette: `Developer: Agent Window`

## Learnings

(Will be populated as the feature evolves)

