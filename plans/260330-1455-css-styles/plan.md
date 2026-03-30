---
name: CSS Styles for Multi-Agent Views
status: pending
priority: medium
branch: sensitive-rat
date: 2026-03-30
blockedBy: []
blocks: []
---

# CSS Styles for Multi-Agent Views

> Add CSS styling for Providers view (quota bars, health badges, account nodes) and Agent Lanes view (agent cards, tracking board, state colors)

## Pattern
VS Code uses direct CSS imports in `.ts` files: `import './media/multiAgent.css'`

## Files to Create
- `src/vs/workbench/contrib/multiAgent/browser/media/multiAgent.css`

## Files to Modify
- `providersViewPane.ts` — add `import './media/multiAgent.css'`
- `agentLanesViewPane.ts` — add `import './media/multiAgent.css'`

## CSS Classes to Style

### Providers View
| Class | Purpose |
|-------|---------|
| `.multi-agent-providers-view` | Container |
| `.quota-dashboard` | Dashboard section |
| `.quota-dashboard-header` | Section header |
| `.quota-row` | Single provider quota row |
| `.quota-provider-name` | Provider name label |
| `.quota-bar-container` | Bar background |
| `.quota-bar` | Filled bar |
| `.quota-bar-healthy/warning/critical` | Color variants (green/yellow/red) |
| `.quota-stats` | Percentage text |
| `.quota-reset-timer` | Reset countdown |
| `.provider-node` | Provider tree item |
| `.provider-header` | Provider header with badge |
| `.provider-health-badge` | Health dot (green/yellow/red) |
| `.badge-healthy/warning/critical` | Badge color variants |
| `.account-node` | Account list item |
| `.account-status` | Status indicator dot |
| `.account-quota` | Quota percentage |

### Agent Lanes View
| Class | Purpose |
|-------|---------|
| `.multi-agent-lanes-view` | Container |
| `.tracking-board` | Board section |
| `.tracking-board-header` | Header with count |
| `.agent-cards-grid` | Card grid layout |
| `.agent-card` | Individual agent card |
| `.agent-card-running/queued/blocked/error/idle/done` | State border colors |
| `.agent-card-header` | Card header with icon |
| `.agent-state-icon` | State indicator |
| `.state-running/queued/blocked/error/idle/done` | State icon colors |
| `.agent-card-name/role/model/provider` | Card fields |
| `.agent-card-task` | Current task (truncated) |
| `.agent-card-tokens` | Token usage |
| `.agent-card-error` | Error display |
| `.available-agents` | Available section |

## Design Tokens
- Use VS Code theme variables (`--vscode-*`) for colors
- Respect dark/light/high-contrast themes
- Compact spacing for sidebar constraints
