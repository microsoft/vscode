# Multi-Agent Chat System

## Overview

The Logos multi-agent chat system provides a conversational interface where users can interact with specialized AI agents. It supports threading, branching, and seamless agent handoffs.

## Agents

### Available Agents

| Agent | ID | @-Mention | Specialty |
|-------|-----|-----------|-----------|
| Conductor | `logos.conductor` | `@conductor` | Orchestration, multi-step tasks |
| Software Engineer | `logos.swe` | `@swe` | Code generation, debugging |
| Data Analyst | `logos.data_analyst` | `@da` | Data analysis, visualization |
| Researcher | `logos.researcher` | `@researcher` | Deep research, literature |
| Workspace CA | `logos.workspace_ca` | `@ca` | Documentation, architecture |

### Agent Routing

When no agent is mentioned, the routing policy automatically selects:

```python
AGENT_PATTERNS = {
    "logos.swe": ["refactor", "implement", "fix bug", "write code"],
    "logos.data_analyst": ["analyze", "visualize", "chart", "plot"],
    "logos.researcher": ["research", "investigate", "best practice"],
    "logos.workspace_ca": ["document", "architecture", "explain codebase"],
}
```

## Usage

### Basic Conversation

```
User: How do I implement rate limiting?

Conductor: I'll help you implement rate limiting. Let me analyze the options...
```

### Mentioning Agents

```
User: @swe implement a token bucket rate limiter

SWE: I'll create a token bucket implementation for you...
```

### Multiple Agents

```
User: @researcher what are best practices? @swe then implement

Researcher: Based on my research, the recommended approaches are...

SWE: I'll implement the approach Researcher recommended...
```

## Threading

### Creating Threads

Each conversation starts a new thread. Threads are automatically named based on the first message.

### Branching

Branch from any message to explore alternatives:

1. Hover over a message
2. Click "Branch" button
3. Continue in new branch
4. Original thread preserved

### Thread Navigation

Use ThreadSidebar to:
- Search threads
- Switch between threads
- Delete old threads
- Rename threads

## Context Awareness

### Editor Context

Chat automatically includes:
- Active file path and language
- Current selection (if any)
- Open tabs
- Relevant symbols

### Context Indicator

The ContextIndicator shows what's included:

```
📎 main.ts | Selection: lines 42-56 | 3 symbols
```

Click to expand and see full context.

## Code Actions

### Apply Code

When an agent provides code:

1. Click "Apply" on the code block
2. Code is inserted at cursor or replaces selection
3. Undo with Cmd+Z if needed

### Copy Code

Click "Copy" to copy code to clipboard.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+L` | Open chat panel |
| `Cmd+Shift+A` | Mention agent |
| `Cmd+Enter` | Send message |
| `Cmd+N` | New thread |
| `Cmd+B` | Branch thread |
| `Escape` | Close autocomplete |

## Configuration

In VS Code settings:

```json
{
  "logos.chat.defaultAgent": "logos.conductor",
  "logos.chat.showContext": true,
  "logos.chat.autoSaveThreads": true
}
```

## API

### Send Message

```typescript
await vscode.commands.executeCommand('logos.chat.sendMessage', {
  content: 'Hello world',
  mentions: ['logos.swe'],
});
```

### Get Thread

```typescript
const thread = await vscode.commands.executeCommand('logos.chat.getThread', {
  threadId: 'thread-123',
});
```

## Troubleshooting

### Agent Not Responding

1. Check D3N endpoint connectivity
2. Verify PERSONA authentication
3. Check agent quota limits

### Slow Responses

1. Check tier selection (higher tier = slower)
2. Reduce context size
3. Check network latency

### Context Missing

1. Ensure file is saved
2. Check ContextIndicator for what's included
3. Manually add context with @-file mentions

