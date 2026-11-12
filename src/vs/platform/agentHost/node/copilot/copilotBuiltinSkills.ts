/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SkillProvider } from '@github/copilot-sdk';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../common/agentHostCustomizationUri.js';
import { MODEL_ROUTER_FOLDER } from '../../common/modelRouter.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { CustomizationLoadStatus, customizationId, type DirectoryCustomization } from '../../common/state/sessionState.js';

const troubleshootName = 'troubleshoot';
const modelRouterName = 'model-router';
const skillsDirectory = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skills' });
const troubleshootUri = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/troubleshoot' });
const modelRouterUri = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/model-router' });

function troubleshootDescriptor() {
	return {
		name: troubleshootName,
		description: localize('copilot.builtinTroubleshoot.description', "Investigate unexpected Copilot session behavior, slow requests, tool failures, and customization loading by analyzing session event logs."),
		userInvocable: true,
	};
}

function modelRouterDescriptor() {
	return {
		name: modelRouterName,
		description: localize('copilot.builtinModelRouter.description', "Create, edit or fix a model router: a .model-router.yaml file that picks a model for each chat turn. Checks every edit with check_model_router."),
		userInvocable: true,
	};
}

/** Publishes the host-owned skills without exporting session-specific paths to clients. */
export function buildCopilotBuiltinSkillsContainer(modelRouterEnabled = false): DirectoryCustomization {
	const uri = skillsDirectory.toString();
	const skills = [{ uri: troubleshootUri, ...troubleshootDescriptor() }, ...(modelRouterEnabled ? [{ uri: modelRouterUri, ...modelRouterDescriptor() }] : [])];
	return {
		type: CustomizationType.Directory,
		id: customizationId(uri),
		uri,
		name: 'builtin',
		enabled: true,
		contents: CustomizationType.Skill,
		writable: false,
		load: { kind: CustomizationLoadStatus.Loaded },
		children: skills.map(({ uri, name, description }) => ({
			type: CustomizationType.Skill,
			id: customizationId(uri.toString()),
			uri: uri.toString(),
			name,
			description,
		})),
	};
}

/**
 * Supplies paths for the exact SDK conversation on create and resume, including peer chats.
 * The `model-router` skill is listed and readable only while `isModelRouterEnabled` is true.
 */
export function createCopilotSkillProvider(sdkConversationId: string, copilotHome: URI, isModelRouterEnabled: () => boolean = () => false): SkillProvider {
	const sessionStateDirectory = joinPath(copilotHome, 'session-state');
	const eventsFile = joinPath(sessionStateDirectory, sdkConversationId, 'events.jsonl');
	return {
		listSkills: () => isModelRouterEnabled() ? [troubleshootDescriptor(), modelRouterDescriptor()] : [troubleshootDescriptor()],
		readSkill: (name, { signal }) => {
			if (name === modelRouterName) {
				return isModelRouterEnabled()
					? modelRouterSkillContent
						.replace('{{COPILOT_MODEL_ROUTERS}}', () => joinPath(copilotHome, MODEL_ROUTER_FOLDER).fsPath)
						.replace('{{COPILOT_SESSION_STATE}}', () => sessionStateDirectory.fsPath)
					: undefined;
			}
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

/** Built from lines because YAML needs leading spaces, which source lines here can't start with. */
const modelRouterExample = [
	'version: 1                 # required',
	'description: Opus for building, Haiku for quick work, Sol for figuring out why.   # required; shown in the model picker',
	'effort: auto               # optional: auto (default), off, or a fixed level',
	'switching: first-turn      # optional: first-turn (default) or auto',
	'routes:                    # 2 to 10 routes; the first is used when the router can\'t tell',
	'  - model: [claude-opus-4.8, claude-opus-4.7]   # fallbacks, in order',
	'    when: Building or changing things over many steps, such as a feature or prototype, multi-file changes, a rebase with conflicts, a PR review, or a doc that needs research.',
	'    examples:              # optional, up to 10',
	'      - prototype this',
	'      - review the PR and tell me what to change',
	'    effort: high           # optional; overrides the router\'s effort',
	'  - model: claude-haiku-4.5',
	'    when: Quick answers and small chores that need little investigation, such as where something is, what a setting does, a one-file edit or a git command.',
	'    examples:',
	'      - where is the code for the login page?',
	'      - undo that test',
	'  - model: gpt-6.1-sol',
	'    when: Figuring out why, such as debugging a failure, analyzing data or telemetry, explaining surprising numbers, or judging whether a proposal works.',
	'    examples:',
	'      - why is this failing?',
	'      - why is token usage higher in treatment?',
].join('\n');

const modelRouterNamedRoutesExample = [
	'version: 1',
	'display-name: Workday',
	'description: Opus for feature work and bug fixes, Haiku for quick questions.',
	'routes:                     # the first one is used when the router can\'t tell',
	'  - name: feature',
	'    model: [claude-opus-5.5, claude-opus-5]',
	'    when: Building something new or changing behavior across files, such as a feature, prototype or refactor.',
	'    effort: high',
	'    guidance: Plan first. Before you finish, have the code-review agent check the change and run the unit-tests skill.',
	'  - name: bugfix',
	'    model: claude-opus-5.5',
	'    when: Something is broken, such as a failing test, a crash or a reported issue.',
	'    effort: medium',
	'    guidance: Reproduce the failure before changing code. Add a test that fails without the fix.',
	'  - name: quick',
	'    model: claude-haiku-5.5',
	'    when: Questions, lookups, explanations, small one-file edits and git chores.',
].join('\n');

const modelRouterSkillContent = `# Model router

A model router is a YAML file that VS Code lists as a model in the model picker. When a chat uses it, each turn asks a decision model which route fits the request and runs the turn on that route's model. Use this skill to create, edit or fix one.

## Where routers live

- \`~/.agents/model-routers/<name>.model-router.yaml\` (preferred), or \`{{COPILOT_MODEL_ROUTERS}}\`. Routers anywhere else are not used or checked.
- The file name is the router's name: lowercase letters, digits and single hyphens, like \`daily-driver.model-router.yaml\`. It shows in the picker as \`daily-driver\`.
- These are the agent host's own folders, so on a remote host they are on the remote machine.

## Format

\`\`\`yaml
${modelRouterExample}
\`\`\`

- \`model\` is a Copilot model id, or \`<vendor>/<id>\` for a model on the user's own key (for example \`anthropic/claude-haiku-4-5\`; add the group, \`<vendor>/<group>/<id>\`, if two match). A list is tried in order and the first available model is used. Each model may appear in only one route, unless the routes have names (see below).
- \`when\` says which requests the route is for. The decision model sees the user's message and a few facts about it, never the code, so describe **the work a request involves**, not just its topic: "Building or changing things over many steps, such as …" routes far better than "Planning and design". Name concrete kinds of requests, and add 2 or 3 \`examples\` in the user's own words, including short ones like "prototype this". Avoid a catch-all first route ("explanations", "questions"): short messages often start long investigations.
- The facts the decision is given besides the message: what is attached (how many images, documents, selections and so on, and how many lines are selected), Plan or Autopilot mode, the custom agent the user chose, the workspace's name and GitHub repository, how many files have uncommitted changes when there are ten or more, whether the branch has an open pull request, and each model's cost and context window. A \`when\` can refer to them, such as "Anything sent in Plan mode", "Requests with an image attached" or "Work on a tree with many changed files".
- Put first the model the user wants when the router can't tell which route fits: usually their strongest everyday model, not the cheapest.
- Keep \`guidance\` for rules that apply to every request; a line like "prefer the cheapest model" pulls almost every request to the first route.
- Put short hand-off replies in the examples of the route that should do the work, such as "fix it (after finding the cause)" or "do that and open a PR" under the building route. On their own they read like quick chores.
- \`effort\` levels: none, minimal, low, medium, high, xhigh, max, ultra. Only levels the model supports work; the check reports the rest. \`auto\` lets the router choose per request; \`off\` leaves each model's default and ignores route \`effort\`.
- \`switching: first-turn\`, the default, picks a model and effort on the first turn and keeps them; \`auto\` may also switch later when the work clearly changes.
- Keys \`subagents\`, \`phases\` and \`mid-turn\` are reserved for later versions and ignored.
- \`display-name\` (optional) is the name the model picker and the chat show in place of the file name.
- \`context-size: long\` (optional, on a route or for the whole router) runs a model on its larger context window when it has one; \`default\` uses its standard one. The check lists each model's \`contextSizes\`, and \`longContextCostsMore\` when the larger one is billed at a higher rate. Without the key each model keeps its own default. A chat that is on a long window stays on one.

## Named routes and guidance

A route can have a \`name\`, and \`guidance\` that says how the user wants that kind of work done:

\`\`\`yaml
${modelRouterNamedRoutesExample}
\`\`\`

- \`name\` (optional) is what the chat shows for the route: lowercase letters, digits and single hyphens, each used once. Routes with a name may use the same model, for example the same model at two effort levels; a route without one may not share its model.
- \`guidance\` on a route (optional, at most 4000 characters) is given to the chat's main agent, not to the decision model. Write it as instructions for that kind of work: the steps to take, and the skills and custom agents to use, by name. The agent already has the user's skills and custom agents, so naming one is enough; a custom agent runs on the model its own file names, else the chat's.
- A chat gets the guidance of the route its first message is routed to, and keeps it. So \`switching: auto\` can't be used when a route has \`guidance\`. A router chosen in a chat that already has messages picks models but brings no guidance; it is also lost when VS Code restarts. Start a new chat to get it.
- One route is enough when it has \`guidance\`.
- The router's own \`guidance\`, at the top of the file, is different: it is for the routing decision.

## YAML rules

Only plain YAML is accepted: maps and lists written one item per line, \`[a, b]\` lists with commas, plain or quoted text, \`|\` and \`>\` blocks, and comments. \`{ ... }\` maps, anchors, unknown escapes like \`"\\q"\` and duplicate keys are errors. A file is at most 32 KiB, and the guidance, \`when\` and examples together at most 64 KiB.

Quote any example or \`when\` text that contains \`: \`, such as a pasted error message (\`- "CUDA error: device-side assert triggered"\`). Unquoted, YAML reads it as a key and a value.

## Workflow

1. Call \`check_model_router\` with no arguments to see the existing routers and the models this account can use, with their ids and effort levels. Only use ids from that list.
2. Offer to look at the user's recent Copilot chats to see what work they do. Only if they agree, read the \`user.message\` events in \`{{COPILOT_SESSION_STATE}}/*/events.jsonl\` from the last few weeks that have no \`agentId\` and whose \`data.source\` is missing, empty or \`user\`; the others are subagent prompts and injected content. Take the user's request from \`data.content\`, leaving out the \`<reminder>\`, \`<attachments>\`, \`<context>\`, \`<current_datetime>\` and similar blocks the host adds. Ignore the agent's replies and tool output. List the kinds of work they do and how often, and how they phrase short requests and hand-offs.
3. Make sure every kind of work the user does often is named in some route's \`when\` or examples. Write the examples in their style, but never copy file paths, names, links or other details from their messages into the router.
4. Write or edit the file with your normal file tools.
5. **After every edit, call \`check_model_router\` with the file's path and fix every error.** Fix warnings too unless the user wants them (for example, a fallback that is intentionally unavailable).
6. Tell the user the router's name and that it appears in the model picker. A changed router is used from the next turn.
`;
