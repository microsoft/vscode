# Claude Code Session Parser

This module provides type-safe parsing of Claude Code session files stored in JSONL format.

## Overview

Claude Code stores conversation sessions in `~/.claude/projects/{workspace-slug}/` as JSONL files. Each line in a session file is a JSON object representing either:

- **Queue operations**: Session queue state changes (dequeue/enqueue)
- **User messages**: User prompts, including tool results
- **Assistant messages**: Claude's responses, including thinking blocks and tool use
- **Summary entries**: Session labels for display
- **Chain link entries**: Minimal entries for parent-chain resolution

## Architecture

```
sessionParser/
├── claudeSessionSchema.ts      # Type-safe validators using IValidator pattern
├── claudeSessionParser.ts      # Core parsing and session building logic
├── claudeCodeSessionService.ts # VS Code service with caching and file discovery
└── test/                       # Unit tests
    ├── claudeSessionSchema.spec.ts
    └── claudeSessionParser.spec.ts
```

## Key Design Decisions

### 1. Schema Validation (No Type Assertions)

Uses the composable `IValidator<T>` pattern from `platform/configuration/common/validator.ts`:

```typescript
const result = vUserMessageEntry.validate(parsed);
if (result.error) {
    // Handle validation error with message
} else {
    // result.content is properly typed as UserMessageEntry
}
```

This ensures:
- Runtime validation matches static types
- No unsafe `as` casts on parsed JSON
- Detailed error messages for debugging

### 2. Lenient UUID Validation

Real session data may have variations (e.g., agent IDs like "a139fcf"). The UUID validator accepts any non-empty string to handle edge cases while still providing type safety.

### 3. Chain Link Resolution

Some entries exist only for parent-chain resolution (meta messages). The parser:
1. Stores chain links separately from messages
2. Resolves parent UUIDs through chain links when building sessions
3. Handles cycles gracefully (stops at cycle but preserves collected messages)

### 4. Error Reporting

Parse errors include:
- Line number
- Truncated line content
- Parsed type (if available)
- File identifier

Accessible via `service.getLastParseErrors()` and `service.getLastParseStats()`.

### 5. Subagent Session Support

Sessions may contain subagents - parallel task executions spawned via the Task tool. These are stored in:
```
{workspace-slug}/{session-id}/subagents/agent-{id}.jsonl
```

The service automatically:
1. Discovers subagent directories for each session
2. Parses `agent-*.jsonl` files within them
3. Attaches subagent sessions to their parent via `session.subagents`

Each `SubagentSession` contains:
- `agentId`: The short hex identifier (e.g., "a139fcf")
- `messages`: The subagent's conversation history
- `timestamp`: When the subagent last had activity

## Usage

### Via Dependency Injection (Recommended)

```typescript
import { IClaudeCodeSessionService } from './claudeCodeSessionService';

const service = instantiationService.get(IClaudeCodeSessionService);
const sessions = await service.getAllSessions(token);
```

### Direct Parsing (Tests/Scripts)

```typescript
import { parseSessionFileContent, buildSessions } from './claudeSessionParser';

const content = fs.readFileSync(path, 'utf8');
const parseResult = parseSessionFileContent(content);

if (parseResult.errors.length > 0) {
    console.warn('Parse errors:', parseResult.errors);
}

const buildResult = buildSessions(
    parseResult.messages,
    parseResult.summaries,
    parseResult.chainLinks
);
```

## Session File Format

### Queue Operation
```json
{"type":"queue-operation","operation":"dequeue","timestamp":"2026-01-31T00:34:50.025Z","sessionId":"..."}
```

### User Message
```json
{
    "type": "user",
    "uuid": "...",
    "sessionId": "...",
    "timestamp": "2026-01-31T00:34:50.049Z",
    "parentUuid": null,
    "message": {"role": "user", "content": "Hello, Claude!"},
    "cwd": "/path/to/project",
    "version": "2.1.5",
    "gitBranch": "main",
    "slug": "session-name"
}
```

### Assistant Message
```json
{
    "type": "assistant",
    "uuid": "...",
    "sessionId": "...",
    "timestamp": "2026-01-31T00:35:00.000Z",
    "parentUuid": "...",
    "message": {
        "role": "assistant",
        "content": [{"type": "text", "text": "..."}],
        "model": "claude-opus-4-5-20251101",
        "stop_reason": "end_turn",
        "usage": {...}
    }
}
```

### Summary Entry
```json
{"type":"summary","summary":"Implementing dark mode","leafUuid":"..."}
```

## Future Improvements

### 1. Model Information Extraction
The session files contain `message.model` with the exact model used (e.g., "claude-opus-4-5-20251101", "claude-haiku-4-5-20251001"). This could be:
- Displayed in the UI
- Used for model restoration when resuming sessions
- Tracked for analytics

### 2. Token Usage Tracking
Each assistant message includes detailed token usage:
```json
{
    "usage": {
        "cache_creation_input_tokens": 3328,
        "cache_read_input_tokens": 19083,
        "input_tokens": 8,
        "output_tokens": 360
    }
}
```
This could power usage analytics and cost estimation.

### 3. Global History Integration
The `~/.claude/history.jsonl` file contains command history with different schema (Unix timestamps instead of ISO). This could be integrated for:
- Command autocomplete
- Recent session lookup
- Cross-project session discovery

### 4. Thinking Block Display
Assistant messages may contain encrypted thinking blocks with signatures. These could be:
- Shown in a collapsed state
- Used for debugging/understanding Claude's reasoning
- Filtered based on user preferences

### 5. Git Context Restoration
Sessions track `gitBranch` and `cwd`. This metadata could:
- Help navigate to the correct workspace state
- Show branch context in session labels
- Enable branch-aware session filtering

### 6. Windows Path Support
The slug generation handles Windows paths (C:\Users\... → C--Users-...). Further testing needed for:
- UNC paths
- Mapped network drives
- Long paths (>260 chars)

## Testing

Run tests:
```bash
npx vitest --run "sessionParser"
```

## Migration Notes

This module replaces the previous `claudeCodeSessionService.ts` implementation with:
- Strict schema validation (vs unsafe JSON.parse casts)
- Comprehensive error reporting (vs silent failures)
- Better cycle detection (vs potential infinite loops)
- Cleaner separation of concerns (schema → parser → service)
