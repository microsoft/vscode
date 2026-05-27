/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Smoke-test the `trajectory-compaction-v1` proxy model end-to-end.
 *
 * The request body mirrors the shape VS Code produces when
 * `ConversationHistorySummarizationPrompt` is rendered against a non-Anthropic
 * endpoint (i.e. the cross-endpoint compaction path used when the trajectory
 * compaction proxy is enabled): one long system message containing the
 * summarisation instructions, a small synthetic conversation history (user /
 * assistant / tool messages), and a final user message asking for the
 * `<summary>` block. The Fireworks model behind this proxy returns empty
 * completions for short generic prompts, so realism here is load-bearing.
 *
 * Usage (run from any authenticated environment that can mint a Copilot proxy
 * token — VS Code dev terminal, etc.):
 *
 *   COPILOT_PROXY_TOKEN="tid=...;exp=..." \
 *     node script/devTrajectoryCompactionSmoke.js
 *
 * The proxy token can be captured by running VS Code with
 * `chat.conversationCompaction.usePrismCompaction=true`, triggering a compaction,
 * and copying the `Authorization: Bearer ...` value from the request logger
 * (`Copilot: Open Chat Debug Log` → search for `trajectory-compaction`).
 */

const https = require('node:https');

const PROXY_URL = 'https://copilot-proxy.githubusercontent.com/chat/completions';
const MODEL = process.env.COPILOT_TRAJECTORY_COMPACTION_MODEL ?? 'trajectory-compaction-v1';

const token = process.env.COPILOT_PROXY_TOKEN;
if (!token) {
	console.error('Set COPILOT_PROXY_TOKEN to a short-lived `tid=...;exp=...` Copilot proxy token.');
	process.exit(2);
}

// System prompt — abridged version of `SummaryPrompt` in
// extensions/copilot/src/extension/prompts/node/agent/summarizedConversationHistory.tsx.
// Kept short on purpose so the smoke runs cheaply, but with the section
// structure and the `<summary>` directive intact since the model conditions
// heavily on those.
const SYSTEM_PROMPT = [
	'Your task is to create a comprehensive, detailed summary of the entire conversation that captures all essential information needed to seamlessly continue the work without any loss of context.',
	'',
	'Pay special attention to the most recent agent commands and tool results.',
	'',
	'Output your summary wrapped in <summary> and </summary> tags. Structure it with these sections:',
	'1. Conversation Overview',
	'2. Technical Foundation',
	'3. Files and Code Sections',
	'4. Problem Solving',
	'5. Pending Tasks and Next Steps',
].join('\n');

// Short synthetic conversation that exercises tool calls — matches the
// minimum-realistic shape we confirmed the proxy responds to with real
// content (vs. empty completions for trivial / one-shot prompts).
const CONVERSATION = [
	{ role: 'user', content: 'Read README.md and tell me what this project is.' },
	{
		role: 'assistant',
		content: 'I\'ll read the README file to understand the project.',
	},
	{
		role: 'user',
		content: '[tool_result for read_file(README.md)]\n# vscode\n\nVisual Studio Code, also commonly referred to as VS Code, is a source-code editor developed by Microsoft for Windows, Linux, macOS and the web.',
	},
	{
		role: 'assistant',
		content: 'This project is **VS Code** — Microsoft\'s source-code editor for Windows, Linux, macOS, and the web. Would you like me to look at the package.json next?',
	},
	{ role: 'user', content: 'Yes, check the package.json' },
	{
		role: 'assistant',
		content: 'I\'ll read package.json.',
	},
	{
		role: 'user',
		content: '[tool_result for read_file(package.json)]\n{"name":"vscode","version":"1.121.0","main":"./out/main.js","scripts":{"compile":"...","watch":"..."}}',
	},
	{
		role: 'assistant',
		content: 'The package.json confirms this is version 1.121.0, with compile and watch scripts. The main entry is `./out/main.js`.',
	},
];

const FINAL_INSTRUCTION =
	'Summarize the conversation history so far, paying special attention to the most recent agent commands and tool results that triggered this summarization. Structure your summary using the format provided in the system message. Focus particularly on:\n' +
	'- The specific agent commands/tools that were just executed\n' +
	'- The results returned from these recent tool calls\n' +
	'- What the agent was working on when the token budget was exceeded\n\n' +
	'Wrap the entire response in <summary>...</summary>.';

const body = JSON.stringify({
	model: MODEL,
	messages: [
		{ role: 'system', content: SYSTEM_PROMPT },
		...CONVERSATION,
		{ role: 'user', content: FINAL_INSTRUCTION },
	],
	// The agentic proxy rejects `stream: false` with HTTP 400 — it only
	// supports SSE streaming. We accumulate the deltas below.
	stream: true,
	temperature: 0,
	// Give the model enough budget to actually emit a structured summary.
	// Short ceilings caused empty completions in early probes.
	max_tokens: 1024,
});

const req = https.request(PROXY_URL, {
	method: 'POST',
	headers: {
		'Authorization': `Bearer ${token}`,
		'Content-Type': 'application/json',
		'Copilot-Integration-Id': 'vscode-chat',
		'Editor-Plugin-Version': 'copilot-chat/0.0.0',
		'Editor-Version': 'vscode/1.97.0',
		'X-GitHub-Api-Version': '2026-01-09',
		'OpenAI-Intent': 'conversation-compaction',
	},
}, (res) => {
	const chunks = [];
	res.on('data', (c) => chunks.push(c));
	res.on('end', () => {
		const raw = Buffer.concat(chunks).toString('utf8');
		console.log(`status: ${res.statusCode}`);
		// Non-2xx responses come back as a single JSON error payload, not SSE.
		if (res.statusCode !== 200) {
			console.log('raw:', raw.slice(0, 2000));
			process.exitCode = 1;
			return;
		}
		try {
			const parsed = parseSSE(raw);
			console.log('model:', parsed.model);
			console.log('finish_reason:', parsed.finish_reason);
			console.log('usage:', parsed.usage);
			console.log('content_len:', parsed.content.length);
			const preview = parsed.content.length > 600
				? parsed.content.slice(0, 600) + '…'
				: parsed.content;
			console.log('content preview:\n' + preview);

			const summary = extractSummary(parsed.content);
			if (!summary) {
				console.log('\n❌ Response did not contain a <summary>...</summary> block. The model may be misrouted or stalled.');
				process.exitCode = 1;
				return;
			}
			console.log(`\n✅ trajectory-compaction-v1 reachable via proxy (summary: ${summary.length} chars).`);
		} catch (err) {
			console.log('SSE parse error:', err.message);
			console.log('raw:', raw.slice(0, 2000));
			process.exitCode = 1;
		}
	});
});

req.on('error', (err) => {
	console.error('request error:', err);
	process.exitCode = 1;
});

req.write(body);
req.end();

/**
 * Parse an SSE chat-completions response into a flat summary. Accumulates
 * `delta.content` chunks across `data: {...}` events, ignoring the terminal
 * `data: [DONE]` and any keep-alive lines.
 */
function parseSSE(raw) {
	let content = '';
	let model;
	let finish_reason;
	let usage;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith('data:')) {
			continue;
		}
		const payload = line.slice(5).trim();
		if (!payload || payload === '[DONE]') {
			continue;
		}
		const evt = JSON.parse(payload);
		model = evt.model ?? model;
		const choice = evt.choices?.[0];
		if (choice?.delta?.content) {
			content += choice.delta.content;
		}
		if (choice?.finish_reason) {
			finish_reason = choice.finish_reason;
		}
		if (evt.usage) {
			usage = evt.usage;
		}
	}
	return { content, model, finish_reason, usage };
}

/**
 * Mirror of `extractSummary` in summarizedConversationHistory.tsx — kept in
 * sync so the smoke validates the same parse the extension applies. A
 * passing smoke means the extension's compaction-applier will also succeed
 * on this response shape.
 */
function extractSummary(responseText) {
	const openTag = '<summary>';
	const closeTag = '</summary>';
	const openIdx = responseText.indexOf(openTag);
	if (openIdx === -1) {
		return undefined;
	}
	const contentStart = openIdx + openTag.length;
	const closeIdx = responseText.indexOf(closeTag, contentStart);
	if (closeIdx !== -1) {
		return responseText.substring(contentStart, closeIdx).trim();
	}
	// Open tag without closing tag — take everything after.
	return responseText.substring(contentStart).trim();
}
