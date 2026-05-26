/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Smoke-test the `trajectory-compaction` CAPI model end-to-end via OAuth
 * device-flow sign-in. This is the CAPI counterpart of
 * `devTrajectoryCompactionSmoke.js` (which hits the legacy
 * `trajectory-compaction-v1` proxy model). The conversation body, system
 * prompt, and `<summary>` extraction are intentionally identical so the two
 * scripts validate the same behaviour against the two different routes.
 *
 * Flow:
 *   1. Run the GitHub device-flow OAuth dance with the public Copilot client
 *      id (the same id used by copilot.vim / official editor integrations).
 *      The resulting GitHub access token is cached at
 *      `~/.copilot-capi-smoke-auth.json` (mode 600).
 *   2. Exchange the GitHub token for a short-lived Copilot token via
 *      `https://api.github.com/copilot_internal/v2/token`. The response also
 *      tells us the per-account CAPI base URL (`endpoints.api`, typically
 *      `https://api.individual.githubcopilot.com`).
 *   3. POST the realistic trajectory-compaction conversation to
 *      `<endpoints.api>/chat/completions` with `model: 'trajectory-compaction'`
 *      and a `Bearer <copilot_token>` header.
 *   4. Assert the response contains a `<summary>...</summary>` block (using
 *      the same parse the extension uses).
 *
 * Usage:
 *
 *   # First run — opens the device-flow URL, you paste the user code,
 *   # then the GitHub token is cached for next time.
 *   node extensions/copilot/script/devTrajectoryCompactionCapiSmoke.js
 *
 *   # Subsequent runs reuse the cached GitHub token and just mint a fresh
 *   # Copilot token. Tokens expire ~25 min — the script handles refresh.
 *
 *   # Clear the cache (e.g. switching accounts):
 *   node extensions/copilot/script/devTrajectoryCompactionCapiSmoke.js --logout
 *
 *   # Override the model (defaults to `trajectory-compaction`):
 *   COPILOT_TRAJECTORY_COMPACTION_MODEL=other-family \
 *     node extensions/copilot/script/devTrajectoryCompactionCapiSmoke.js
 *
 *   # Stream the response (CAPI supports both; defaults to non-streaming):
 *   node extensions/copilot/script/devTrajectoryCompactionCapiSmoke.js --stream
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

const MODEL = process.env.COPILOT_TRAJECTORY_COMPACTION_MODEL ?? 'trajectory-compaction';

// Public GitHub Copilot OAuth client id (same one used by copilot.vim and the
// official editor integrations — it ships in plain text and is fine to embed).
const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const AUTH_CACHE_PATH = path.join(os.homedir(), '.copilot-capi-smoke-auth.json');

const args = parseArgs(process.argv.slice(2));
const useStream = Object.prototype.hasOwnProperty.call(args, 'stream');

// System prompt — abridged version of `SummaryPrompt` in
// extensions/copilot/src/extension/prompts/node/agent/summarizedConversationHistory.tsx.
// Kept identical to devTrajectoryCompactionSmoke.js so the two smokes
// validate the same behaviour against the two different routes.
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

// Short synthetic conversation that exercises tool calls — must match
// devTrajectoryCompactionSmoke.js exactly.
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

(async () => {
	if (args.logout) {
		try { fs.unlinkSync(AUTH_CACHE_PATH); console.log(`cleared ${AUTH_CACHE_PATH}`); }
		catch (err) { console.log(`no cache to clear (${err.code ?? err.message})`); }
		process.exit(0);
	}

	const { token, apiBase } = await acquireCopilotToken();
	const url = `${apiBase.replace(/\/$/, '')}/chat/completions`;

	console.log('');
	console.log('--- trajectory-compaction CAPI smoke ---');
	console.log(`endpoint: ${url}`);
	console.log(`model:    ${MODEL}`);
	console.log(`stream:   ${useStream}`);
	console.log('');

	const result = await sendChatRequest(url, token, useStream);
	console.log(`status: ${result.status}`);
	if (result.status !== 200) {
		console.log('raw:', result.raw.slice(0, 2000));
		process.exitCode = 1;
		return;
	}

	console.log('model:', result.model);
	console.log('finish_reason:', result.finish_reason);
	console.log('usage:', result.usage);
	console.log('content_len:', result.content.length);
	const preview = result.content.length > 600
		? result.content.slice(0, 600) + '…'
		: result.content;
	console.log('content preview:\n' + preview);

	const summary = extractSummary(result.content);
	if (!summary) {
		console.log('\n❌ Response did not contain a <summary>...</summary> block. The CAPI model may be misrouted or unavailable for this account.');
		process.exitCode = 1;
		return;
	}
	console.log(`\n✅ ${MODEL} reachable via CAPI (summary: ${summary.length} chars).`);
})().catch(err => {
	console.error('fatal:', err);
	process.exit(2);
});

function sendChatRequest(url, token, stream) {
	const body = JSON.stringify({
		model: MODEL,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			...CONVERSATION,
			{ role: 'user', content: FINAL_INSTRUCTION },
		],
		stream,
		temperature: 0,
		max_tokens: 1024,
	});

	return new Promise((resolve, reject) => {
		const req = https.request(url, {
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

/**
 * Parse a non-streaming chat-completions JSON response.
 */
function parseJsonChat(raw) {
	const parsed = JSON.parse(raw);
	const choice = parsed.choices?.[0];
	return {
		model: parsed.model,
		finish_reason: choice?.finish_reason,
		usage: parsed.usage,
		content: choice?.message?.content ?? '',
	};
}

/**
 * Parse an SSE chat-completions response into a flat summary. Accumulates
 * `delta.content` chunks across `data: {...}` events. Mirrors the proxy
 * smoke's parser.
 */
function parseSSE(raw) {
	let content = '';
	let model;
	let finish_reason;
	let usage;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith('data:')) { continue; }
		const payload = line.slice(5).trim();
		if (!payload || payload === '[DONE]') { continue; }
		const evt = JSON.parse(payload);
		model = evt.model ?? model;
		const choice = evt.choices?.[0];
		if (choice?.delta?.content) { content += choice.delta.content; }
		if (choice?.finish_reason) { finish_reason = choice.finish_reason; }
		if (evt.usage) { usage = evt.usage; }
	}
	return { content, model, finish_reason, usage };
}

/**
 * Mirror of `extractSummary` in summarizedConversationHistory.tsx — kept in
 * sync so the smoke validates the same parse the extension applies.
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
	return responseText.substring(contentStart).trim();
}

function parseArgs(argv) {
	const out = {};
	for (const a of argv) {
		if (!a.startsWith('--')) { continue; }
		const eq = a.indexOf('=');
		if (eq === -1) {
			out[a.slice(2)] = 'true';
		} else {
			out[a.slice(2, eq)] = a.slice(eq + 1);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// OAuth: GitHub device flow → GitHub access token → Copilot CAPI token + URL.
// ---------------------------------------------------------------------------

async function acquireCopilotToken() {
	let ghToken = readGhTokenCache();
	if (ghToken) {
		try {
			return await exchangeGhForCapi(ghToken);
		} catch (err) {
			if (err.status === 401 || err.status === 403) {
				console.log(`cached GitHub token rejected (${err.status}); re-authenticating...`);
				ghToken = undefined;
			} else {
				throw err;
			}
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
		const parsed = JSON.parse(raw);
		return parsed.github_access_token;
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
	console.log(`(waiting up to ${init.expires_in}s for authorization, polling every ${init.interval}s)`);
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

		if (resp.access_token) {
			console.log('GitHub OAuth: authorized.');
			return resp.access_token;
		}
		if (resp.error === 'authorization_pending') { continue; }
		if (resp.error === 'slow_down') { intervalSec += 5; continue; }
		if (resp.error === 'expired_token' || resp.error === 'access_denied') {
			throw new Error(`device flow ${resp.error}: ${resp.error_description ?? ''}`);
		}
		throw new Error(`unexpected device-flow response: ${JSON.stringify(resp)}`);
	}
	throw new Error('device flow timed out');
}

/**
 * Exchange a GitHub OAuth access token for a short-lived Copilot token and
 * read the per-account CAPI base URL from the response. The `endpoints.api`
 * field is what `domainServiceImpl.ts` wires into the extension's
 * `ChatEndpoint` instances, so using it here means the smoke targets the
 * same host the extension would hit at runtime.
 */
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
		throw new Error(`/copilot_internal/v2/token response missing endpoints.api: ${JSON.stringify(resp).slice(0, 400)}`);
	}
	const expIn = resp.expires_at ? Math.round(resp.expires_at - Date.now() / 1000) : undefined;
	console.log(`minted Copilot token (expires in ${expIn ?? '?'}s); CAPI base: ${apiBase}`);
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
