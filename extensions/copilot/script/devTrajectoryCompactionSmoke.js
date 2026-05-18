/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Smoke-test the `trajectory-compaction-v1` proxy model end-to-end.
 *
 * Usage (run from any authenticated environment that can mint a Copilot proxy
 * token — VS Code dev terminal, etc.):
 *
 *   COPILOT_PROXY_TOKEN="tid=...;exp=..." \
 *     node script/devTrajectoryCompactionSmoke.js
 *
 * The proxy token can be captured by running VS Code with
 * `chat.conversationCompaction.useAgenticProxy=true`, triggering a compaction,
 * and copying the `Authorization: Bearer ...` value from the request logger
 * (`Copilot: Open Chat Debug Log` → search for `trajectory-compaction`).
 *
 * Alternatively, on macOS/Linux you can read it from the VS Code keytar with:
 *   node -e "..."  (project-specific — varies by install).
 */

const https = require('node:https');

const PROXY_URL = 'https://copilot-proxy.githubusercontent.com/chat/completions';
const MODEL = process.env.COPILOT_TRAJECTORY_COMPACTION_MODEL ?? 'trajectory-compaction-v1';

const token = process.env.COPILOT_PROXY_TOKEN;
if (!token) {
	console.error('Set COPILOT_PROXY_TOKEN to a short-lived `tid=...;exp=...` Copilot proxy token.');
	process.exit(2);
}

const body = JSON.stringify({
	model: MODEL,
	messages: [
		{ role: 'system', content: 'You are summarising a developer-assistant conversation. Reply with a single <summary>...</summary> block.' },
		{ role: 'user', content: 'Generate a tiny <summary> tag with the literal text "ok" to confirm routing.' },
	],
	stream: false,
	temperature: 0,
	max_tokens: 32,
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
		try {
			const parsed = JSON.parse(raw);
			const content = parsed.choices?.[0]?.message?.content;
			console.log('model returned model:', parsed.model);
			console.log('finish_reason:', parsed.choices?.[0]?.finish_reason);
			console.log('content:', JSON.stringify(content));
			console.log('usage:', parsed.usage);
			if (res.statusCode === 200 && typeof content === 'string') {
				console.log('\n✅ trajectory-compaction-v1 reachable via proxy.');
			} else {
				console.log('\n❌ Unexpected response.');
				process.exitCode = 1;
			}
		} catch {
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
