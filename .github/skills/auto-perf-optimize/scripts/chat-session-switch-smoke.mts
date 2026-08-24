/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Chat session-switching memory smoke runner.
 *
 * Creates several chat sessions with different content types (codeblocks,
 * markdown, terminal commands), then repeatedly switches between them by
 * clicking in the sessions list. Verifies that switching does not leak.
 *
 * Intended workflow:
 * - Fast health check:
 *   node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts --switch-iterations 3 --no-heap-snapshots
 * - Targeted snapshots:
 *   node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts --switch-iterations 8 --heap-snapshot-label 04-switch-01 --heap-snapshot-label 04-switch-08
 */

import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { StopWatch } from '../../../../src/vs/base/common/stopwatch.ts';
import { prepareUserDataProfile } from './userDataProfile.mts';

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const codeScript = process.platform === 'win32' ? path.join(root, 'scripts', 'code.bat') : path.join(root, 'scripts', 'code.sh');

// Chat selectors
const chatViewSelector = 'div[id="workbench.panel.chat"]';
const chatInputElementSelector = '.native-edit-context, textarea';
const chatInputEditorSelector = `${chatViewSelector} .interactive-input-part .monaco-editor[role="code"]`;
const chatResponseSelector = `${chatViewSelector} .interactive-item-container.interactive-response`;
const chatResponseLoadingSelector = `${chatResponseSelector}.chat-response-loading`;
const chatResponseCompleteSelector = `${chatResponseSelector}:not(.chat-response-loading)`;

// Session list selectors
const sessionItemSelector = '.agent-session-item';

// Markers
const activeChatInputMarker = 'data-session-switch-smoke-input';
const activeChatInputSelector = `[${activeChatInputMarker}="true"]`;
const activeChatInputEditorMarker = 'data-session-switch-smoke-input-editor';
const activeChatInputEditorSelector = `[${activeChatInputEditorMarker}="true"]`;

interface SmokeTestDriver {
	whenWorkbenchRestored(): Promise<void>;
	typeInEditor(selector: string, text: string): Promise<void>;
}

declare global {
	var driver: SmokeTestDriver | undefined;
}

interface HeapSample {
	label: string;
	jsHeapUsedSize: number | undefined;
	jsHeapTotalSize: number | undefined;
	runtimeUsedSize: number | undefined;
	runtimeTotalSize: number | undefined;
	snapshot: string | undefined;
	snapshotBytes: number | undefined;
}

interface SessionInfo {
	index: number;
	prompt: string;
	contentType: string;
	responseText: string | undefined;
}

interface Options {
	help: boolean;
	verbose: boolean;
	reuse: boolean;
	skipPrelaunch: boolean;
	heapSnapshots: boolean;
	heapSnapshotLabels: Set<string> | undefined;
	keepOpen: boolean;
	temporaryUserData: boolean;
	port: number;
	switchIterations: number;
	responseTimeout: number;
	firstResponseTimeout: number;
	settleMs: number;
	workspace: string;
	outputDir: string;
	userDataDir: string | undefined;
	seedUserDataDir: string | undefined;
	extensionDir: string | undefined;
}

interface HeapUsage {
	usedSize: number;
	totalSize: number;
}

interface MemoryTrend {
	firstToLastUsedBytes: number | undefined;
	postFirstSwitchUsedBytes: number | undefined;
	postFirstSwitchUsedBytesPerIteration: number | undefined;
}

interface LaunchedCode {
	child: ChildProcess;
	failedBeforeConnect: Promise<Error>;
	markConnected(): void;
	terminate(signal: NodeJS.Signals): boolean;
}

// Prompts designed to generate different content types
const SESSION_PROMPTS = [
	{
		contentType: 'codeblocks',
		prompt: 'Write a short TypeScript function that reverses a linked list. Include the type definition. Reply ONLY with the code in a fenced code block, no explanation.',
	},
	{
		contentType: 'markdown',
		prompt: 'List 5 best practices for writing maintainable CSS, using markdown headers, bullet points, and bold text. Keep it under 200 words.',
	},
	{
		contentType: 'terminal',
		prompt: 'Show me 3 useful git commands for inspecting history. Format each as a fenced shell code block with a one-line comment above it.',
	},
];

const options = parseArgs(process.argv.slice(2));

if (options.help) {
	printHelp();
	process.exit(0);
}

await main();

async function main(): Promise<void> {
	const outputDir = path.resolve(options.outputDir);
	const extensionDir = path.resolve(options.extensionDir ?? path.join(outputDir, 'extensions'));
	const ownsCode = !options.reuse;
	const shouldCloseCode = ownsCode && !options.keepOpen;
	await mkdir(outputDir, { recursive: true });
	await mkdir(path.join(outputDir, 'heap'), { recursive: true });
	const { userDataDir, ownsUserDataDir } = await prepareUserDataProfile({
		outputDir,
		persistentUserDataDir: path.join(root, '.build', 'auto-perf-optimize', 'user-data'),
		temporaryUserData: options.temporaryUserData,
		keepOpen: options.keepOpen,
		keepUserData: false,
		reuse: options.reuse,
		userDataDir: options.userDataDir,
		seedUserDataDir: options.seedUserDataDir,
	});
	if (!options.temporaryUserData && options.userDataDir === undefined) {
		console.log(`[code] using persistent user-data-dir: ${userDataDir}`);
	}

	let launchedCode: LaunchedCode | undefined;
	let browser: Browser | undefined;
	let session: CDPSession | undefined;
	const samples: HeapSample[] = [];
	const sessions: SessionInfo[] = [];

	try {
		if (!options.reuse && await isCDPAvailable(options.port)) {
			throw new Error(`Port ${options.port} already has a CDP endpoint. Stop that process, pass --port <free port>, or pass --reuse.`);
		}

		launchedCode = ownsCode ? launchCode({ userDataDir, extensionDir }) : undefined;
		browser = await connectToCode(options.port, launchedCode?.failedBeforeConnect);
		launchedCode?.markConnected();
		const page = await findWorkbenchPage(browser);
		session = await page.context().newCDPSession(page);
		await session.send('Performance.enable');
		await session.send('HeapProfiler.enable');

		await page.evaluate(() => globalThis.driver?.whenWorkbenchRestored?.());
		await page.screenshot({ path: path.join(outputDir, '01-workbench.png') });
		samples.push(await sampleHeap(session, outputDir, '01-restored'));

		// --- Phase 1: Create sessions with different content types ---
		console.log('\n=== Phase 1: Creating sessions with different content types ===');

		for (let i = 0; i < SESSION_PROMPTS.length; i++) {
			const { contentType, prompt } = SESSION_PROMPTS[i];
			console.log(`\n--- Creating session ${i + 1} (${contentType}) ---`);

			if (i === 0) {
				// First session: just open chat
				await openChat(page);
			} else {
				// Subsequent sessions: create new chat
				await createNewChatSession(page);
			}

			await page.screenshot({ path: path.join(outputDir, `02-session-${i + 1}-before-send.png`) });

			const responseText = await sendAndWaitForResponse(page, prompt);
			sessions.push({ index: i, prompt, contentType, responseText });

			await page.screenshot({ path: path.join(outputDir, `02-session-${i + 1}-response.png`) });
			console.log(`Session ${i + 1} (${contentType}): response received (${responseText?.length ?? 0} chars)`);
		}

		await writeSummary(outputDir, samples, sessions, options.switchIterations);
		samples.push(await sampleHeap(session, outputDir, '02-sessions-created'));

		// --- Phase 2: Show sessions list ---
		console.log('\n=== Phase 2: Showing sessions sidebar ===');
		await showSessionsSidebar(page);
		await delay(1000);
		await page.screenshot({ path: path.join(outputDir, '03-sessions-sidebar.png') });
		samples.push(await sampleHeap(session, outputDir, '03-sidebar-shown'));

		// --- Phase 3: Switch between sessions ---
		console.log('\n=== Phase 3: Switching between sessions ===');

		// Warmup: do 3 switch cycles before the first measured snapshot
		console.log('\n--- Warmup: 3 switch cycles ---');
		for (let warmup = 0; warmup < 3; warmup++) {
			for (let s = 0; s < SESSION_PROMPTS.length; s++) {
				await clickSessionInList(page, s);
				await waitForSessionContentToLoad(page);
				await delay(300);
			}
		}
		console.log('Warmup complete');

		for (let iteration = 1; iteration <= options.switchIterations; iteration++) {
			const label = String(iteration).padStart(2, '0');
			console.log(`\n--- Switch iteration ${iteration} ---`);

			// Click through each session in the list
			for (let s = 0; s < SESSION_PROMPTS.length; s++) {
				await clickSessionInList(page, s);
				await waitForSessionContentToLoad(page);
				await delay(300);
			}

			await page.screenshot({ path: path.join(outputDir, `04-switch-${label}.png`) });
			samples.push(await sampleHeap(session, outputDir, `04-switch-${label}`));
			await writeSummary(outputDir, samples, sessions, options.switchIterations);
		}

		await writeSummary(outputDir, samples, sessions, options.switchIterations);
		printSummary(samples, outputDir);
	} catch (error) {
		await writeSummary(outputDir, samples, sessions, options.switchIterations, error);
		throw error;
	} finally {
		await session?.detach().catch(() => undefined);
		if (shouldCloseCode) {
			await browser?.newBrowserCDPSession().then(bs => bs.send('Browser.close')).catch(() => undefined);
		}
		await browser?.close().catch(() => undefined);
		if (launchedCode && shouldCloseCode) {
			if (!await waitForChildExit(launchedCode.child, 10000)) {
				launchedCode.terminate('SIGTERM');
				await waitForChildExit(launchedCode.child, 5000);
			}
		}
		if (ownsUserDataDir) {
			await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
		}
	}
}

// ---- Code Launch & Connect ----

function launchCode(dirs: { userDataDir: string; extensionDir: string }): LaunchedCode {
	const args = [
		'--enable-smoke-test-driver',
		'--disable-workspace-trust',
		`--remote-debugging-port=${options.port}`,
		`--user-data-dir=${dirs.userDataDir}`,
		`--extensions-dir=${dirs.extensionDir}`,
		'--skip-welcome',
		'--skip-release-notes',
		options.workspace,
	];

	let failBeforeConnect: (error: Error) => void = () => undefined;
	let connected = false;
	let terminating = false;
	const failedBeforeConnect = new Promise<Error>(resolve => failBeforeConnect = resolve);
	const child = spawn(codeScript, args, {
		cwd: root,
		env: options.skipPrelaunch ? { ...process.env, VSCODE_SKIP_PRELAUNCH: '1' } : process.env,
		detached: options.keepOpen,
		shell: process.platform === 'win32',
		stdio: options.keepOpen ? 'ignore' : options.verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
	});
	if (options.keepOpen) {
		child.unref();
	}

	if (!options.verbose && !options.keepOpen) {
		child.stdout?.on('data', data => process.stdout.write(`[code] ${data}`));
		child.stderr?.on('data', data => process.stderr.write(`[code] ${data}`));
	}
	child.once('error', error => {
		failBeforeConnect(new Error(`Failed to launch Code from ${codeScript}: ${error.message}`));
	});
	child.once('exit', (code, signal) => {
		if (!connected && !terminating) {
			failBeforeConnect(new Error(`Code exited before the script connected to CDP. code=${code} signal=${signal}`));
		}
		if (!options.reuse && code !== 0 && signal !== 'SIGTERM') {
			console.error(`[code] exited with code ${code} signal ${signal}`);
		}
	});

	return {
		child,
		failedBeforeConnect,
		markConnected: () => connected = true,
		terminate: signal => {
			terminating = true;
			return child.kill(signal);
		},
	};
}

async function connectToCode(port: number, launchFailure?: Promise<Error>): Promise<Browser> {
	const endpoint = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 120; i++) {
		try {
			await raceLaunchFailure(waitForCDPEndpoint(port), launchFailure);
			return await chromium.connectOverCDP(endpoint);
		} catch {
			await throwIfLaunchFailed(launchFailure);
			await delay(500);
		}
	}
	throw new Error(`Timed out waiting for Code to expose CDP on ${endpoint}`);
}

async function raceLaunchFailure<T>(promise: Promise<T>, launchFailure: Promise<Error> | undefined): Promise<T> {
	if (!launchFailure) {
		return promise;
	}
	return Promise.race([
		promise,
		launchFailure.then(error => Promise.reject(error)),
	]);
}

async function throwIfLaunchFailed(launchFailure: Promise<Error> | undefined): Promise<void> {
	const launchError = await Promise.race([
		launchFailure,
		new Promise<undefined>(resolve => queueMicrotask(() => resolve(undefined))),
	]);
	if (launchError) {
		throw launchError;
	}
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve(true);
	}
	return new Promise(resolve => {
		const timer = setTimeout(() => resolve(false), timeoutMs);
		timer.unref();
		child.once('exit', () => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}

async function isCDPAvailable(port: number): Promise<boolean> {
	return waitForCDPEndpoint(port).then(() => true, () => false);
}

async function waitForCDPEndpoint(port: number): Promise<void> {
	await getJson(`http://127.0.0.1:${port}/json/version`);
}

async function findWorkbenchPage(browser: Browser): Promise<Page> {
	for (let i = 0; i < 120; i++) {
		const pages = browser.contexts().flatMap(context => context.pages());
		for (const page of pages) {
			const hasDriver = await page.evaluate(() => !!globalThis.driver?.whenWorkbenchRestored).catch(() => false);
			if (hasDriver) {
				return page;
			}
		}
		await delay(500);
	}
	throw new Error('Timed out waiting for the workbench page and smoke-test driver');
}

// ---- Chat Interaction ----

async function openChat(page: Page): Promise<string> {
	if (!await hasVisibleChatInputEditor(page)) {
		const shortcut = process.platform === 'darwin' ? 'Control+Meta+I' : 'Control+Alt+I';
		await page.keyboard.press(shortcut);
		await waitForVisibleChatInputEditor(page);
	}

	let inputEditor = await markChatInputEditor(page);
	await inputEditor.click({ force: true });
	inputEditor = await markChatInputEditor(page);
	await inputEditor.locator(chatInputElementSelector).first().waitFor({ state: 'attached', timeout: 30000 });
	await waitForInputEditorFocus(inputEditor);
	await markActiveChatInput(inputEditor);
	return activeChatInputSelector;
}

async function hasVisibleChatInputEditor(page: Page): Promise<boolean> {
	return page.evaluate(selector => Array.from(document.querySelectorAll(selector)).some(element => {
		if (!(element instanceof HTMLElement)) {
			return false;
		}
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}), chatInputEditorSelector);
}

async function waitForVisibleChatInputEditor(page: Page): Promise<void> {
	await page.waitForFunction(selector => Array.from(document.querySelectorAll(selector)).some(element => {
		if (!(element instanceof HTMLElement)) {
			return false;
		}
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}), chatInputEditorSelector, { timeout: 30000 });
}

async function markChatInputEditor(page: Page): Promise<import('playwright-core').Locator> {
	await page.evaluate(({ editorSelector, marker }) => {
		document.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
		const editors = Array.from(document.querySelectorAll(editorSelector)).filter((element): element is HTMLElement => {
			if (!(element instanceof HTMLElement)) {
				return false;
			}
			const rect = element.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		});
		const activeEditor = editors.find(editor => editor.classList.contains('focused') || editor.contains(document.activeElement));
		const inputEditor = activeEditor ?? editors.toSorted((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom).at(-1);
		if (!inputEditor) {
			throw new Error('Visible Chat input editor not found');
		}
		inputEditor.setAttribute(marker, 'true');
	}, { editorSelector: chatInputEditorSelector, marker: activeChatInputEditorMarker });

	return page.locator(activeChatInputEditorSelector);
}

async function waitForInputEditorFocus(inputEditor: import('playwright-core').Locator): Promise<void> {
	const stopWatch = StopWatch.create();
	while (stopWatch.elapsed() < 5000) {
		if (await inputEditor.evaluate(editor => editor.classList.contains('focused') || !!editor.querySelector(':focus'))) {
			return;
		}
		await delay(50);
	}
	throw new Error('Timed out waiting for Chat input editor focus');
}

async function markActiveChatInput(inputEditor: import('playwright-core').Locator): Promise<void> {
	await inputEditor.evaluate((editor, { inputSelector, marker }) => {
		document.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
		const input = editor.querySelector(inputSelector);
		if (!input) {
			throw new Error('Chat input not found');
		}
		input.setAttribute(marker, 'true');
	}, { inputSelector: chatInputElementSelector, marker: activeChatInputMarker });
}

async function typeInChat(page: Page, message: string): Promise<void> {
	const inputSelector = await openChat(page);
	await page.evaluate(({ selector, text }) => {
		if (!globalThis.driver) {
			throw new Error('Smoke-test driver not found');
		}
		return globalThis.driver.typeInEditor(selector, text);
	}, {
		selector: inputSelector,
		text: message.replace(/\r?\n/g, ' '),
	});
}

async function clearChatInput(page: Page): Promise<void> {
	await openChat(page);
	await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
	await page.keyboard.press('Backspace');
}

async function createNewChatSession(page: Page): Promise<void> {
	// Use the new chat keyboard shortcut
	const shortcut = 'Control+L';
	await page.keyboard.press(shortcut);
	await delay(500);
	await waitForVisibleChatInputEditor(page);
	const inputEditor = await markChatInputEditor(page);
	await inputEditor.click({ force: true });
	await waitForInputEditorFocus(inputEditor);
	await markActiveChatInput(inputEditor);
}

async function sendAndWaitForResponse(page: Page, message: string): Promise<string | undefined> {
	const responseCountBefore = await page.locator(chatResponseSelector).count();
	const textBefore = await getLatestChatResponseText(page);

	await clearChatInput(page);
	await typeInChat(page, message);
	await page.keyboard.press('Enter');

	// Wait for response to start
	await page.waitForFunction(
		({ responseSelector, loadingSelector, count, textBefore: tb }) => {
			const getResponseText = (element: Element | undefined) => {
				const contentElement = element?.querySelector(':scope > .value') ?? element;
				return contentElement instanceof HTMLElement ? contentElement.innerText.trim() : contentElement?.textContent?.trim();
			};
			const responses = Array.from(document.querySelectorAll(responseSelector));
			const latestText = getResponseText(responses.at(-1));
			if (responses.length > count) {
				return true;
			}
			const loadingResponse = document.querySelector(loadingSelector);
			if (loadingResponse) {
				return true;
			}
			if (!!latestText && latestText !== tb?.trim()) {
				return true;
			}
			return false;
		},
		{ responseSelector: chatResponseSelector, loadingSelector: chatResponseLoadingSelector, count: responseCountBefore, textBefore },
		{ timeout: options.firstResponseTimeout }
	);

	// Wait for response to complete
	await page.waitForFunction(
		({ completeSelector, loadingSelector, countBefore, textBefore: tb }) => {
			const getResponseText = (element: Element | undefined) => {
				const contentElement = element?.querySelector(':scope > .value') ?? element;
				return contentElement instanceof HTMLElement ? contentElement.innerText.trim() : contentElement?.textContent?.trim();
			};
			const completedResponses = Array.from(document.querySelectorAll(completeSelector));
			const loadingResponses = Array.from(document.querySelectorAll(loadingSelector));
			const latestText = getResponseText(completedResponses.at(-1));
			return !!latestText && latestText !== 'Working' && loadingResponses.length === 0 && (completedResponses.length > countBefore || latestText !== tb?.trim());
		},
		{ completeSelector: chatResponseCompleteSelector, loadingSelector: chatResponseLoadingSelector, countBefore: responseCountBefore, textBefore },
		{ timeout: options.responseTimeout }
	);

	await delay(options.settleMs);
	return getLatestChatResponseText(page);
}

async function getLatestChatResponseText(page: Page): Promise<string | undefined> {
	return page.evaluate(responseSelector => {
		const response = Array.from(document.querySelectorAll(responseSelector)).at(-1);
		const contentElement = response?.querySelector(':scope > .value') ?? response;
		return contentElement instanceof HTMLElement ? contentElement.innerText : contentElement?.textContent ?? undefined;
	}, chatResponseSelector);
}

// ---- Session List Interaction ----

async function dismissDialogs(page: Page): Promise<void> {
	const dialogBlocker = page.locator('.monaco-dialog-modal-block');
	const stopWatch = StopWatch.create();
	while (stopWatch.elapsed() < 3000) {
		const visible = await dialogBlocker.count() > 0 && await dialogBlocker.first().isVisible().catch(() => false);
		if (!visible) {
			return;
		}
		console.log('[dialog] dismissing modal dialog via Escape');
		await page.keyboard.press('Escape');
		await delay(300);
	}
}

async function showSessionsSidebar(page: Page): Promise<void> {
	await dismissDialogs(page);

	// Use command palette to show sessions sidebar
	await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
	await delay(300);
	await page.keyboard.type('Show Sessions', { delay: 30 });
	await delay(500);

	// Press Enter to execute the first matching command
	await page.keyboard.press('Enter');
	await delay(1000);

	// Dismiss any dialogs that appeared as a side effect
	await dismissDialogs(page);

	// Verify sessions list is visible
	const sessionItems = await page.locator(sessionItemSelector).count();
	console.log(`[sessions] sidebar shown, ${sessionItems} session items visible`);
}

async function clickSessionInList(page: Page, sessionIndex: number): Promise<void> {
	// Dismiss any modal dialogs before clicking
	await dismissDialogs(page);

	// The sessions list shows the newest sessions at the top (under TODAY section).
	// Our newly-created sessions are at the top. We need to click within
	// the TODAY section, which are the first items in the list.
	// sessionIndex 0 = first session we created (at top of TODAY section)

	// Find session items that are in the TODAY section (most recent)
	const sessionItems = page.locator(sessionItemSelector);
	const count = await sessionItems.count();

	if (count === 0) {
		throw new Error('No session items found in the sessions list');
	}

	// Click directly by index (0 = first/newest)
	const targetIndex = Math.min(sessionIndex, count - 1);
	const targetItem = sessionItems.nth(targetIndex);

	const title = await targetItem.textContent();
	console.log(`[sessions] clicking session ${sessionIndex} (list index ${targetIndex}/${count}): "${title?.substring(0, 60)}..."`);

	await targetItem.click();
	await delay(300);
}

async function waitForSessionContentToLoad(page: Page): Promise<void> {
	// Wait for the chat view to have at least one response and be settled
	const stopWatch = StopWatch.create();
	while (stopWatch.elapsed() < 15000) {
		const isSettled = await page.evaluate(({ responseSelector, viewSelector, loadingSelector }) => {
			const chatView = document.querySelector(viewSelector);
			if (!chatView) {
				return false;
			}
			// Check if there's at least one response in the view
			const responses = chatView.querySelectorAll(responseSelector);
			// Check no loading indicators
			const loading = chatView.querySelectorAll(loadingSelector);
			return responses.length > 0 && loading.length === 0;
		}, {
			responseSelector: '.interactive-item-container.interactive-response',
			viewSelector: chatViewSelector,
			loadingSelector: '.interactive-item-container.chat-response-loading',
		});

		if (isSettled) {
			return;
		}
		await delay(100);
	}
	console.log('[sessions] warning: timed out waiting for session content to load');
}

// ---- Heap Sampling ----

async function sampleHeap(cdpSession: CDPSession, outputDir: string, label: string): Promise<HeapSample> {
	await forceGarbageCollection(cdpSession);
	const performanceMetrics = await getPerformanceMetrics(cdpSession);
	const runtimeHeapUsage = await getRuntimeHeapUsage(cdpSession);
	const snapshot = shouldTakeHeapSnapshot(label) ? path.join(outputDir, 'heap', `${label}.heapsnapshot`) : undefined;
	const snapshotBytes = snapshot ? await takeHeapSnapshot(cdpSession, snapshot) : undefined;
	const sample: HeapSample = {
		label,
		jsHeapUsedSize: performanceMetrics.get('JSHeapUsedSize'),
		jsHeapTotalSize: performanceMetrics.get('JSHeapTotalSize'),
		runtimeUsedSize: runtimeHeapUsage?.usedSize,
		runtimeTotalSize: runtimeHeapUsage?.totalSize,
		snapshot,
		snapshotBytes,
	};

	console.log(`[heap] ${label}: ${formatBytes(sample.runtimeUsedSize ?? sample.jsHeapUsedSize)} used, ${snapshotBytes === undefined ? 'no snapshot' : `${formatBytes(snapshotBytes)} snapshot`}`);
	return sample;
}

async function forceGarbageCollection(cdpSession: CDPSession): Promise<void> {
	await cdpSession.send('HeapProfiler.collectGarbage');
	await cdpSession.send('HeapProfiler.collectGarbage');
}

async function getPerformanceMetrics(cdpSession: CDPSession): Promise<Map<string, number>> {
	const response = await cdpSession.send('Performance.getMetrics');
	return new Map(response.metrics.map(metric => [metric.name, metric.value]));
}

async function getRuntimeHeapUsage(cdpSession: CDPSession): Promise<HeapUsage | undefined> {
	return cdpSession.send('Runtime.getHeapUsage').catch(() => undefined);
}

async function takeHeapSnapshot(cdpSession: CDPSession, file: string): Promise<number> {
	await mkdir(path.dirname(file), { recursive: true });
	const stream = createWriteStream(file);
	let snapshotBytes = 0;
	let pendingWrite = Promise.resolve();

	const onChunk = (event: { chunk: string }) => {
		snapshotBytes += Buffer.byteLength(event.chunk);
		pendingWrite = pendingWrite.then(() => new Promise((resolve, reject) => {
			stream.write(event.chunk, error => error ? reject(error) : resolve());
		}));
	};

	cdpSession.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
	try {
		await cdpSession.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
		await pendingWrite;
	} finally {
		cdpSession.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
		await new Promise<void>((resolve, reject) => {
			stream.once('error', reject);
			stream.end(resolve);
		});
	}

	return snapshotBytes;
}

function shouldTakeHeapSnapshot(label: string): boolean {
	return options.heapSnapshots && (!options.heapSnapshotLabels || options.heapSnapshotLabels.has(label));
}

// ---- Summary & Output ----

function printSummary(samples: HeapSample[], outputDir: string): void {
	console.log(`\nSummary written to ${path.join(outputDir, 'summary.json')}`);
	for (const sample of samples) {
		const heapSize = sample.runtimeUsedSize ?? sample.jsHeapUsedSize;
		console.log(`${sample.label.padEnd(32)} ${formatBytes(heapSize).padStart(10)} ${sample.snapshot ? path.relative(root, sample.snapshot) : ''}`);
	}

	const trend = analyzeMemoryTrend(samples);
	if (trend.postFirstSwitchUsedBytes !== undefined) {
		console.log(`Post-first-switch growth: ${formatSignedBytes(trend.postFirstSwitchUsedBytes)} (${formatSignedBytes(trend.postFirstSwitchUsedBytesPerIteration)}/iteration)`);
	}
}

async function writeSummary(outputDir: string, samples: HeapSample[], sessions: SessionInfo[], switchIterations: number, error?: unknown): Promise<void> {
	await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
		createdAt: new Date().toISOString(),
		workspace: options.workspace,
		switchIterations,
		sessionsCreated: sessions.length,
		sessions,
		error: error === undefined ? undefined : String(error instanceof Error && error.stack ? error.stack : error),
		analysis: analyzeMemoryTrend(samples),
		samples,
	}, undefined, '\t'));
}

function analyzeMemoryTrend(samples: HeapSample[]): MemoryTrend {
	const sizedSamples = samples.map(sample => sample.runtimeUsedSize ?? sample.jsHeapUsedSize);
	const firstSize = sizedSamples.at(0);
	const lastSize = sizedSamples.at(-1);
	const switchSamples = samples.filter(sample => sample.label.startsWith('04-switch-'));
	const firstSwitchSize = switchSamples.at(0)?.runtimeUsedSize ?? switchSamples.at(0)?.jsHeapUsedSize;
	const lastSwitchSize = switchSamples.at(-1)?.runtimeUsedSize ?? switchSamples.at(-1)?.jsHeapUsedSize;
	const postFirstSwitchUsedBytes = firstSwitchSize !== undefined && lastSwitchSize !== undefined && switchSamples.length > 1 ? lastSwitchSize - firstSwitchSize : undefined;
	return {
		firstToLastUsedBytes: firstSize !== undefined && lastSize !== undefined && samples.length > 1 ? lastSize - firstSize : undefined,
		postFirstSwitchUsedBytes,
		postFirstSwitchUsedBytesPerIteration: postFirstSwitchUsedBytes !== undefined ? postFirstSwitchUsedBytes / (switchSamples.length - 1) : undefined,
	};
}

// ---- Utilities ----

function formatBytes(bytes: number | undefined): string {
	if (typeof bytes !== 'number') {
		return 'unknown';
	}
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatSignedBytes(bytes: number | undefined): string {
	if (bytes === undefined) {
		return 'unknown';
	}
	return `${bytes >= 0 ? '+' : '-'}${formatBytes(Math.abs(bytes))}`;
}

function getJson(url: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = http.get(url, response => {
			response.resume();
			response.once('end', () => response.statusCode === 200 ? resolve(undefined) : reject(new Error(`HTTP ${response.statusCode}`)));
		});
		request.setTimeout(1000, () => {
			request.destroy(new Error('Request timed out'));
		});
		request.once('error', reject);
	});
}

// ---- Argument Parsing ----

function parseArgs(args: string[]): Options {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const parsed: Options = {
		help: false,
		verbose: false,
		reuse: false,
		skipPrelaunch: false,
		heapSnapshots: true,
		heapSnapshotLabels: undefined,
		keepOpen: false,
		temporaryUserData: false,
		port: 9224,
		switchIterations: 5,
		responseTimeout: 120000,
		firstResponseTimeout: 30000,
		settleMs: 3000,
		workspace: root,
		outputDir: path.join(root, '.build', 'chat-session-switch-smoke', timestamp),
		userDataDir: undefined,
		seedUserDataDir: undefined,
		extensionDir: undefined,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--help' || arg === '-h') {
			parsed.help = true;
		} else if (arg === '--verbose') {
			parsed.verbose = true;
		} else if (arg === '--reuse') {
			parsed.reuse = true;
		} else if (arg === '--skip-prelaunch') {
			parsed.skipPrelaunch = true;
		} else if (arg === '--no-heap-snapshots') {
			parsed.heapSnapshots = false;
		} else if (arg.startsWith('--heap-snapshot-label=')) {
			addHeapSnapshotLabels(parsed, arg.slice('--heap-snapshot-label='.length));
		} else if (arg === '--heap-snapshot-label') {
			addHeapSnapshotLabels(parsed, readArgValue(args, ++i, arg));
		} else if (arg === '--keep-open') {
			parsed.keepOpen = true;
		} else if (arg === '--temporary-user-data') {
			parsed.temporaryUserData = true;
		} else if (arg.startsWith('--')) {
			const [key, inlineValue] = splitArg(arg);
			const value = inlineValue ?? readArgValue(args, ++i, key);
			switch (key) {
				case '--port': parsed.port = parseIntegerArg(key, value, 1); break;
				case '--switch-iterations': parsed.switchIterations = parseIntegerArg(key, value, 1); break;
				case '--response-timeout': parsed.responseTimeout = parseIntegerArg(key, value, 1); break;
				case '--first-response-timeout': parsed.firstResponseTimeout = parseIntegerArg(key, value, 1); break;
				case '--settle-ms': parsed.settleMs = parseIntegerArg(key, value, 0); break;
				case '--workspace': parsed.workspace = path.resolve(value); break;
				case '--output': parsed.outputDir = value; break;
				case '--user-data-dir': parsed.userDataDir = value; break;
				case '--seed-user-data-dir': parsed.seedUserDataDir = value; break;
				case '--extensions-dir': parsed.extensionDir = value; break;
				default: throw new Error(`Unknown argument: ${key}`);
			}
		} else {
			throw new Error(`Unexpected positional argument: ${arg}`);
		}
	}

	return parsed;
}

function addHeapSnapshotLabels(opts: Options, value: string): void {
	opts.heapSnapshotLabels ??= new Set();
	for (const label of value.split(',')) {
		const trimmedLabel = label.trim();
		if (trimmedLabel) {
			opts.heapSnapshotLabels.add(trimmedLabel);
		}
	}
}

function splitArg(arg: string): [string, string | undefined] {
	const index = arg.indexOf('=');
	return index === -1 ? [arg, undefined] : [arg.slice(0, index), arg.slice(index + 1)];
}

function readArgValue(args: string[], index: number, flag: string): string {
	const value = args[index];
	if (typeof value !== 'string') {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

function parseIntegerArg(flag: string, value: string, min: number): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < min) {
		throw new Error(`${flag} must be an integer greater than or equal to ${min}. Got: ${value}`);
	}
	return parsed;
}

function printHelp(): void {
	console.log([
		'Usage: node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts [options]',
		'',
		'Creates multiple Chat sessions with different content types, then repeatedly',
		'switches between them via the sessions list to verify no memory leaks.',
		'',
		'Options:',
		'  --workspace <path>              Workspace to open. Default: repo root',
		'  --output <path>                 Output folder. Default: .build/chat-session-switch-smoke/<timestamp>',
		'  --port <number>                 Remote debugging port. Default: 9224',
		'  --switch-iterations <number>    Number of full switch cycles. Default: 5',
		'  --no-heap-snapshots             Only record small heap-size metrics',
		'  --heap-snapshot-label <label>   Only snapshot matching sample labels. Repeatable or comma-separated',
		'  --reuse                         Attach to an already-running --enable-smoke-test-driver window',
		'  --skip-prelaunch                Set VSCODE_SKIP_PRELAUNCH=1',
		'  --temporary-user-data           Use an output-local clean user-data-dir',
		'  --seed-user-data-dir <path>     Copy a logged-in profile into a fresh target user-data-dir before launch',
		'  --keep-open                     Leave launched Code open',
		'  --verbose                       Show Code stdout/stderr',
		'',
		'Example:',
		'  node .github/skills/auto-perf-optimize/scripts/chat-session-switch-smoke.mts --switch-iterations 3 --no-heap-snapshots',
	].join('\n'));
}
