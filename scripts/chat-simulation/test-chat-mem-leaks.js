/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Chat memory leak checker — state-based approach.
 *
 * The idea: if you return to the same state you started from, memory should
 * return to roughly the same level. Any residual growth is a potential leak.
 *
 * Each iteration:
 *   1. Open a fresh chat (baseline state)
 *   2. Measure heap + DOM nodes
 *   3. Cycle through ALL registered perf scenarios (text, code blocks,
 *      tool calls, thinking, multi-turn, etc.)
 *   4. Open a new chat (return to baseline state — clears previous session)
 *   5. Measure heap + DOM nodes again
 *   6. The delta is the "leaked" memory for that iteration
 *
 * Multiple iterations let us detect consistent leaks vs. one-time caching.
 *
 * Usage:
 *   npm run perf:chat-leak                                # defaults from config
 *   npm run perf:chat-leak -- --iterations 5               # more iterations
 *   npm run perf:chat-leak -- --threshold 5                # 5MB total threshold
 *   npm run perf:chat-leak -- --build 1.115.0              # test a specific build
 */

const fs = require('fs');
const path = require('path');
const {
	DATA_DIR, loadConfig,
	resolveBuild, buildEnv, buildArgs, prepareRunDir,
	launchVSCode,
} = require('./common/utils');
const {
	CONTENT_SCENARIOS, TOOL_CALL_SCENARIOS, MULTI_TURN_SCENARIOS,
} = require('./common/perf-scenarios');
const {
	getUserTurns, getModelTurnCount,
} = require('./common/mock-llm-server');

// -- Config (edit config.jsonc to change defaults) ---------------------------

const CONFIG = loadConfig('memLeaks');

// -- CLI args ----------------------------------------------------------------

function parseArgs() {
	const args = process.argv.slice(2);
	const opts = {
		iterations: CONFIG.iterations ?? 3,
		messages: CONFIG.messages ?? 5,
		verbose: false,
		ci: false,
		/** @type {string | undefined} */
		build: undefined,
		leakThresholdMB: CONFIG.leakThresholdMB ?? 5,
		/** @type {Record<string, any>} */
		settingsOverrides: {},
	};
	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--iterations': opts.iterations = parseInt(args[++i], 10); break;
			case '--messages': case '-n': opts.messages = parseInt(args[++i], 10); break;
			case '--verbose': opts.verbose = true; break;
			case '--ci': opts.ci = true; break;
			case '--build': case '-b': opts.build = args[++i]; break;
			case '--threshold': opts.leakThresholdMB = parseFloat(args[++i]); break;
			case '--setting': {
				const kv = args[++i];
				const eq = kv.indexOf('=');
				if (eq === -1) { console.error(`--setting requires key=value, got: ${kv}`); process.exit(1); }
				const key = kv.slice(0, eq);
				const raw = kv.slice(eq + 1);
				const val = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
				opts.settingsOverrides[key] = val;
				break;
			}
			case '--help': case '-h':
				console.log([
					'Chat memory leak checker (state-based)',
					'',
					'Options:',
					'  --iterations <n>    Number of open→work→reset cycles (default: 3)',
					'  --messages <n>      Messages to send per iteration (default: 5)',
					'  --ci                CI mode: write Markdown summary to ci-summary.md',
					'  --build <path|ver>  Path to VS Code build or version to download',
					'  --threshold <MB>    Max total residual heap growth in MB (default: 5)',
					'  --setting <k=v>     Set a VS Code setting override (repeatable)',
					'  --verbose           Print per-step details',
				].join('\n'));
				process.exit(0);
		}
	}
	return opts;
}

// -- Scenario list -----------------------------------------------------------

/**
 * Build a flat list of scenario IDs to cycle through during leak testing.
 * Includes all scenario types: content-only, tool-call, and multi-turn.
 *
 * Content scenarios exercise varied rendering (code blocks, markdown, etc.).
 * Tool-call scenarios exercise the agent loop (model → tool → model → ...).
 * Multi-turn scenarios exercise user follow-ups and thinking blocks.
 */
function getScenarioIds() {
	return [
		...Object.keys(CONTENT_SCENARIOS),
		...Object.keys(TOOL_CALL_SCENARIOS),
		...Object.keys(MULTI_TURN_SCENARIOS),
	];
}

// -- Helpers -----------------------------------------------------------------

const CHAT_VIEW = 'div[id="workbench.panel.chat"]';
const CHAT_EDITOR_SEL = `${CHAT_VIEW} .interactive-input-part .monaco-editor[role="code"]`;

/**
 * Measure heap (MB) and DOM node count after forced GC.
 * @param {any} cdp
 * @param {import('playwright').Page} page
 */
async function measure(cdp, page) {
	await cdp.send('HeapProfiler.collectGarbage');
	await new Promise(r => setTimeout(r, 500));
	await cdp.send('HeapProfiler.collectGarbage');
	await new Promise(r => setTimeout(r, 300));
	const heapInfo = /** @type {any} */ (await cdp.send('Runtime.getHeapUsage'));
	const heapMB = Math.round(heapInfo.usedSize / 1024 / 1024 * 100) / 100;
	const domNodes = await page.evaluate(() => document.querySelectorAll('*').length);
	return { heapMB, domNodes };
}

/**
 * Open a new chat session via the command palette.
 * @param {import('playwright').Page} page
 */
async function openNewChat(page) {
	// Use keyboard shortcut to open a new chat (clears previous session)
	const newChatShortcut = process.platform === 'darwin' ? 'Meta+KeyL' : 'Control+KeyL';
	await page.keyboard.press(newChatShortcut);
	await new Promise(r => setTimeout(r, 1000));

	// Verify the chat view is visible and ready
	await page.waitForSelector(CHAT_VIEW, { timeout: 15_000 });
	await page.waitForFunction(
		(sel) => Array.from(document.querySelectorAll(sel)).some(el => el.getBoundingClientRect().width > 0),
		CHAT_EDITOR_SEL, { timeout: 15_000 },
	);
	await new Promise(r => setTimeout(r, 500));
}

/**
 * Send a single message and wait for the response to complete.
 * For multi-turn scenarios where the model makes multiple tool-call rounds
 * before producing content, `modelTurns` controls how many completions to
 * wait for.
 * @param {import('playwright').Page} page
 * @param {{ completionCount: () => number, waitForCompletion: (n: number, ms: number) => Promise<void> }} mockServer
 * @param {string} text
 * @param {number} [modelTurns=1] - number of model completions to wait for
 */
async function sendMessage(page, mockServer, text, modelTurns = 1) {
	await page.click(CHAT_EDITOR_SEL);
	await new Promise(r => setTimeout(r, 200));

	const inputSel = await page.evaluate((editorSel) => {
		const ed = document.querySelector(editorSel);
		if (!ed) { throw new Error('no editor'); }
		return ed.querySelector('.native-edit-context') ? editorSel + ' .native-edit-context' : editorSel + ' textarea';
	}, CHAT_EDITOR_SEL);

	const hasDriver = await page.evaluate(() =>
		// @ts-ignore
		!!globalThis.driver?.typeInEditor
	).catch(() => false);

	if (hasDriver) {
		await page.evaluate(({ selector, t }) => {
			// @ts-ignore
			return globalThis.driver.typeInEditor(selector, t);
		}, { selector: inputSel, t: text });
	} else {
		await page.click(inputSel);
		await new Promise(r => setTimeout(r, 200));
		await page.locator(inputSel).pressSequentially(text, { delay: 0 });
	}

	const compBefore = mockServer.completionCount();
	await page.keyboard.press('Enter');
	try { await mockServer.waitForCompletion(compBefore + modelTurns, 60_000); } catch { }

	const responseSelector = `${CHAT_VIEW} .interactive-item-container.interactive-response`;
	await page.waitForFunction(
		(sel) => {
			const responses = document.querySelectorAll(sel);
			if (responses.length === 0) { return false; }
			return !responses[responses.length - 1].classList.contains('chat-response-loading');
		},
		responseSelector, { timeout: 30_000 },
	);
	await new Promise(r => setTimeout(r, 500));
}

/**
 * Run a full scenario: send the initial message, then handle any user
 * follow-up turns for multi-turn scenarios.
 *
 * - Content-only scenarios: single message, 1 model turn.
 * - Tool-call scenarios (no user turns): single message, N model turns
 *   (the extension automatically relays tool results back to the model).
 * - Multi-turn with user turns: send initial message, wait for response,
 *   then for each user turn send the follow-up message and wait again.
 *
 * @param {import('playwright').Page} page
 * @param {{ completionCount: () => number, waitForCompletion: (n: number, ms: number) => Promise<void> }} mockServer
 * @param {string} scenarioId
 * @param {string} label - prefix for the message (e.g. "Warmup" or "Iteration 2")
 */
async function runScenario(page, mockServer, scenarioId, label) {
	const userTurns = getUserTurns(scenarioId);
	const totalModelTurns = getModelTurnCount(scenarioId);

	if (userTurns.length === 0) {
		// Content-only or tool-call scenario: one message, wait for all model turns
		await sendMessage(page, mockServer, `[scenario:${scenarioId}] ${label}`, totalModelTurns);
	} else {
		// Multi-turn with user follow-ups: send initial message and wait for
		// the model turns before the first user turn, then alternate.
		let modelTurnsSoFar = 0;
		const firstUserAfter = userTurns[0].afterModelTurn;
		const turnsBeforeFirstUser = firstUserAfter - modelTurnsSoFar;
		await sendMessage(page, mockServer, `[scenario:${scenarioId}] ${label}`, turnsBeforeFirstUser);
		modelTurnsSoFar = firstUserAfter;

		for (let u = 0; u < userTurns.length; u++) {
			const nextModelStop = u + 1 < userTurns.length
				? userTurns[u + 1].afterModelTurn
				: totalModelTurns;
			const turnsUntilNext = nextModelStop - modelTurnsSoFar;

			// Send the user follow-up message
			await sendMessage(page, mockServer, userTurns[u].message, turnsUntilNext);
			modelTurnsSoFar = nextModelStop;
		}
	}
}

// -- Leak check --------------------------------------------------------------

/**
 * @param {string} electronPath
 * @param {{ url: string, requestCount: () => number, waitForRequests: (n: number, ms: number) => Promise<void>, completionCount: () => number, waitForCompletion: (n: number, ms: number) => Promise<void> }} mockServer
 * @param {{ iterations: number, verbose: boolean, settingsOverrides?: Record<string, any> }}  opts
 */
async function runLeakCheck(electronPath, mockServer, opts) {
	const { iterations, verbose } = opts;
	const { userDataDir, extDir, logsDir } = prepareRunDir('leak-check', mockServer, opts.settingsOverrides);
	const isDevBuild = !electronPath.includes('.vscode-test');

	const vscode = await launchVSCode(
		electronPath,
		buildArgs(userDataDir, extDir, logsDir, { isDevBuild }),
		buildEnv(mockServer, { isDevBuild }),
		{ verbose },
	);
	const page = vscode.page;

	try {
		await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });

		const cdp = await page.context().newCDPSession(page);
		await cdp.send('HeapProfiler.enable');

		// Open chat panel
		const chatShortcut = process.platform === 'darwin' ? 'Control+Meta+KeyI' : 'Control+Alt+KeyI';
		await page.keyboard.press(chatShortcut);
		await page.waitForSelector(CHAT_VIEW, { timeout: 15_000 });
		await page.waitForFunction(
			(sel) => Array.from(document.querySelectorAll(sel)).some(el => el.getBoundingClientRect().width > 0),
			CHAT_EDITOR_SEL, { timeout: 15_000 },
		);

		// Wait for extension activation
		const reqsBefore = mockServer.requestCount();
		try { await mockServer.waitForRequests(reqsBefore + 4, 30_000); } catch { }
		await new Promise(r => setTimeout(r, 3000));

		const scenarioIds = getScenarioIds();

		// --- Baseline measurement (fresh chat) ---
		const baseline = await measure(cdp, page);
		if (verbose) {
			console.log(`  [leak] Baseline: heap=${baseline.heapMB}MB, domNodes=${baseline.domNodes}`);
		}

		/** @type {{ beforeHeapMB: number, afterHeapMB: number, deltaHeapMB: number, beforeDomNodes: number, afterDomNodes: number, deltaDomNodes: number }[]} */
		const iterationResults = [];

		for (let iter = 0; iter < iterations; iter++) {
			// Measure at start of iteration (should be in "clean" state)
			const before = await measure(cdp, page);

			if (verbose) {
				console.log(`  [leak] Iteration ${iter + 1}/${iterations}: start heap=${before.heapMB}MB, domNodes=${before.domNodes}`);
			}

			// Do work: cycle through all scenarios
			for (let m = 0; m < scenarioIds.length; m++) {
				const sid = scenarioIds[m];
				await runScenario(page, mockServer, sid, `Iteration ${iter + 1}`);
				if (verbose) {
					console.log(`    [leak]   Sent ${sid} (${m + 1}/${scenarioIds.length})`);
				}
			}

			// Return to clean state: open a new empty chat
			await openNewChat(page);
			await new Promise(r => setTimeout(r, 1000));

			// Measure after returning to clean state
			const after = await measure(cdp, page);
			const deltaHeapMB = Math.round((after.heapMB - before.heapMB) * 100) / 100;
			const deltaDomNodes = after.domNodes - before.domNodes;

			iterationResults.push({
				beforeHeapMB: before.heapMB,
				afterHeapMB: after.heapMB,
				deltaHeapMB,
				beforeDomNodes: before.domNodes,
				afterDomNodes: after.domNodes,
				deltaDomNodes,
			});

			if (verbose) {
				console.log(`  [leak] Iteration ${iter + 1}/${iterations}: end heap=${after.heapMB}MB (delta=${deltaHeapMB}MB), domNodes=${after.domNodes} (delta=${deltaDomNodes})`);
			}
		}

		// Final measurement
		const final = await measure(cdp, page);
		const totalResidualMB = Math.round((final.heapMB - baseline.heapMB) * 100) / 100;
		const totalResidualNodes = final.domNodes - baseline.domNodes;

		return {
			baseline,
			final: { heapMB: final.heapMB, domNodes: final.domNodes },
			totalResidualMB,
			totalResidualNodes,
			iterations: iterationResults,
		};
	} finally {
		await vscode.close();
	}
}

// -- Main --------------------------------------------------------------------

async function main() {
	const opts = parseArgs();
	const electronPath = await resolveBuild(opts.build);

	if (!fs.existsSync(electronPath)) {
		console.error(`Electron not found at: ${electronPath}`);
		process.exit(1);
	}

	const { startServer } = require('./common/mock-llm-server');
	const { registerPerfScenarios } = require('./common/perf-scenarios');
	registerPerfScenarios();
	const mockServer = await startServer(0);

	console.log(`[chat-simulation] Leak check: ${opts.iterations} iterations × ${getScenarioIds().length} scenarios, threshold ${opts.leakThresholdMB}MB total`);
	console.log(`[chat-simulation] Build: ${electronPath}`);
	console.log('');

	const result = await runLeakCheck(electronPath, mockServer, opts);

	console.log('[chat-simulation] =================== Leak Check Results ===================');
	console.log('');
	console.log(`  Baseline: heap=${result.baseline.heapMB}MB, domNodes=${result.baseline.domNodes}`);
	console.log(`  Final:                  heap=${result.final.heapMB}MB, domNodes=${result.final.domNodes}`);
	console.log('');
	for (let i = 0; i < result.iterations.length; i++) {
		const it = result.iterations[i];
		console.log(`  Iteration ${i + 1}: ${it.beforeHeapMB}MB → ${it.afterHeapMB}MB (residual: ${it.deltaHeapMB > 0 ? '+' : ''}${it.deltaHeapMB}MB, DOM: ${it.deltaDomNodes > 0 ? '+' : ''}${it.deltaDomNodes} nodes)`);
	}
	console.log('');
	console.log(`  Total residual heap growth: ${result.totalResidualMB > 0 ? '+' : ''}${result.totalResidualMB}MB`);
	console.log(`  Total residual DOM growth:  ${result.totalResidualNodes > 0 ? '+' : ''}${result.totalResidualNodes} nodes`);
	console.log('');

	// Write JSON
	const jsonPath = path.join(DATA_DIR, 'chat-simulation-leak-results.json');
	fs.writeFileSync(jsonPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		leakThresholdMB: opts.leakThresholdMB,
		iterationCount: opts.iterations,
		scenarioCount: getScenarioIds().length,
		...result,
	}, null, 2));
	console.log(`[chat-simulation] Results written to ${jsonPath}`);

	const leaked = result.totalResidualMB > opts.leakThresholdMB;
	console.log('');
	if (leaked) {
		console.log(`[chat-simulation] LEAK DETECTED — ${result.totalResidualMB}MB residual exceeds ${opts.leakThresholdMB}MB threshold`);
	} else {
		console.log(`[chat-simulation] No leak detected (${result.totalResidualMB}MB residual < ${opts.leakThresholdMB}MB threshold)`);
	}

	if (opts.ci) {
		const summary = generateLeakCISummary(result, opts);
		const summaryPath = path.join(DATA_DIR, 'ci-summary-leak.md');
		fs.writeFileSync(summaryPath, summary);
		console.log(`[chat-simulation] CI summary written to ${summaryPath}`);
	}

	await mockServer.close();
	process.exit(leaked ? 1 : 0);
}

/**
 * Generate a Markdown summary for CI, matching the perf script pattern.
 * @param {{ baseline: { heapMB: number, domNodes: number }, final: { heapMB: number, domNodes: number }, totalResidualMB: number, totalResidualNodes: number, iterations: { beforeHeapMB: number, afterHeapMB: number, deltaHeapMB: number, beforeDomNodes: number, afterDomNodes: number, deltaDomNodes: number }[] }} result
 * @param {{ leakThresholdMB: number, iterations: number }} opts
 */
function generateLeakCISummary(result, opts) {
	const leaked = result.totalResidualMB > opts.leakThresholdMB;
	const verdict = leaked ? '\u274C **LEAK DETECTED**' : '\u2705 **No leak detected**';
	const lines = [];
	lines.push('## Memory Leak Check');
	lines.push('');
	lines.push('| | |');
	lines.push('|---|---|');
	lines.push(`| **Verdict** | ${verdict} |`);
	lines.push(`| **Threshold** | ${opts.leakThresholdMB} MB |`);
	lines.push(`| **Iterations** | ${opts.iterations} |`);
	lines.push(`| **Scenarios per iteration** | ${getScenarioIds().length} |`);
	lines.push('');
	lines.push('| Phase | Heap (MB) | DOM Nodes |');
	lines.push('|-------|----------:|----------:|');
	lines.push(`| Baseline | ${result.baseline.heapMB} | ${result.baseline.domNodes} |`);
	for (let i = 0; i < result.iterations.length; i++) {
		const it = result.iterations[i];
		const sign = it.deltaHeapMB > 0 ? '+' : '';
		const domSign = it.deltaDomNodes > 0 ? '+' : '';
		lines.push(`| Iteration ${i + 1} | ${it.afterHeapMB} (${sign}${it.deltaHeapMB}) | ${it.afterDomNodes} (${domSign}${it.deltaDomNodes}) |`);
	}
	lines.push(`| **Final** | **${result.final.heapMB}** | **${result.final.domNodes}** |`);
	lines.push('');
	const sign = result.totalResidualMB > 0 ? '+' : '';
	const domSign = result.totalResidualNodes > 0 ? '+' : '';
	lines.push(`**Total residual growth:** ${sign}${result.totalResidualMB} MB heap, ${domSign}${result.totalResidualNodes} DOM nodes`);
	lines.push('');
	return lines.join('\n');
}

main().catch(err => { console.error(err); process.exit(1); });
