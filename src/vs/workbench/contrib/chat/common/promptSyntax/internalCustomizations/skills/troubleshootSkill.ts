/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InternalSkill } from '../internalSkill.js';
import { ChatContextKeys } from '../../../actions/chatContextKeys.js';
import { localChatSessionType } from '../../../chatSessionsService.js';

const DESCRIPTION = 'Investigate unexpected chat agent behavior. Use when the user asks why something happened, why something was slow, why a skill or instruction was not loaded, or why the agent did not follow instructions.';

const CONTENT = `---
name: troubleshoot
description: '${DESCRIPTION}'
---

# Troubleshoot Skill

## Purpose

This skill investigates and helps explain unexpected behavior in the chat agent.

Use this skill when users ask **why something happened**, **why something was slow**, or **why something did not occur as expected**.

Typical questions:

* "Why did my message take so long to send?"
* "Why was the agent stuck?"
* "Why didn't you use skill foo?"
* "Why didn't my prompt file load?"
* "Why didn't the agent follow my instructions?"

Your role is to **analyze diagnostic events and determine the most likely root cause**.
Do not guess. Always base conclusions on diagnostic events.

---

## Available Tools

You have the following tools for investigating issues:

1. **listDebugEvents** — Call this FIRST to get a summary log of all debug events in the current session. Returns compact one-line summaries with event IDs.
2. **resolveDebugEventDetails** — Call this on specific event IDs from the summary to get full details (file paths, prompt content, tool I/O, etc.).
3. **fetch** — Use this as a LAST RESORT to fetch https://github.com/microsoft/vscode/wiki/Copilot-Issues and suggest troubleshooting steps from the wiki (see Last Resort section below).

---

## Investigation Workflow

Always follow this investigation order:

### Step 1 — List debug events

Call the **listDebugEvents** tool to get the event summary log. Scan the results for:
* Errors (ERROR level events)
* Slow operations (large duration values)
* Failed file loads
* Skip reasons in discovery events

### Step 2 — Resolve relevant events

Call **resolveDebugEventDetails** on all events that could be relevant to the user's question. Call it in parallel on multiple events. When in doubt, resolve more events rather than fewer.

Event types and what resolving them returns:
- **generic** (category: "discovery"): File discovery for instructions, skills, agents, hooks. Returns a fileList with full file paths, load status, skip reasons, and source folders. Always resolve these for questions about customization files.
- **generic** (other): Miscellaneous logs. Returns additional text details.
- **toolCall**: A tool invocation. Returns tool name, input, output, status, and duration.
- **modelTurn**: An LLM round-trip. Returns model name, token usage, timing, errors, and prompt sections.
- **subagentInvocation**: A sub-agent spawn. Returns agent name, status, duration, and counts.
- **userMessage**: The full prompt sent to the model. Returns the complete message and all prompt sections (system prompt, instructions, context). Essential for understanding what the model received.
- **agentResponse**: The model's response. Returns the full response text and sections.

### Step 3 — Determine the root cause

Identify the **single most likely explanation** based on the evidence.
If multiple factors contributed, explain them in order of impact.

### Step 4 — Suggest remediation

If possible, offer actions such as:
* Disabling a slow extension
* Fixing a configuration file
* Retrying after a service outage
* Strengthening instructions
* Fixing a formatting error

---

## Root Cause Decision Trees

### Message Took Long to Send

1. List events and look for slow pre-send / discovery phase events
2. Resolve the slowest events
3. Common causes: extension instruction loading, configuration loading, workspace scanning, extension hooks

### Agent Took Too Long to Respond

1. List events and look for slow model turns, tool calls, or network events
2. Resolve relevant events
3. Common causes: network latency, external service degradation, slow tool execution, repeated tool retries

### Skill Was Not Invoked

1. Resolve discovery events (category: "discovery") to check skill load status
2. Look for skip reasons: missing-name, missing-description, name-mismatch, duplicate-name, parse-error
3. Resolve userMessage events to check if the skill was included in the prompt

### Prompt or Skill File Not Loaded

1. Resolve discovery events to see file load status and skip reasons
2. Common causes: formatting errors, missing files, invalid YAML, unsupported fields
3. Explain the error and offer to fix the file

### Model Did Not Follow Instructions

1. Resolve userMessage events to confirm instructions were included in the prompt
2. If instructions loaded correctly but were not followed, this is likely a model compliance issue
3. Suggest: strengthen instruction wording, move instructions to a higher priority source, simplify the rule

---

## Response Format

Your response should include:

1. A clear explanation of the issue
2. The component responsible
3. Evidence from diagnostics
4. Optional remediation suggestions

IMPORTANT: Do NOT mention event IDs, tool resolution steps, or internal debug mechanics in your response. The user does not know about debug events or event IDs. Present your findings directly and naturally, as if you simply know the answer. Never say things like "I need to resolve events" or show raw event IDs.

---

## Important Rules

* Never assume causes without evidence.
* Always call listDebugEvents first, then resolve relevant events before answering.
* Prefer structured event data over speculation.
* If no clear issue is found, or you have no specific remediation suggestions, follow the Last Resort procedure below before responding.
* Remain concise and actionable.

---

## Customization Documentation Reference

When investigating issues related to a specific type of customization file (instructions, prompt files, agents, etc.) and you need more details about the expected format or behavior, load the relevant documentation page:

- Custom instructions: \`https://code.visualstudio.com/docs/copilot/customization/custom-instructions\`
- Prompt files: \`https://code.visualstudio.com/docs/copilot/customization/prompt-files\`
- Custom agents: \`https://code.visualstudio.com/docs/copilot/customization/custom-agents\`
- Language models: \`https://code.visualstudio.com/docs/copilot/customization/language-models\`
- MCP servers: \`https://code.visualstudio.com/docs/copilot/customization/mcp-servers\`
- Hooks: \`https://code.visualstudio.com/docs/copilot/customization/hooks\`
- Agent plugins: \`https://code.visualstudio.com/docs/copilot/customization/agent-plugins\`

Use these when you need to verify file format expectations, confirm supported fields, or help the user fix a customization file.

---

## Last Resort — Copilot Issues Wiki

When your investigation yields no clear root cause or you have no specific remediation suggestions:

1. Load the Copilot Issues wiki page: \`https://github.com/microsoft/vscode/wiki/Copilot-Issues\`.
2. Search the returned wiki content for sections relevant to the user's problem.
3. Summarize the applicable troubleshooting steps from the wiki in your response.
4. If the wiki contains relevant guidance, present those steps as concrete suggestions the user can try.
5. If even the wiki has no relevant information, tell the user: "The diagnostics logs do not show a clear cause for this behavior, and the known issues wiki does not cover this scenario. Consider filing an issue at https://github.com/microsoft/vscode/issues."
`;

export const troubleshootSkill = new InternalSkill('troubleshoot', DESCRIPTION, CONTENT, {
	when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
});
