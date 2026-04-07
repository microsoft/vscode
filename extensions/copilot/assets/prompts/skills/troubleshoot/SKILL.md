---
name: troubleshoot
description: Investigate unexpected chat agent behavior by analyzing direct debug logs in JSONL files. Use when users ask why something happened, why a request was slow, why tools or subagents were used or skipped, or why instructions/skills/agents did not load.
---

# Troubleshoot

## Purpose

This skill investigates and explains unexpected chat agent behavior using direct log files.

Use this skill for questions like:
- Why did this request take so long?
- Why was a tool or subagent called?
- Why did instruction/skill/agent files not load?
- Why was a tool call blocked or failed?
- Why did the model not follow expectations?

Base conclusions on evidence from logs. Do not guess.

## Data Source

- Target session log directory/directories for analysis: `{{VSCODE_TARGET_SESSION_LOG}}`

Use direct debug log files written by Copilot Chat:

```
debug-logs/<sessionId>/
  main.jsonl                              — always start here; primary conversation log
  models.json                             — (optional) snapshot of available models at session start
  system_prompt_0.json                    — (optional) full system prompt sent to the model (untruncated)
  system_prompt_1.json                    — (optional) written when the model changes mid-session
  tools_0.json                            — (optional) tool definitions sent to the model
  tools_1.json                            — (optional) written when the model changes mid-session
  runSubagent-<agentName>-<uuid>.jsonl    — (optional) subagent's tool calls & LLM requests
  searchSubagent-<uuid>.jsonl             — (optional) search subagent work
  title-<uuid>.jsonl                      — (optional, UI-only) title generation
  categorization-<uuid>.jsonl             — (optional, UI-only) prompt categorization
  summarize-<uuid>.jsonl                  — (optional, UI-only) conversation summarization
```

Always read `main.jsonl` first — it has the full conversation flow. Child files only appear when those operations occurred. `main.jsonl` contains `child_session_ref` entries that link to each child file by name. Title, categorization, and summarize files are UI housekeeping and rarely relevant to troubleshooting. When investigating model availability or selection issues, read `models.json` — it contains the full list of models (with capabilities, billing, and limits) that were available when the session started.

When investigating what the model was told (system prompt, instructions), read the `system_prompt_*.json` file referenced by a `system_prompt_ref` entry in `main.jsonl`. The file contains the full untruncated system prompt as `{ "content": "..." }`. When investigating which tools were available, read the `tools_*.json` file similarly. If the model changed mid-session, multiple numbered files exist — each `llm_request` entry has a `systemPromptFile` attr indicating which file was active for that request.

Each line is a JSON object. Common fields: `ts` (epoch ms), `dur` (duration ms), `sid` (session ID), `type`, `name`, `spanId`, `parentSpanId`, `status` (`ok`|`error`), `attrs` (type-specific details).

### Event Type Reference with Examples

#### discovery — customization file loading (instructions, skills, agents, hooks)
```jsonl
{"ts":1773200251309,"dur":0,"sid":"62f52dec","type":"discovery","name":"Load Instructions","spanId":"2cb1f2f4","status":"ok","attrs":{"details":"Resolved 0 instructions in 0.0ms | folders: [/c:/Users/user/.copilot/instructions, /workspace/.github/instructions]","category":"discovery","source":"core"}}
{"ts":1773200251415,"dur":0,"sid":"62f52dec","type":"discovery","name":"Load Agents","spanId":"38a897d8","status":"ok","attrs":{"details":"Resolved 3 agents in 0.0ms | loaded: [Plan, Ask, Explore] | folders: [/workspace/.github/agents]","category":"discovery","source":"core"}}
{"ts":1773200251431,"dur":0,"sid":"62f52dec","type":"discovery","name":"Load Skills","spanId":"472eb225","status":"ok","attrs":{"details":"Resolved 6 skills in 0.0ms | loaded: [agent-customization, troubleshoot, ...]","category":"discovery","source":"core"}}
```
Key attrs: `details` (human-readable summary with folder paths, loaded items, skip reasons), `category` (always `"discovery"`), `source` (`"core"`).

#### tool_call — tool invocation (success or failure)
```jsonl
{"ts":1773200222647,"dur":4,"sid":"62f52dec","type":"tool_call","name":"manage_todo_list","spanId":"000000000000000b","parentSpanId":"0000000000000003","status":"ok","attrs":{"args":"{\"operation\":\"read\"}","result":"No todo list found."}}
{"ts":1773200234047,"dur":8937,"sid":"62f52dec","type":"tool_call","name":"run_in_terminal","spanId":"000000000000000d","parentSpanId":"0000000000000003","status":"error","attrs":{"args":"{\"command\":\"echo rama\"}","result":"ERROR: conpty.node missing","error":"A native exception occurred during launch"}}
```
Key attrs: `args` (JSON string of tool input), `result` (tool output or error text), `error` (present when `status:"error"`).

#### llm_request — model round-trip
```jsonl
{"ts":1773200231010,"dur":3001,"sid":"62f52dec","type":"llm_request","name":"chat:gpt-4o","spanId":"000000000000000c","parentSpanId":"0000000000000003","status":"ok","attrs":{"model":"gpt-4o","inputTokens":15025,"outputTokens":126,"ttft":1987,"maxTokens":32000,"systemPromptFile":"system_prompt_0.json","userRequest":"echo hello","inputMessages":"[{...}]"}}
```
Key attrs: `model`, `inputTokens`, `outputTokens`, `ttft` (time to first token in ms), `maxTokens`, `temperature`, `topP`, `systemPromptFile` (references a system prompt file in the session directory), `toolsFile` (references a tools file in the session directory), `userRequest` (the full user message content, untruncated), `inputMessages` (full messages array as JSON, pre-truncated at 64KB), `error` (when failed).

#### agent_response — model output (text + tool calls)
```jsonl
{"ts":1773200234011,"dur":0,"sid":"62f52dec","type":"agent_response","name":"agent_response","spanId":"agent-msg-000000000000000c","parentSpanId":"0000000000000003","status":"ok","attrs":{"response":"[{\"role\":\"assistant\",...}]","reasoning":"The user wants me to run a command."}}
```
Key attrs: `response` (JSON-encoded array of message parts; may be truncated), `reasoning` (optional — the model's chain-of-thought/thinking text when thinking mode is active; may be truncated).

#### user_message — user input
```jsonl
{"ts":1773200251345,"dur":0,"sid":"62f52dec","type":"user_message","name":"user_message","spanId":"000000000000000f","status":"ok","attrs":{"content":"using subagent count .md"}}
```
Key attrs: `content` (the user's message text).

#### subagent — subagent invocation
```jsonl
{"ts":1773200254954,"dur":7921,"sid":"62f52dec","type":"subagent","name":"Explore","spanId":"0000000000000014","parentSpanId":"0000000000000013","status":"ok","attrs":{"agentName":"Explore"}}
```
Key attrs: `agentName`, `description` (optional), `error` (when failed).

#### generic — miscellaneous events
```jsonl
{"ts":1773200260000,"dur":0,"sid":"62f52dec","type":"generic","name":"some-event","spanId":"abc123","status":"ok","attrs":{"details":"Additional context","category":"some-category"}}
```

Special generic entries:
- `system_prompt_ref` — references a `system_prompt_*.json` file in the session directory. `attrs.file` is the filename, `attrs.model` is the model it was written for. Read this file to see the full system prompt.
- `tools_ref` — references a `tools_*.json` file. `attrs.file` is the filename, `attrs.model` is the model.

#### session_start — session metadata (appears once at session start)
```jsonl
{"ts":1773200251300,"dur":0,"sid":"62f52dec","type":"session_start","name":"session_start","spanId":"session-start-62f52dec","status":"ok","attrs":{"copilotVersion":"0.43.2026033104","vscodeVersion":"1.99.0"}}
```
Key attrs: `copilotVersion`, `vscodeVersion`. Useful for identifying which build produced the logs.

#### turn_start / turn_end — tool-calling loop iteration boundaries
```jsonl
{"ts":1773200251400,"dur":0,"sid":"62f52dec","type":"turn_start","name":"turn_start:0","spanId":"turn-start-X-0","status":"ok","attrs":{"turnId":"0"}}
{"ts":1773200255000,"dur":0,"sid":"62f52dec","type":"turn_end","name":"turn_end:0","spanId":"turn-end-X-0","status":"ok","attrs":{"turnId":"0"}}
```
Key attrs: `turnId` (iteration number within a single user request's tool-calling loop). Use these to identify which iteration events belong to and to count total loop iterations.

### Reading the event hierarchy

Events form a tree via `spanId`/`parentSpanId`. A typical chain:
1. `user_message` (spanId: `X`) — the user's turn
2. `llm_request` (parentSpanId: `X`) — model call for that turn
3. `agent_response` (parentSpanId: `X`) — what the model returned
4. `tool_call` (parentSpanId: `X`) — tool executed from the response
5. Another `llm_request` (parentSpanId: `X`) — next model call after tool result

Subagent calls create nested hierarchies: the `tool_call` for `runSubagent` (spanId: `Y`) becomes the parent for a child `subagent` span, which in turn parents its own `llm_request`/`tool_call` events.

## Tooling Strategy (important)

Debug log files live outside the workspace (in user storage), so workspace-scoped search tools like `grep_search` cannot access them. Use the terminal instead.

**Do not use `grep_search` for log files — it only works on workspace files.**

### macOS / Linux / WSL / Git Bash

Use `run_in_terminal` with `grep` or `jq`:
- Find errors: `grep '"status":"error"' <logPath>`
- Find discovery events: `grep '"type":"discovery"' <logPath>`
- Find slow events (duration > 5s): `jq -c 'select(.dur > 5000)' <logPath>`
- Find tool calls: `grep '"type":"tool_call"' <logPath>`
- Search for specific text: `grep 'search_term' <logPath>`
- Get last N lines: `tail -n 50 <logPath>`
- Count events by type: `jq -r '.type' <logPath> | sort | uniq -c | sort -rn`
- Extract specific fields: `jq -c '{type, name, status, dur}' <logPath>`
- Filter by type and show details: `jq -c 'select(.type == "discovery")' <logPath>`
- Find user messages: `jq -c 'select(.type == "user_message") | .attrs.content' <logPath>`

### Windows (PowerShell)

Use `run_in_terminal` with PowerShell commands:
- Find errors: `Select-String '"status":"error"' <logPath>`
- Find discovery events: `Select-String '"type":"discovery"' <logPath>`
- Find tool calls: `Select-String '"type":"tool_call"' <logPath>`
- Search for specific text: `Select-String 'search_term' <logPath>`
- Get last N lines: `Get-Content <logPath> -Tail 50`
- Parse and filter with Node.js (always available): `node -e "require('fs').readFileSync('<logPath>','utf8').split('\n').filter(Boolean).map(JSON.parse).filter(e => e.dur > 5000).forEach(e => console.log(JSON.stringify(e)))"`
- Count events by type: `node -e "const lines=require('fs').readFileSync('<logPath>','utf8').split('\n').filter(Boolean).map(JSON.parse);const c={};lines.forEach(e=>c[e.type]=(c[e.type]||0)+1);Object.entries(c).sort((a,b)=>b[1]-a[1]).forEach(([t,n])=>console.log(n,t))"`

### General rules

- **Log files can be very large** (tens of MB or more for long sessions). Always check file size first if unsure: `ls -lh <logPath>` (or `(Get-Item <logPath>).Length` on Windows). If the file is large, avoid commands that load the entire file into memory (e.g. `node -e` with `readFileSync`). Prefer streaming tools like `grep`, `jq`, `Select-String`, `tail`, or `head`.
- Use `read_file` only for small targeted ranges (a few lines) once you know the line numbers. Never read entire log files.
- Use `run_in_terminal` with `ls -lh` (or `dir` on Windows) to locate candidate `.jsonl` files and check their sizes.
- On Windows, if `grep`/`jq` are not available, fall back to `Select-String` or `node -e` one-liners (only for smaller files).

## Investigation Workflow

1. Identify the log file(s)
- **Focus on the session log directories provided in the Runtime Log Context section above.** Start by reading `main.jsonl` in each directory.
- If multiple session directories are listed, investigate all of them — the user wants to compare or find common patterns across sessions.
- Only search other session files in the debug-logs directory if the issue spans multiple sessions or the provided sessions don't contain relevant events.

2. Triage quickly via `run_in_terminal` (use `grep`/`jq` on macOS/Linux, `Select-String`/`node -e` on Windows)
- Errors: search for `"status":"error"`
- Latency: filter for high `dur` values (> 5000)
- Discovery issues: search for `"type":"discovery"`
- Tool behavior: search for `"type":"tool_call"`
- Model behavior: search for `"type":"llm_request"`

3. Read only relevant slices
- Pull exact lines around suspicious events.
- Correlate with `spanId` / `parentSpanId` when needed.

4. Determine root cause
- Pick the most likely cause from evidence.
- If multiple factors contribute, order by impact.

5. Provide remediation
- Offer concrete next steps when possible.

## Network Issue Investigation

If you suspect network connectivity or authentication problems (e.g., repeated request timeouts, 401/403 errors, or model endpoint failures in the logs), run the VS Code command `github.copilot.debug.collectDiagnostics` using the `run_vscode_command` tool. The command returns the full diagnostics report as a string, so you can read the result directly from the tool output. The report includes:
- Authentication and token status
- Network reachability checks
- Proxy and certificate configuration
- Extension and environment details

The command also opens the report in an editor for the user to see. Use the returned string to diagnose the network issue.

## Customization Documentation Reference

When investigating issues related to a specific type of customization file (instructions, prompt files, agents, etc.) and you need more details about the expected format or behavior, load the relevant documentation page:

- Custom instructions: `https://code.visualstudio.com/docs/copilot/customization/custom-instructions`
- Prompt files: `https://code.visualstudio.com/docs/copilot/customization/prompt-files`
- Custom agents: `https://code.visualstudio.com/docs/copilot/customization/custom-agents`
- Language models: `https://code.visualstudio.com/docs/copilot/customization/language-models`
- MCP servers: `https://code.visualstudio.com/docs/copilot/customization/mcp-servers`
- Hooks: `https://code.visualstudio.com/docs/copilot/customization/hooks`
- Agent plugins: `https://code.visualstudio.com/docs/copilot/customization/agent-plugins`

Use these when you need to verify file format expectations, confirm supported fields, or help the user fix a customization file.

## Last Resort — Copilot Issues Wiki

When your investigation yields no clear root cause or you have no specific remediation suggestions:

1. Load the Copilot Issues wiki page: `https://github.com/microsoft/vscode/wiki/Copilot-Issues`.
2. Search the returned wiki content for sections relevant to the user's problem.
3. Summarize the applicable troubleshooting steps from the wiki in your response.
4. If the wiki contains relevant guidance, present those steps as concrete suggestions the user can try.
5. If even the wiki has no relevant information, tell the user: "The diagnostics logs do not show a clear cause for this behavior, and the known issues wiki does not cover this scenario. Consider filing an issue at https://github.com/microsoft/vscode/issues."

## Response Guidelines

Your response should cover:
- What happened and why (the root cause or most likely explanation)
- Key evidence from logs (paraphrased, not raw dumps)
- How to fix it or what to try next

You do not need separate headers for each of these. For straightforward issues, a short combined explanation with a "How to fix" section is fine. Use more structure (headers, multiple sections) only when the issue is complex or involves multiple contributing factors.

### Formatting
- Use headers, bullet points, and bold text to make the response scannable.
- Keep paragraphs short. Prefer lists over walls of text.
- When citing log evidence, paraphrase or summarize rather than pasting raw log lines. If a specific detail is important (e.g., an error message), quote just that message — not entire log entries.
- Use tables when comparing multiple values or events (e.g., a name mismatch, latency breakdown across steps).

### Abstraction level
- Do not narrate your investigation process. Never say things like "I'm investigating the session debug log…", "I found the key clue in the log…", or "I'm now checking the skill file metadata…". Jump straight to the findings.
- Do not use internal terminology like "discovery summary", "frontmatter name", "the loader", "event hierarchy", or "span tree". Describe what happened in plain language the user can act on.
- Do not describe the internal log file structure, event types, or JSONL format to the user — they do not need to know these implementation details.
- Refer to log files abstractly (e.g., "the debug log" or "the session log") rather than by literal filenames like `main.jsonl` or `runSubagent-Explore-abc123.jsonl`.
- Focus on what happened and why, not how you found it.

### Example

**Bad** (narrates investigation, uses internal terms, pastes raw log):
> I'm investigating the session debug log to confirm whether a testing skill was discovered. In the skills discovery summary, the loader reports: `skipped: testing2 (name-mismatch)`. The frontmatter name in SKILL.md doesn't match the folder identity.

**Good** (concise, user-friendly, actionable):
> The "testing" skill was found but not loaded because there's a name mismatch between the folder and the skill file:
>
> | | Value |
> |---|---|
> | **Folder name** | `testing` |
> | **Name in SKILL.md** | `testing2` |
>
> These must match for the skill to load.
>
> **How to fix**
>
> Either:
> - Change `name: testing2` to `name: testing` in your SKILL.md, **or**
> - Rename the folder from `testing/` to `testing2/`
>
> Then start a new chat session so it gets picked up.

## Important Rules

- Never assume causality without evidence.
- Use `run_in_terminal` to search log files — never use `grep_search` (it cannot access files outside the workspace). Use `grep`/`jq` on macOS/Linux, `Select-String`/`node -e` on Windows.
- Never read entire log files with `read_file` — they can be very large. Search first, then `read_file` for small targeted ranges.
- Keep log access targeted and efficient.
- If you suspect network issues, run `github.copilot.debug.collectDiagnostics` via the `run_vscode_command` tool and use the returned diagnostics string before concluding.
- If no clear cause is found, consult the Copilot Issues wiki before giving up. If even the wiki has no relevant information, say so explicitly.
