/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SkillProvider } from '@github/copilot-sdk';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../common/agentHostCustomizationUri.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { CustomizationLoadStatus, customizationId, type DirectoryCustomization } from '../../common/state/sessionState.js';

const troubleshootName = 'troubleshoot';
const skillsDirectory = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skills' });
const troubleshootUri = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/troubleshoot' });

function troubleshootDescriptor() {
	return {
		name: troubleshootName,
		description: localize('copilot.builtinTroubleshoot.description', "Investigate unexpected Copilot session behavior, slow requests, tool failures, and customization loading by analyzing session event logs."),
		userInvocable: true,
	};
}

/** Publishes the host-owned skill without exporting session-specific paths to clients. */
export function buildCopilotBuiltinSkillsContainer(): DirectoryCustomization {
	const uri = skillsDirectory.toString();
	const skillUri = troubleshootUri.toString();
	const { name, description } = troubleshootDescriptor();
	return {
		type: CustomizationType.Directory,
		id: customizationId(uri),
		uri,
		name: 'builtin',
		enabled: true,
		contents: CustomizationType.Skill,
		writable: false,
		load: { kind: CustomizationLoadStatus.Loaded },
		children: [{
			type: CustomizationType.Skill,
			id: customizationId(skillUri),
			uri: skillUri,
			name,
			description,
		}],
	};
}

/** Supplies paths for the exact SDK conversation on create and resume, including peer chats. */
export function createCopilotSkillProvider(sdkConversationId: string, copilotHome: URI): SkillProvider {
	const sessionStateDirectory = joinPath(copilotHome, 'session-state');
	const eventsFile = joinPath(sessionStateDirectory, sdkConversationId, 'events.jsonl');
	return {
		listSkills: () => [troubleshootDescriptor()],
		readSkill: (name, { signal }) => {
			if (name !== troubleshootName) {
				return undefined;
			}
			signal.throwIfAborted();
			const context = [
				`Current conversation events file (JSON-encoded host path): ${JSON.stringify(eventsFile.fsPath)}`,
				`Session-state directory (JSON-encoded host path): ${JSON.stringify(sessionStateDirectory.fsPath)}`,
			].join('\n');
			return troubleshootSkillContent.replace('{{COPILOT_SESSION_LOG_CONTEXT}}', () => context);
		},
	};
}

const troubleshootSkillContent = `# Troubleshoot

## Purpose

This skill investigates and explains unexpected agent behavior in the **current Copilot agent session** using its on-disk event log.

Use this skill for questions like:
- Why did this request take so long?
- Why was a tool called (or not called)?
- Why did an instruction/skill/agent file not load?
- Why did a tool call fail?
- Why did the model not follow expectations?

Base every conclusion on evidence from the event log. Do not guess.

## Locating the Session Log

The skill runs **inside** the Copilot agent host, so the log is on the same machine as the agent, including for SSH, WSL, and container hosts. Use the host's read or terminal tools; workspace-scoped search tools cannot find logs outside the workspace.

1. **Attached session:** if the request contains an attached chat session and its session events file, investigate that file rather than the current conversation. Multiple attachments can be compared. A user-provided \`Session log:\` path also takes precedence over the current conversation.
2. **Follow-up:** keep analyzing the same referenced session established earlier in this conversation unless the user selects a different target.
3. **Current conversation:** otherwise use the exact current conversation log below. Do not select the newest log: other conversations can be running concurrently.
4. **Other sessions:** search the supplied session-state directory only when the user asks to investigate another session without attaching it. Each SDK conversation has its own \`<sdk-conversation-id>/events.jsonl\` there. If a target is missing or unreadable, report that rather than silently switching sessions.

{{COPILOT_SESSION_LOG_CONTEXT}}

## Data Source — \`events.jsonl\`

Each line is a JSON object sharing one envelope:

\`\`\`json
{ "type": "...", "id": "...", "parentId": "...", "agentId": "...", "timestamp": "ISO-8601", "data": { } }
\`\`\`

- \`type\` — the event kind (see below).
- \`id\` — unique event id.
- \`parentId\` — the **chronologically preceding** event, not a logical parent. It is a flat back-pointer over every event, *not* the user → turn → tool-call hierarchy. Do not treat it as a logical parent.
- \`agentId\` — present for sub-agent events; absent for the main agent and session-level events.
- \`timestamp\` — ISO-8601 time. Compute durations by differencing timestamps (e.g. a tool's start vs. its completion, a turn's \`assistant.turn_start\` vs. the \`assistant.message\`).
- \`data\` — type-specific payload.

### Event types (\`data.*\` fields)

- **\`session.start\`** (once) — \`selectedModel\`, \`reasoningEffort\`.
- **\`user.message\`** — \`content\`; \`transformedContent\` (expanded prompt, when it differs).
- **\`assistant.turn_start\` / \`assistant.turn_end\`** — \`turnId\`; measure a turn's duration vs the following \`assistant.message\`.
- **\`assistant.message\`** — \`model\`, \`outputTokens\`, \`content\`, \`reasoningText\` (thinking, when present), \`turnId\`, \`parentToolCallId\` (set \u21D2 sub-agent turn spawned by that tool call).
- **\`tool.execution_start\`** — \`toolName\`, \`toolCallId\`, \`arguments\`, \`parentToolCallId\` (set \u21D2 nested/sub-agent).
- **\`tool.execution_complete\`** — \`toolCallId\` (matches start), \`success\`, \`result\`. Pair with its start by \`toolCallId\` for the full call + duration.
- **\`session.shutdown\`** (once, at end) — \`modelMetrics[*].usage\`, \`totalNanoAiu\`. Absent mid-session.
- Other (\`hook.*\`, \`permission.*\`, \`system.message\`) — inspect \`data\` as needed.

### Reconstructing the flow

Iterate records in order and rebuild the logical tree from context:
- \`session.start\` is the root.
- a \`user.message\` begins a turn.
- an \`assistant.message\` answers the current \`user.message\` — unless it has \`data.parentToolCallId\`, in which case it belongs to the sub-agent spawned by that tool call.
- a \`tool.execution_start\` belongs to the current \`assistant.message\` — unless it has \`data.parentToolCallId\`, in which case it is nested under that parent tool call.
- pair each \`tool.execution_start\` with its \`tool.execution_complete\` by \`toolCallId\`.

## Secondary Source — Agent Host Wire Log (protocol communication)

\`events.jsonl\` is the **primary** source and answers almost every question on its own. A *separate* log captures the **transport/protocol** between VS Code and the agent host process — the JSON-RPC-style frames that drive sessions.

**Use the wire log only when the symptom points at the agent host / transport itself, not the model or a tool.** Reach for it when:
- the agent host won't start, or the session never begins;
- requests **hang or time out**, or the agent appears stuck "connecting" / unresponsive;
- \`createSession\` / \`subscribe\` fails, or expected updates/notifications never arrive;
- you see RPC / protocol / connection errors.

**Do not** open it for ordinary "why did the model/tool do X" questions — \`events.jsonl\` already answers those. If \`events.jsonl\` fully explains the behavior, stop there and don't read the wire log.

**It is written by VS Code on the _client_ machine, so it is only reachable for a _local_ agent host** (VS Code and the agent on the same machine). For a remote agent host it lives on the client, not the host this skill runs on — skip it there.

### Location

\`\`\`
<VS Code user-data dir>/logs/<session-timestamp>/ahp/ahp-<timestamp>-<connectionId>.jsonl
\`\`\`

The VS Code user-data dir depends on the build:
- Windows: \`%APPDATA%\\Code\` (Insiders: \`Code - Insiders\`; OSS/dev may use \`Code - OSS\` or a custom \`--user-data-dir\`)
- macOS: \`~/Library/Application Support/Code\`
- Linux: \`~/.config/Code\`

These logs live on the **VS Code client**, not necessarily on the agent host. For a remote host, ask the user to export or attach the relevant client wire log rather than searching the host for it. A new \`logs/<timestamp>/\` folder is created per VS Code session — pick the **most recently modified** \`ahp/ahp-*.jsonl\`.

**Named by _connection_ id, not session id** — one log **multiplexes all sessions on that connection** (no per-session file). Long connections rotate into \`ahp-….1.jsonl\`, \`.2.jsonl\`, … (max 5); the active one is the **most recently modified** (the locate commands pick it). Read the newest log for connection-level health; to isolate one session, filter by its advertised protocol session or chat URI in frames' \`params\`/\`result\`. Do not assume the protocol identity matches the SDK conversation's log-folder name.

**If no \`ahp/\` folder exists, the wire log is disabled** (it is on by default only in Insiders). Tell the user to set \`"chat.agentHost.ahpJsonlLoggingEnabled": true\`, restart VS Code, reproduce the issue, then re-run.

### Format

Each line is a JSON-RPC frame plus an \`_ahpLog\` envelope:

\`\`\`json
{ "jsonrpc": "2.0", "id": 12, "method": "createSession", "params": {}, "_ahpLog": { "ts": "ISO-8601", "dir": "c2s", "connectionId": "…", "transport": "local" } }
\`\`\`

- \`_ahpLog.dir\` — direction: \`c2s\` = VS Code → host (requests/notifications), \`s2c\` = host → VS Code (results/errors/actions/notifications).
- \`_ahpLog.transport\` — \`local\` / \`websocket\` / \`ssh\` / \`wsl\`.
- Requests/notifications carry \`method\` + \`params\`; responses carry \`result\` or \`error\` — pair a response to its request by \`id\`.
- \`_ahpLog.truncated: true\` marks frames whose large payloads were elided.

Triage: look for \`error\` frames, requests (\`c2s\` with an \`id\`) that have **no matching \`s2c\` response** (hangs/timeouts), or a missing \`s2c\` after \`createSession\` / \`subscribe\`. Apply the same streaming / \`jq\` / \`node\` rules as for \`events.jsonl\`.

### Locating it (terminal)
- macOS/Linux: \`ls -t ~/Library/Application\\ Support/Code*/logs/*/ahp/ahp-*.jsonl ~/.config/Code*/logs/*/ahp/ahp-*.jsonl 2>/dev/null | head -n 1\`
- Windows (PowerShell): \`Get-ChildItem "$env:APPDATA\\Code*\\logs\\*\\ahp\\ahp-*.jsonl" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1\`

## Tooling Strategy (important)

The event log can be outside the workspace. Use the host's read or terminal tools with the supplied absolute path, not workspace-scoped search.

### Do a single triage pass first (important for efficiency)

Each terminal command is a separate round-trip, so **don't run one command per question.** Do **one streaming pass** (constant memory — \`events.jsonl\` can be hundreds of MB, so never load it whole) that prints, in a single read:
- the event counts by type,
- every tool call with success/failure and duration (pair each \`tool.execution_start\` with its \`tool.execution_complete\` by \`toolCallId\`),
- the user messages.

Use a streaming \`jq\` program (macOS/Linux) or a streaming Node \`readline\` pass (Windows) — the per-query examples below are the building blocks. Then run targeted follow-ups only to drill in.

### macOS / Linux / WSL / Git Bash (\`grep\` / \`jq\`)
- Use the exact current or attached log path supplied above. To find other sessions, list \`*/events.jsonl\` under the supplied session-state directory.
- Check size first: \`ls -lh <logPath>\`
- Errors: \`grep '"success":false' <logPath>\` (tool failures) and \`grep '"type":"tool.execution_complete"' <logPath>\`
- Count events by type (streaming): \`jq -nr 'reduce inputs as $i ({}; .[$i.type] += 1) | to_entries | sort_by(-.value)[] | "\\(.value) \\(.key)"' <logPath>\`
- Tool calls: \`jq -c 'select(.type=="tool.execution_start") | {tool:.data.toolName, id:.data.toolCallId}' <logPath>\`
- User messages: \`jq -c 'select(.type=="user.message") | .data.content' <logPath>\`
- Assistant turns: \`jq -c 'select(.type=="assistant.message") | {model:.data.model, out:.data.outputTokens}' <logPath>\`

### Windows (PowerShell + Node.js)
**Do not parse the log with PowerShell JSON.** \`Get-Content … | ForEach-Object { ConvertFrom-Json }\` (or any per-line \`ConvertFrom-Json\`) deserializes one object at a time and is slow even on small logs. Use \`Select-String\` for plain-text matches and a **streaming** \`node\` pass for anything that needs JSON. Use \`jq\` instead if it is available.

- Locate other session logs only when needed:
\x20 \`\`\`powershell
\x20 Get-ChildItem (Join-Path '<session-state directory supplied above>' '*\\events.jsonl')
\x20 \`\`\`
- Check size first: \`(Get-Item <logPath>).Length\`
- Plain-text matches (fast, streaming, no parsing): \`Select-String '"success":false' <logPath>\`
- JSON queries — a **streaming** \`node\` pass (constant memory, safe for hundreds-of-MB logs; pass the log path as an argument so it stays quote-safe). Use this shape and change only the per-line \`if (…)\` to select what you need (tool failures, tool calls, assistant turns, …):
\x20   \`node -e "const rl=require('readline').createInterface({input:require('fs').createReadStream(process.argv[1])});rl.on('line',l=>{if(!l)return;let x;try{x=JSON.parse(l)}catch{return}if(x.type==='tool.execution_complete'&&x.data.success===false)console.log(x.data.toolCallId,JSON.stringify(x.data.result))})" "<logPath>"\`
\x20 For aggregates (e.g. counts by type), accumulate into an object as you go and print it on \`rl.on('close', …)\`.
- For a very large log, narrow with \`Select-String\` first to find the line, then read that small slice with \`read_file\`.

### General rules
- **One streaming pass, not many.** Each command is a round-trip; prefer the single triage pass, then targeted follow-ups. Never load a whole (hundreds-of-MB) log into memory (\`readFileSync\` / \`Get-Content\`) — stream (\`jq\` / the readline pass) or narrow with \`grep\` / \`Select-String\` first. Check size first if unsure (\`ls -lh\` / \`(Get-Item).Length\`).
- **Never deserialize JSON line-by-line in the shell** (PowerShell \`ConvertFrom-Json\` in a loop) — slow. Use one \`jq\` filter or one \`node\` pass.
- Use \`read_file\` only for small targeted ranges, never an entire log.

## Investigation Workflow

1. Use the attached or current conversation log identified above and run the single triage pass.
2. Match the symptom: **errors** → \`success:false\`; **latency** → gaps between \`assistant.turn_start\` and its \`assistant.message\`, or a tool's start↔complete; **tool / model / input** → the relevant event type; **agent-host / transport** failure (local) → also the Wire Log.
3. Read only the relevant slices, then determine the most likely root cause (order contributing factors by impact) and give concrete next steps.

## Response Guidelines

Cover **what happened and why** (root cause), **key evidence** (paraphrased — quote only a telling detail like an error message, never raw dumps), and **how to fix it**. A short combined explanation is fine; add structure (headers, bullets, tables) only for complex, multi-factor issues. Keep paragraphs short.

**Abstraction:** don't narrate your investigation or use internal terms (\`events.jsonl\`, \`tool.execution_start\`, \`parentId\`, "envelope"). Refer to "the session log" abstractly. Focus on what happened and why, not how you found it.

**Example** — instead of "I read events.jsonl and saw a \`tool.execution_complete\` with \`success:false\`…", say:

> The "testing" skill was found but not loaded because the folder name and the name in the skill file differ (\`testing\` vs \`testing2\`). **Fix:** make them match (rename the folder or change the name), then start a new session.

## Important Rules

- Base every claim on log evidence — never assume causality.
- Search via the host's terminal tools; never workspace-scoped search, and never read a whole (possibly huge) log — narrow first, then read small ranges.
- If no Copilot session log exists, say so and stop.
`;
