/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Long-conversation smoke for the `trajectory-compaction` CAPI model.
 *
 * Loads a real local chat transcript (.jsonl from
 * `<userData>/User/workspaceStorage/<id>/GitHub.copilot-chat/transcripts/`),
 * scales the conversation to a series of target prompt sizes (default
 * 100k / 150k / 200k / 250k tokens), and for each size:
 *
 *   1. Sends a chat-completions request using the REAL VS Code
 *      summarization prompt (the `SummaryPrompt` block from
 *      `summarizedConversationHistory.tsx`) as the system message and the
 *      REAL final user instruction from `ConversationHistorySummarizationPrompt`.
 *   2. Validates the response is wrapped in `<summary>...</summary>`, has
 *      `finish_reason: stop`, and contains all eight required numbered
 *      sections in order (Conversation Overview, Technical Foundation,
 *      Codebase Status, Problem Resolution, Progress Tracking, Active
 *      Work State, Recent Operations, Continuation Plan).
 *
 * Shares OAuth state with `devTrajectoryCompactionCapiSmoke.js` (cached at
 * `~/.copilot-capi-smoke-auth.json`), so if you've already signed in there
 * this script doesn't prompt again.
 *
 * Usage:
 *
 *   # Sizes default to 100k/150k/200k/250k. Picks the largest local
 *   # transcript automatically.
 *   node extensions/copilot/script/devTrajectoryCompactionCapiRealLogSmoke.js
 *
 *   # Custom sizes (in thousands of tokens):
 *   node extensions/copilot/script/devTrajectoryCompactionCapiRealLogSmoke.js --sizes=50,100,150
 *
 *   # Specific transcript:
 *   node extensions/copilot/script/devTrajectoryCompactionCapiRealLogSmoke.js \
 *     --transcript="C:\Users\me\AppData\Roaming\Code - Insiders\User\workspaceStorage\<id>\GitHub.copilot-chat\transcripts\<id>.jsonl"
 *
 *   # Stream the responses (CAPI supports both; default non-streaming):
 *   node extensions/copilot/script/devTrajectoryCompactionCapiRealLogSmoke.js --stream
 *
 *   # Override the model id (default 'trajectory-compaction'):
 *   COPILOT_TRAJECTORY_COMPACTION_MODEL=other \
 *     node extensions/copilot/script/devTrajectoryCompactionCapiRealLogSmoke.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

const MODEL = process.env.COPILOT_TRAJECTORY_COMPACTION_MODEL ?? 'trajectory-compaction';
const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const AUTH_CACHE_PATH = path.join(os.homedir(), '.copilot-capi-smoke-auth.json');

// Approximate chars-per-token used by OpenAI-family tokenizers on
// JSONL-style transcripts (lots of punctuation, JSON, identifiers). The
// initial 4 chars/token estimate overshoots actual prompt sizes by ~25%
// on these conversations — empirically tuning to 3.2 lands within ~5% of
// actual `prompt_tokens` reported by CAPI.
const APPROX_CHARS_PER_TOKEN = 3.2;

const args = parseArgs(process.argv.slice(2));
const useStream = Object.prototype.hasOwnProperty.call(args, 'stream');
const maxTokens = Number(args['max-tokens'] ?? 16_000);
const targetSizesK = String(args.sizes ?? '100,150,200,250')
	.split(',')
	.map(s => Number(s.trim()))
	.filter(n => Number.isFinite(n) && n > 0);

// -----------------------------------------------------------------------
// Real prompts — kept in sync with the corresponding production sources:
//   - SummaryPrompt (system):
//     extensions/copilot/src/extension/prompts/node/agent/summarizedConversationHistory.tsx
//   - ConversationHistorySummarizationPrompt final UserMessage:
//     same file. The `\n` characters here correspond to the JSX `<br />`s.
//
// HTML entities (`&lt;` / `&gt;`) in the JSX appear as literal `<` / `>` in
// the rendered prompt — that's preserved below.
// -----------------------------------------------------------------------

const SYSTEM_PROMPT =
	`Your task is to create a comprehensive, detailed summary of the entire conversation that captures all essential information needed to seamlessly continue the work without any loss of context. This summary will be used to compact the conversation while preserving critical technical details, decisions, and progress.

## Recent Context Analysis

Pay special attention to the most recent agent commands and tool executions that led to this summarization being triggered. Include:
- **Last Agent Commands**: What specific actions/tools were just executed
- **Tool Results**: Key outcomes from recent tool calls (truncate if very long, but preserve essential information)
- **Immediate State**: What was the system doing right before summarization
- **Triggering Context**: What caused the token budget to be exceeded

## Analysis Process

Before providing your final summary, wrap your analysis in \`<analysis>\` tags to organize your thoughts systematically:

1. **Chronological Review**: Go through the conversation chronologically, identifying key phases and transitions
2. **Intent Mapping**: Extract all explicit and implicit user requests, goals, and expectations
3. **Technical Inventory**: Catalog all technical concepts, tools, frameworks, and architectural decisions
4. **Code Archaeology**: Document all files, functions, and code patterns that were discussed or modified
5. **Progress Assessment**: Evaluate what has been completed vs. what remains pending
6. **Context Validation**: Ensure all critical information for continuation is captured
7. **Recent Commands Analysis**: Document the specific agent commands and tool results from the most recent operations

## Summary Structure

Your summary must include these sections in order, following the exact format below:

<analysis>
[Chronological Review: Walk through conversation phases: initial request → exploration → implementation → debugging → current state]
[Intent Mapping: List each explicit user request with message context]
[Technical Inventory: Catalog all technologies, patterns, and decisions mentioned]
[Code Archaeology: Document every file, function, and code change discussed]
[Progress Assessment: What's done vs. pending with specific status]
[Context Validation: Verify all continuation context is captured]
[Recent Commands Analysis: Last agent commands executed, tool results (truncated if long), immediate pre-summarization state]
</analysis>

<summary>
1. Conversation Overview:
- Primary Objectives: [All explicit user requests and overarching goals with exact quotes]
- Session Context: [High-level narrative of conversation flow and key phases]
- User Intent Evolution: [How user's needs or direction changed throughout conversation]

2. Technical Foundation:
- [Core Technology 1]: [Version/details and purpose]
- [Framework/Library 2]: [Configuration and usage context]
- [Architectural Pattern 3]: [Implementation approach and reasoning]
- [Environment Detail 4]: [Setup specifics and constraints]

3. Codebase Status:
- [File Name 1]:
- Purpose: [Why this file is important to the project]
- Current State: [Summary of recent changes or modifications]
- Key Code Segments: [Important functions/classes with brief explanations]
- Dependencies: [How this relates to other components]
- [File Name 2]:
- Purpose: [Role in the project]
- Current State: [Modification status]
- Key Code Segments: [Critical code blocks]
- [Additional files as needed]

4. Problem Resolution:
- Issues Encountered: [Technical problems, bugs, or challenges faced]
- Solutions Implemented: [How problems were resolved and reasoning]
- Debugging Context: [Ongoing troubleshooting efforts or known issues]
- Lessons Learned: [Important insights or patterns discovered]

5. Progress Tracking:
- Completed Tasks: [What has been successfully implemented with status indicators]
- Partially Complete Work: [Tasks in progress with current completion status]
- Validated Outcomes: [Features or code confirmed working through testing]

6. Active Work State:
- Current Focus: [Precisely what was being worked on in most recent messages]
- Recent Context: [Detailed description of last few conversation exchanges]
- Working Code: [Code snippets being modified or discussed recently]
- Immediate Context: [Specific problem or feature being addressed before summary]

7. Recent Operations:
- Last Agent Commands: [Specific tools/actions executed just before summarization with exact command names]
- Tool Results Summary: [Key outcomes from recent tool executions - truncate long results but keep essential info]
- Pre-Summary State: [What the agent was actively doing when token budget was exceeded]
- Operation Context: [Why these specific commands were executed and their relationship to user goals]

8. Continuation Plan:
- [Pending Task 1]: [Details and specific next steps with verbatim quotes]
- [Pending Task 2]: [Requirements and continuation context]
- [Priority Information]: [Which tasks are most urgent or logically sequential]
- [Next Action]: [Immediate next step with direct quotes from recent messages]
</summary>

## Quality Guidelines

- **Precision**: Include exact filenames, function names, variable names, and technical terms
- **Completeness**: Capture all context needed to continue without re-reading the full conversation
- **Clarity**: Write for someone who needs to pick up exactly where the conversation left off
- **Verbatim Accuracy**: Use direct quotes for task specifications and recent work context
- **Technical Depth**: Include enough detail for complex technical decisions and code patterns
- **Logical Flow**: Present information in a way that builds understanding progressively

This summary should serve as a comprehensive handoff document that enables seamless continuation of all active work streams while preserving the full technical and contextual richness of the original conversation.`;

const FINAL_INSTRUCTION =
	`Summarize the conversation history so far, paying special attention to the most recent agent commands and tool results that triggered this summarization. Structure your summary using the enhanced format provided in the system message.
Focus particularly on:
- The specific agent commands/tools that were just executed
- The results returned from these recent tool calls (truncate if very long but preserve key information)
- What the agent was actively working on when the token budget was exceeded
- How these recent operations connect to the overall user goals

Include all important tool calls and their results as part of the appropriate sections, with special emphasis on the most recent operations.`;

// -----------------------------------------------------------------------
// Required sections (verbatim from the prompt's `<summary>` block).
// -----------------------------------------------------------------------

const REQUIRED_SECTIONS = [
	'1. Conversation Overview',
	'2. Technical Foundation',
	'3. Codebase Status',
	'4. Problem Resolution',
	'5. Progress Tracking',
	'6. Active Work State',
	'7. Recent Operations',
	'8. Continuation Plan',
];

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

(async () => {
	if (args.logout) {
		try { fs.unlinkSync(AUTH_CACHE_PATH); console.log(`cleared ${AUTH_CACHE_PATH}`); }
		catch (err) { console.log(`no cache to clear (${err.code ?? err.message})`); }
		process.exit(0);
	}

	const transcriptPath = args.transcript ?? findDefaultTranscript();
	if (!transcriptPath) {
		console.error('No transcript found. Pass --transcript=<path> explicitly.');
		process.exit(2);
	}
	console.log(`transcript: ${transcriptPath}`);
	const transcriptStats = fs.statSync(transcriptPath);
	console.log(`  size:     ${Math.round(transcriptStats.size / 1024).toLocaleString()} KB`);

	const conversation = loadConversation(transcriptPath);
	const totalChars = conversation.reduce((s, m) => s + m.content.length, 0);
	const approxConvoTokens = Math.round(totalChars / APPROX_CHARS_PER_TOKEN);
	console.log(`  messages: ${conversation.length}  (user=${conversation.filter(m => m.role === 'user').length}, assistant=${conversation.filter(m => m.role === 'assistant').length})`);
	console.log(`  content:  ${totalChars.toLocaleString()} chars  (~${approxConvoTokens.toLocaleString()} tokens)`);

	const { token, apiBase } = await acquireCopilotToken();
	const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;
	console.log(`endpoint:   ${url}`);
	console.log(`model:      ${MODEL}`);
	console.log(`max_tokens: ${maxTokens.toLocaleString()}`);
	console.log(`stream:     ${useStream}`);
	console.log(`sizes:      ${targetSizesK.map(k => `${k}k`).join(', ')}`);
	console.log('');

	const allResults = [];
	for (const targetK of targetSizesK) {
		const result = await runOne(url, token, conversation, targetK);
		allResults.push(result);
	}

	console.log('');
	console.log('=================== summary ===================');
	const headers = ['target', 'prompt_tok', 'cmpl_tok', 'finish', 'sections_ok', 'has_summary', 'has_analysis', 'status'];
	console.log(headers.map(h => h.padStart(12)).join(' '));
	for (const r of allResults) {
		console.log([
			`${r.targetK}k`,
			String(r.promptTokens ?? '-'),
			String(r.completionTokens ?? '-'),
			r.finishReason ?? '-',
			`${r.sectionsFound}/${REQUIRED_SECTIONS.length}`,
			r.hasSummary ? 'yes' : 'NO',
			r.hasAnalysis ? 'yes' : 'no',
			String(r.status),
		].map(s => s.padStart(12)).join(' '));
	}

	const failed = allResults.filter(r => !r.passed).length;
	console.log('');
	console.log(`overall: ${allResults.length - failed}/${allResults.length} passed`);
	process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
	console.error('fatal:', err);
	process.exit(2);
});

// -----------------------------------------------------------------------
// Per-target run
// -----------------------------------------------------------------------

async function runOne(url, token, conversation, targetK) {
	const targetTokens = targetK * 1000;
	const promptOverheadTokens = Math.round((SYSTEM_PROMPT.length + FINAL_INSTRUCTION.length) / APPROX_CHARS_PER_TOKEN);
	const convoTokenBudget = Math.max(0, targetTokens - promptOverheadTokens);

	const truncated = truncateToTokenBudget(conversation, convoTokenBudget);
	const truncatedChars = truncated.reduce((s, m) => s + m.content.length, 0);
	const truncatedTokens = Math.round(truncatedChars / APPROX_CHARS_PER_TOKEN);
	const totalApproxTokens = promptOverheadTokens + truncatedTokens;

	console.log(`--- target=${targetK}k tokens ---`);
	console.log(`  prompt overhead:  ~${promptOverheadTokens.toLocaleString()} tokens`);
	console.log(`  conversation:     ~${truncatedTokens.toLocaleString()} tokens  (${truncated.length} messages, ${truncatedChars.toLocaleString()} chars)`);
	console.log(`  total approx:     ~${totalApproxTokens.toLocaleString()} tokens`);

	const messages = [
		{ role: 'system', content: SYSTEM_PROMPT },
		...truncated,
		{ role: 'user', content: FINAL_INSTRUCTION },
	];

	const start = Date.now();
	const response = await sendChatRequest(url, token, messages, useStream);
	const elapsedMs = Date.now() - start;
	console.log(`  http:             status=${response.status} in ${elapsedMs.toLocaleString()} ms`);

	if (response.status !== 200) {
		console.log(`  raw error:`);
		console.log('  ' + response.raw.slice(0, 800).split('\n').join('\n  '));
		console.log('');
		return {
			targetK,
			status: response.status,
			passed: false,
			sectionsFound: 0,
			hasSummary: false,
			hasAnalysis: false,
		};
	}

	const validation = validateResponse(response.content);
	console.log(`  prompt_tokens:    ${response.usage?.prompt_tokens?.toLocaleString() ?? 'n/a'}` +
		(response.usage?.prompt_tokens_details?.cached_tokens != null
			? `  (cached: ${response.usage.prompt_tokens_details.cached_tokens.toLocaleString()})`
			: ''));
	console.log(`  completion_tokens:${response.usage?.completion_tokens?.toLocaleString() ?? 'n/a'}`);
	console.log(`  finish_reason:    ${response.finishReason}`);
	console.log(`  response length:  ${response.content.length.toLocaleString()} chars`);
	console.log(`  <summary> block:  ${validation.hasSummary ? 'yes' : 'NO'}`);
	console.log(`  <analysis> block: ${validation.hasAnalysis ? 'yes' : 'no (optional)'}`);
	console.log(`  sections found:   ${validation.foundSections.length}/${REQUIRED_SECTIONS.length}`);
	for (const sec of REQUIRED_SECTIONS) {
		const ok = validation.foundSections.includes(sec);
		console.log(`    ${ok ? '✓' : '✗'} ${sec}`);
	}
	if (validation.outOfOrder) {
		console.log(`  ⚠ sections present but not in required order`);
	}
	console.log('');

	const passed = validation.hasSummary
		&& validation.foundSections.length === REQUIRED_SECTIONS.length
		&& !validation.outOfOrder
		&& response.finishReason === 'stop';

	return {
		targetK,
		status: response.status,
		passed,
		sectionsFound: validation.foundSections.length,
		hasSummary: validation.hasSummary,
		hasAnalysis: validation.hasAnalysis,
		finishReason: response.finishReason,
		promptTokens: response.usage?.prompt_tokens,
		completionTokens: response.usage?.completion_tokens,
	};
}

// -----------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------

function validateResponse(text) {
	const hasSummary = /<summary>[\s\S]*<\/summary>/.test(text);
	const hasAnalysis = /<analysis>[\s\S]*<\/analysis>/.test(text);

	const foundSections = [];
	const positions = [];
	for (const section of REQUIRED_SECTIONS) {
		const idx = text.indexOf(section);
		if (idx !== -1) {
			foundSections.push(section);
			positions.push(idx);
		}
	}
	// Ensure positions are strictly increasing — sections must appear in order.
	let outOfOrder = false;
	for (let i = 1; i < positions.length; i++) {
		if (positions[i] < positions[i - 1]) {
			outOfOrder = true;
			break;
		}
	}
	return { hasSummary, hasAnalysis, foundSections, outOfOrder };
}

// -----------------------------------------------------------------------
// Transcript loading + scaling
// -----------------------------------------------------------------------

/**
 * Walk a JSONL transcript and produce an OpenAI chat-completions style
 * message list (user/assistant only — tool result content is not persisted
 * in transcripts, so tool calls are serialized as text markers inside the
 * preceding assistant message).
 */
function loadConversation(transcriptPath) {
	const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
	const messages = [];

	for (const line of lines) {
		let evt;
		try { evt = JSON.parse(line); } catch { continue; }

		if (evt.type === 'user.message') {
			const content = (evt.data?.content ?? '').trim();
			if (content) {
				messages.push({ role: 'user', content });
			}
			continue;
		}

		if (evt.type === 'assistant.message') {
			const parts = [];
			const reasoning = (evt.data?.reasoningText ?? '').trim();
			if (reasoning) { parts.push(reasoning); }
			const text = (evt.data?.content ?? '').trim();
			if (text) { parts.push(text); }
			const toolRequests = Array.isArray(evt.data?.toolRequests) ? evt.data.toolRequests : [];
			for (const tr of toolRequests) {
				let argsText = '';
				try { argsText = typeof tr.arguments === 'string' ? tr.arguments : JSON.stringify(tr.arguments); }
				catch { argsText = '<unserialisable>'; }
				// Keep the marker compact but informative — the model treats this
				// as the assistant's record of the tool call it just made.
				parts.push(`[tool_call: ${tr.name}(${truncateForMarker(argsText, 300)})]`);
			}
			if (parts.length === 0) { continue; }
			messages.push({ role: 'assistant', content: parts.join('\n\n') });
			continue;
		}

		// tool.execution_start / tool.execution_complete: results aren't
		// persisted in the transcript, so we synthesise a brief placeholder
		// user message so the assistant's tool call is followed by *something*
		// before the next assistant turn. This keeps the conversation shape
		// realistic even without real tool output.
		if (evt.type === 'tool.execution_complete') {
			const success = evt.data?.success === true;
			messages.push({
				role: 'user',
				content: `[tool_result: ${evt.data?.toolCallId ?? 'unknown'} ${success ? 'succeeded' : 'failed'}]`,
			});
			continue;
		}
	}

	// Collapse runs of same-role messages (chat-completions doesn't accept
	// multiple consecutive user/assistant messages cleanly — well, CAPI is
	// permissive but coalescing is cleaner and matches the rendered prompt
	// the extension would produce).
	const coalesced = [];
	for (const m of messages) {
		const last = coalesced[coalesced.length - 1];
		if (last && last.role === m.role) {
			last.content += '\n\n' + m.content;
		} else {
			coalesced.push({ ...m });
		}
	}
	return coalesced;
}

function truncateForMarker(s, max) {
	if (s.length <= max) { return s; }
	return s.slice(0, max) + '…';
}

/**
 * Drop oldest messages until the conversation fits within
 * `targetTokens * APPROX_CHARS_PER_TOKEN` characters. The most recent
 * messages — the ones that matter most for "Recent Operations" — are
 * always kept. If the result starts with an `assistant` message we
 * drop one more so the conversation begins with a `user` turn.
 */
function truncateToTokenBudget(messages, targetTokens) {
	const targetChars = targetTokens * APPROX_CHARS_PER_TOKEN;
	let total = messages.reduce((s, m) => s + m.content.length, 0);
	if (total <= targetChars) {
		return messages;
	}
	const kept = [...messages];
	while (total > targetChars && kept.length > 1) {
		const dropped = kept.shift();
		total -= dropped.content.length;
	}
	while (kept.length > 0 && kept[0].role !== 'user') {
		const dropped = kept.shift();
		total -= dropped.content.length;
	}
	return kept;
}

/**
 * Pick the largest .jsonl under any local workspaceStorage. If multiple are
 * found, prefer the most recently modified one above the smallest viable
 * size (50 KB), so we don't accidentally pick an empty/scratch session.
 */
function findDefaultTranscript() {
	const candidates = [
		path.join(os.homedir(), 'AppData', 'Roaming', 'Code - Insiders', 'User', 'workspaceStorage'),
		path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'),
		path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User', 'workspaceStorage'),
		path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
		path.join(os.homedir(), '.config', 'Code - Insiders', 'User', 'workspaceStorage'),
		path.join(os.homedir(), '.config', 'Code', 'User', 'workspaceStorage'),
	];
	const found = [];
	for (const root of candidates) {
		if (!fs.existsSync(root)) { continue; }
		walkDir(root, (full, stat) => {
			if (stat.size >= 50 * 1024 && full.includes('GitHub.copilot-chat') && full.endsWith('.jsonl')) {
				found.push({ path: full, size: stat.size, mtime: stat.mtimeMs });
			}
		}, 6);
	}
	if (!found.length) { return undefined; }
	found.sort((a, b) => b.size - a.size);
	return found[0].path;
}

function walkDir(dir, cb, maxDepth) {
	if (maxDepth < 0) { return; }
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
	catch { return; }
	for (const ent of entries) {
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			walkDir(full, cb, maxDepth - 1);
		} else if (ent.isFile()) {
			let st;
			try { st = fs.statSync(full); }
			catch { continue; }
			cb(full, st);
		}
	}
}

// -----------------------------------------------------------------------
// Networking
// -----------------------------------------------------------------------

function sendChatRequest(url, token, messages, stream) {
	const body = JSON.stringify({
		model: MODEL,
		messages,
		stream,
		temperature: 0,
		max_tokens: maxTokens,
	});

	return new Promise((resolve, reject) => {
		const headers = {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json',
			'User-Agent': 'GitHubCopilotChat/0.0.0',
			'Editor-Plugin-Version': 'copilot-chat/0.0.0',
			'Editor-Version': 'vscode/1.97.0',
			'X-GitHub-Api-Version': '2026-01-09',
			'OpenAI-Intent': 'conversation-compaction',
		};
		if (process.env.COPILOT_INTEGRATION_ID) {
			headers['Copilot-Integration-Id'] = process.env.COPILOT_INTEGRATION_ID;
		}
		const req = https.request(url, { method: 'POST', headers }, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				const raw = Buffer.concat(chunks).toString('utf8');
				if (args['dump-raw']) {
					const stamp = Date.now();
					const fname = `capi-raw-${res.statusCode}-${stamp}.txt`;
					fs.writeFileSync(fname, raw);
					console.log(`  (dumped raw response to ${fname})`);
				}
				if (res.statusCode !== 200) {
					return resolve({ status: res.statusCode, raw, content: '' });
				}
				try {
					const parsed = stream ? parseSSE(raw) : parseJsonChat(raw);
					resolve({ status: 200, raw, ...parsed });
				} catch (err) {
					resolve({ status: -1, raw, content: '', __error: err.message });
				}
			});
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function parseJsonChat(raw) {
	const parsed = JSON.parse(raw);
	const choice = parsed.choices?.[0];
	return {
		model: parsed.model,
		finishReason: choice?.finish_reason,
		usage: parsed.usage,
		content: choice?.message?.content ?? '',
	};
}

function parseSSE(raw) {
	let content = '';
	let model;
	let finishReason;
	let usage;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith('data:')) { continue; }
		const payload = line.slice(5).trim();
		if (!payload || payload === '[DONE]') { continue; }
		const evt = JSON.parse(payload);
		model = evt.model ?? model;
		const choice = evt.choices?.[0];
		if (choice?.delta?.content) { content += choice.delta.content; }
		if (choice?.finish_reason) { finishReason = choice.finish_reason; }
		if (evt.usage) { usage = evt.usage; }
	}
	return { content, model, finishReason, usage };
}

// -----------------------------------------------------------------------
// CLI args + OAuth (shared with devTrajectoryCompactionCapiSmoke.js)
// -----------------------------------------------------------------------

function parseArgs(argv) {
	const out = {};
	for (const a of argv) {
		if (!a.startsWith('--')) { continue; }
		const eq = a.indexOf('=');
		if (eq === -1) { out[a.slice(2)] = 'true'; }
		else { out[a.slice(2, eq)] = a.slice(eq + 1); }
	}
	return out;
}

async function acquireCopilotToken() {
	let ghToken = readGhTokenCache();
	if (ghToken) {
		try { return await exchangeGhForCapi(ghToken); }
		catch (err) {
			if (err.status === 401 || err.status === 403) {
				console.log(`cached GitHub token rejected (${err.status}); re-authenticating...`);
				ghToken = undefined;
			} else { throw err; }
		}
	}
	if (!ghToken) {
		ghToken = await runGitHubDeviceFlow();
		writeGhTokenCache(ghToken);
	}
	return await exchangeGhForCapi(ghToken);
}

function readGhTokenCache() {
	try {
		const raw = fs.readFileSync(AUTH_CACHE_PATH, 'utf8');
		return JSON.parse(raw).github_access_token;
	} catch { return undefined; }
}

function writeGhTokenCache(githubAccessToken) {
	fs.writeFileSync(AUTH_CACHE_PATH, JSON.stringify({ github_access_token: githubAccessToken }, null, 2), { mode: 0o600 });
	console.log(`saved GitHub OAuth token to ${AUTH_CACHE_PATH} (mode 600)`);
}

async function runGitHubDeviceFlow() {
	const init = await httpJson({
		hostname: 'github.com',
		path: '/login/device/code',
		method: 'POST',
		headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
	}, `client_id=${encodeURIComponent(COPILOT_CLIENT_ID)}&scope=read%3Auser`);

	console.log('');
	console.log('--- GitHub OAuth device flow ---');
	console.log(`Open: ${init.verification_uri}`);
	console.log(`Enter code: ${init.user_code}`);
	console.log('');

	const deadline = Date.now() + init.expires_in * 1000;
	let intervalSec = init.interval ?? 5;
	while (Date.now() < deadline) {
		await sleep(intervalSec * 1000);
		const resp = await httpJson({
			hostname: 'github.com',
			path: '/login/oauth/access_token',
			method: 'POST',
			headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
		}, `client_id=${encodeURIComponent(COPILOT_CLIENT_ID)}&device_code=${encodeURIComponent(init.device_code)}&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code`);
		if (resp.access_token) { return resp.access_token; }
		if (resp.error === 'authorization_pending') { continue; }
		if (resp.error === 'slow_down') { intervalSec += 5; continue; }
		if (resp.error === 'expired_token' || resp.error === 'access_denied') {
			throw new Error(`device flow ${resp.error}: ${resp.error_description ?? ''}`);
		}
		throw new Error(`unexpected device-flow response: ${JSON.stringify(resp)}`);
	}
	throw new Error('device flow timed out');
}

async function exchangeGhForCapi(ghToken) {
	const resp = await httpJson({
		hostname: 'api.github.com',
		path: '/copilot_internal/v2/token',
		method: 'GET',
		headers: {
			'Authorization': `token ${ghToken}`,
			'Accept': 'application/json',
			'User-Agent': 'trajectory-compaction-capi-smoke',
			'Editor-Version': 'vscode/1.97.0',
			'Editor-Plugin-Version': 'copilot-chat/0.0.0',
		},
	});
	if (!resp.token) {
		const err = new Error(`no Copilot token in response: ${JSON.stringify(resp).slice(0, 400)}`);
		err.status = resp.__status;
		throw err;
	}
	const apiBase = resp.endpoints?.api;
	if (!apiBase) {
		throw new Error(`/copilot_internal/v2/token missing endpoints.api`);
	}
	return { token: resp.token, apiBase };
}

function httpJson(options, body) {
	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				const raw = Buffer.concat(chunks).toString('utf8');
				let parsed;
				try { parsed = JSON.parse(raw); }
				catch { parsed = { __raw: raw.slice(0, 800) }; }
				parsed.__status = res.statusCode;
				if (res.statusCode >= 400 && options.path !== '/login/oauth/access_token') {
					const err = new Error(`HTTP ${res.statusCode} from ${options.hostname}${options.path}: ${JSON.stringify(parsed).slice(0, 400)}`);
					err.status = res.statusCode;
					return reject(err);
				}
				resolve(parsed);
			});
		});
		req.on('error', reject);
		if (body) { req.write(body); }
		req.end();
	});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
