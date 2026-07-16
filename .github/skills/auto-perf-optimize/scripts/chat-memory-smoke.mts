/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Chat memory smoke runner.
 *
 * Intended workflow:
 * - Run `node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --iterations 3 --no-heap-snapshots` for a fast health check.
 * - Run `node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --iterations 8 --heap-snapshot-label 03-iteration-01 --heap-snapshot-label 03-iteration-08` when comparing post-warmup heap snapshots.
 * - Inspect the output folder's summary.json, screenshots, and optional heap/*.heapsnapshot files.
 *
 * The default profile is persistent at .build/auto-perf-optimize/user-data so auth can be reused across performance runners.
 * Pass --temporary-user-data when a clean, disposable profile is required; combine it with --seed-user-data-dir to start from a logged-in seed.
 */

import { chromium, type Browser, type CDPSession, type Locator, type Page } from 'playwright-core';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as timeout } from 'node:timers/promises';
import { StopWatch } from '../../../../src/vs/base/common/stopwatch.ts';
import { prepareUserDataProfile } from './userDataProfile.mts';

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const codeScript = process.platform === 'win32' ? path.join(root, 'scripts', 'code.bat') : path.join(root, 'scripts', 'code.sh');
const chatViewSelector = 'div[id="workbench.panel.chat"]';
const chatInputElementSelector = '.native-edit-context, textarea';
const chatInputEditorSelector = `${chatViewSelector} .interactive-input-part .monaco-editor[role="code"]`;
const chatResponseSelector = `${chatViewSelector} .interactive-item-container.interactive-response`;
const chatResponseLoadingSelector = `${chatResponseSelector}.chat-response-loading`;
const chatResponseCompleteSelector = `${chatResponseSelector}:not(.chat-response-loading)`;
const activeChatResponseMarker = 'data-chat-memory-smoke-response-started';
const activeChatInputMarker = 'data-chat-memory-smoke-input';
const activeChatInputSelector = `[${activeChatInputMarker}="true"]`;
const activeChatInputEditorMarker = 'data-chat-memory-smoke-input-editor';
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

interface ChatTurn {
	iteration: number;
	prompt: string;
	skippedSend: boolean;
	responseCountBefore: number;
	responseCountAfterSend: number;
	responseCountAfterSettled: number | undefined;
	responseStartReason: 'response-count' | 'loading' | 'text-change' | undefined;
	latestResponseTextBefore: string | undefined;
	latestResponseText: string | undefined;
	screenshot: string | undefined;
}

interface Options {
	help: boolean;
	verbose: boolean;
	reuse: boolean;
	skipSend: boolean;
	skipPrelaunch: boolean;
	heapSnapshots: boolean;
	heapSnapshotLabels: Set<string> | undefined;
	keepUserData: boolean;
	keepOpen: boolean;
	temporaryUserData: boolean;
	port: number;
	iterations: number;
	responseTimeout: number;
	firstResponseTimeout: number;
	settleMs: number;
	workspace: string;
	outputDir: string;
	userDataDir: string | undefined;
	seedUserDataDir: string | undefined;
	extensionDir: string | undefined;
	message: string;
	draftMessage: string;
	runtimeArgs: string[];
}

interface HeapUsage {
	usedSize: number;
	totalSize: number;
}

interface MemoryTrend {
	firstToLastUsedBytes: number | undefined;
	postFirstTurnUsedBytes: number | undefined;
	postFirstTurnUsedBytesPerTurn: number | undefined;
}

interface LaunchedCode {
	child: ChildProcess;
	failedBeforeConnect: Promise<Error>;
	markConnected(): void;
	terminate(signal: NodeJS.Signals): boolean;
}

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
		keepUserData: options.keepUserData,
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
	const chatTurns: ChatTurn[] = [];

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

		await openChat(page);
		await page.screenshot({ path: path.join(outputDir, '02-chat-open.png') });
		await typeInChat(page, options.draftMessage);
		await clearChatInput(page);
		samples.push(await sampleHeap(session, outputDir, '02-chat-opened-and-drafted'));

		for (let i = 1; i <= options.iterations; i++) {
			const label = String(i).padStart(2, '0');
			const message = expandMessage(options.message, i);
			const chatTurn = createChatTurn(i, message);
			chatTurns.push(chatTurn);
			await sendChatMessage(page, chatTurn, options.skipSend, async () => {
				chatTurn.screenshot = path.join(outputDir, `03-iteration-${label}-submitted.png`);
				await page.screenshot({ path: chatTurn.screenshot });
				chatTurn.latestResponseText = await getLatestChatResponseText(page);
				await writeSummary(outputDir, samples, chatTurns);
			});
			chatTurn.latestResponseText = await getLatestChatResponseText(page);
			const screenshot = path.join(outputDir, `03-iteration-${label}-after-send.png`);
			await page.screenshot({ path: screenshot });
			chatTurn.screenshot = screenshot;
			await waitForChatToSettle(page, chatTurn, options.responseTimeout, options.settleMs);
			chatTurn.screenshot = path.join(outputDir, `03-iteration-${label}-settled.png`);
			await page.screenshot({ path: chatTurn.screenshot });
			chatTurn.responseCountAfterSettled = await page.locator(chatResponseSelector).count();
			chatTurn.latestResponseText = await getLatestChatResponseText(page);
			samples.push(await sampleHeap(session, outputDir, `03-iteration-${label}`));
		}

		await writeSummary(outputDir, samples, chatTurns);

		printSummary(samples, outputDir);
	} catch (error) {
		await writeSummary(outputDir, samples, chatTurns, error);
		throw error;
	} finally {
		await session?.detach().catch(() => undefined);
		if (shouldCloseCode) {
			await browser?.newBrowserCDPSession().then(browserSession => browserSession.send('Browser.close')).catch(() => undefined);
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

function launchCode(dirs: { userDataDir: string; extensionDir: string }): LaunchedCode {
	const args = [
		'--enable-smoke-test-driver',
		'--disable-workspace-trust',
		`--remote-debugging-port=${options.port}`,
		`--user-data-dir=${dirs.userDataDir}`,
		`--extensions-dir=${dirs.extensionDir}`,
		'--skip-welcome',
		'--skip-release-notes',
		...options.runtimeArgs,
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
			await timeout(500);
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
		await timeout(500);
	}

	throw new Error('Timed out waiting for the workbench page and smoke-test driver');
}

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

async function markChatInputEditor(page: Page): Promise<Locator> {
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

async function waitForInputEditorFocus(inputEditor: Locator): Promise<void> {
	const stopWatch = StopWatch.create();
	while (stopWatch.elapsed() < 5000) {
		if (await inputEditor.evaluate(editor => editor.classList.contains('focused') || !!editor.querySelector(':focus'))) {
			return;
		}
		await timeout(50);
	}

	throw new Error('Timed out waiting for Chat input editor focus');
}

async function markActiveChatInput(inputEditor: Locator): Promise<void> {
	await inputEditor.evaluate((editor, { inputSelector, marker }) => {
		document.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
		const input = editor.querySelector(inputSelector);
		if (!input) {
			throw new Error('Chat input not found');
		}

		input.setAttribute(marker, 'true');
	}, { inputSelector: chatInputElementSelector, marker: activeChatInputMarker });
}

async function clearChatInput(page: Page): Promise<void> {
	await openChat(page);
	await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
	await page.keyboard.press('Backspace');
}

function createChatTurn(iteration: number, prompt: string): ChatTurn {
	return {
		iteration,
		prompt,
		skippedSend: false,
		responseCountBefore: 0,
		responseCountAfterSend: 0,
		responseCountAfterSettled: undefined,
		responseStartReason: undefined,
		latestResponseText: undefined,
		latestResponseTextBefore: undefined,
		screenshot: undefined,
	};
}

async function sendChatMessage(page: Page, chatTurn: ChatTurn, skipSend: boolean, onSubmitted: () => Promise<void>): Promise<void> {
	const responseCount = await page.locator(chatResponseSelector).count();
	chatTurn.responseCountBefore = responseCount;
	chatTurn.responseCountAfterSend = responseCount;
	chatTurn.latestResponseTextBefore = await getLatestChatResponseText(page);
	await clearChatInput(page);
	await typeInChat(page, chatTurn.prompt);
	if (skipSend) {
		chatTurn.skippedSend = true;
		await onSubmitted();
		return;
	}

	await page.keyboard.press('Enter');
	chatTurn.responseCountAfterSend = await page.locator(chatResponseSelector).count();
	await onSubmitted();
	const responseStartReason = await page.waitForFunction(
		({ responseSelector, loadingSelector, marker, count, textBefore }) => {
			const getResponseText = (element: Element | undefined) => {
				const contentElement = element?.querySelector(':scope > .value') ?? element;
				return contentElement instanceof HTMLElement ? contentElement.innerText.trim() : contentElement?.textContent?.trim();
			};
			const markResponse = (element: Element | undefined) => {
				document.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
				element?.setAttribute(marker, 'true');
			};
			const responses = Array.from(document.querySelectorAll(responseSelector));
			const latestText = getResponseText(responses.at(-1));
			if (responses.length > count) {
				markResponse(responses.at(-1));
				return 'response-count';
			}
			const loadingResponse = document.querySelector(loadingSelector);
			if (loadingResponse) {
				markResponse(loadingResponse);
				return 'loading';
			}
			if (!!latestText && latestText !== textBefore?.trim()) {
				markResponse(responses.at(-1));
				return 'text-change';
			}

			return false;
		},
		{ responseSelector: chatResponseSelector, loadingSelector: chatResponseLoadingSelector, marker: activeChatResponseMarker, count: responseCount, textBefore: chatTurn.latestResponseTextBefore },
		{ timeout: options.firstResponseTimeout }
	).then(result => result.jsonValue());
	chatTurn.responseStartReason = validateResponseStartReason(responseStartReason);
	chatTurn.responseCountAfterSend = await page.locator(chatResponseSelector).count();
}

async function waitForChatToSettle(page: Page, chatTurn: ChatTurn, responseTimeout: number, settleMs: number): Promise<void> {
	if (chatTurn.skippedSend) {
		return;
	}

	await page.waitForFunction(
		({ completeSelector, loadingSelector, countBefore, textBefore }) => {
			const getResponseText = (element: Element | undefined) => {
				const contentElement = element?.querySelector(':scope > .value') ?? element;
				return contentElement instanceof HTMLElement ? contentElement.innerText.trim() : contentElement?.textContent?.trim();
			};
			const completedResponses = Array.from(document.querySelectorAll(completeSelector));
			const loadingResponses = Array.from(document.querySelectorAll(loadingSelector));
			const latestText = getResponseText(completedResponses.at(-1));
			return !!latestText && latestText !== 'Working' && loadingResponses.length === 0 && (completedResponses.length > countBefore || latestText !== textBefore?.trim());
		},
		{ completeSelector: chatResponseCompleteSelector, loadingSelector: chatResponseLoadingSelector, countBefore: chatTurn.responseCountBefore, textBefore: chatTurn.latestResponseTextBefore },
		{ timeout: responseTimeout }
	);
	await timeout(settleMs);
}

async function getLatestChatResponseText(page: Page): Promise<string | undefined> {
	return page.evaluate(responseSelector => {
		const response = Array.from(document.querySelectorAll(responseSelector)).at(-1);
		const contentElement = response?.querySelector(':scope > .value') ?? response;
		return contentElement instanceof HTMLElement ? contentElement.innerText : contentElement?.textContent ?? undefined;
	}, chatResponseSelector);
}

function validateResponseStartReason(value: unknown): ChatTurn['responseStartReason'] {
	if (value === 'response-count' || value === 'loading' || value === 'text-change') {
		return value;
	}

	throw new Error(`Unexpected response start reason: ${String(value)}`);
}

async function sampleHeap(session: CDPSession, outputDir: string, label: string): Promise<HeapSample> {
	await forceGarbageCollection(session);
	const performanceMetrics = await getPerformanceMetrics(session);
	const runtimeHeapUsage = await getRuntimeHeapUsage(session);
	const snapshot = shouldTakeHeapSnapshot(label) ? path.join(outputDir, 'heap', `${label}.heapsnapshot`) : undefined;
	const snapshotBytes = snapshot ? await takeHeapSnapshot(session, snapshot) : undefined;
	const sample = {
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

async function forceGarbageCollection(session: CDPSession): Promise<void> {
	await session.send('HeapProfiler.collectGarbage');
	await session.send('HeapProfiler.collectGarbage');
}

async function getPerformanceMetrics(session: CDPSession): Promise<Map<string, number>> {
	const response = await session.send('Performance.getMetrics');
	return new Map(response.metrics.map(metric => [metric.name, metric.value]));
}

async function getRuntimeHeapUsage(session: CDPSession): Promise<HeapUsage | undefined> {
	return session.send('Runtime.getHeapUsage').catch(() => undefined);
}

async function takeHeapSnapshot(session: CDPSession, file: string): Promise<number> {
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

	session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
	try {
		await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
		await pendingWrite;
	} finally {
		session.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
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

function printSummary(samples: HeapSample[], outputDir: string): void {
	console.log(`\nSummary written to ${path.join(outputDir, 'summary.json')}`);
	for (const sample of samples) {
		const heapSize = sample.runtimeUsedSize ?? sample.jsHeapUsedSize;
		console.log(`${sample.label.padEnd(32)} ${formatBytes(heapSize).padStart(10)} ${sample.snapshot ? path.relative(root, sample.snapshot) : ''}`);
	}

	const trend = analyzeMemoryTrend(samples);
	if (trend.postFirstTurnUsedBytes !== undefined) {
		console.log(`Post-first-turn growth: ${formatSignedBytes(trend.postFirstTurnUsedBytes)} (${formatSignedBytes(trend.postFirstTurnUsedBytesPerTurn)}/turn)`);
	}
}

async function writeSummary(outputDir: string, samples: HeapSample[], chatTurns: ChatTurn[], error?: unknown): Promise<void> {
	await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
		createdAt: new Date().toISOString(),
		workspace: options.workspace,
		iterations: options.iterations,
		port: options.port,
		chatTurns,
		error: error === undefined ? undefined : String(error instanceof Error && error.stack ? error.stack : error),
		analysis: analyzeMemoryTrend(samples),
		samples,
	}, undefined, '\t'));
}

function analyzeMemoryTrend(samples: HeapSample[]): MemoryTrend {
	const sizedSamples = samples.map(sample => sample.runtimeUsedSize ?? sample.jsHeapUsedSize);
	const firstSize = sizedSamples.at(0);
	const lastSize = sizedSamples.at(-1);
	const turnSamples = samples.filter(sample => sample.label.startsWith('03-iteration-'));
	const firstTurnSize = turnSamples.at(0)?.runtimeUsedSize ?? turnSamples.at(0)?.jsHeapUsedSize;
	const lastTurnSize = turnSamples.at(-1)?.runtimeUsedSize ?? turnSamples.at(-1)?.jsHeapUsedSize;
	const postFirstTurnUsedBytes = firstTurnSize !== undefined && lastTurnSize !== undefined && turnSamples.length > 1 ? lastTurnSize - firstTurnSize : undefined;
	return {
		firstToLastUsedBytes: firstSize !== undefined && lastSize !== undefined && samples.length > 1 ? lastSize - firstSize : undefined,
		postFirstTurnUsedBytes,
		postFirstTurnUsedBytesPerTurn: postFirstTurnUsedBytes !== undefined ? postFirstTurnUsedBytes / (turnSamples.length - 1) : undefined,
	};
}

function expandMessage(template: string, iteration: number): string {
	return template.replace(/\{iteration\}/g, String(iteration));
}

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

function parseArgs(args: string[]): Options {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const parsed: Options = {
		help: false,
		verbose: false,
		reuse: false,
		skipSend: false,
		skipPrelaunch: false,
		heapSnapshots: true,
		heapSnapshotLabels: undefined,
		keepUserData: false,
		keepOpen: false,
		temporaryUserData: false,
		port: 9224,
		iterations: 3,
		responseTimeout: 120000,
		firstResponseTimeout: 30000,
		settleMs: 3000,
		workspace: root,
		outputDir: path.join(root, '.build', 'chat-memory-smoke', timestamp),
		userDataDir: undefined,
		seedUserDataDir: undefined,
		extensionDir: undefined,
		message: 'For memory-smoke iteration {iteration}, reply with exactly one short sentence.',
		draftMessage: 'draft message used by chat memory smoke',
		runtimeArgs: [],
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--help' || arg === '-h') {
			parsed.help = true;
		} else if (arg === '--verbose') {
			parsed.verbose = true;
		} else if (arg === '--reuse') {
			parsed.reuse = true;
		} else if (arg === '--skip-send') {
			parsed.skipSend = true;
		} else if (arg === '--skip-prelaunch') {
			parsed.skipPrelaunch = true;
		} else if (arg === '--no-heap-snapshots') {
			parsed.heapSnapshots = false;
		} else if (arg.startsWith('--heap-snapshot-label=')) {
			addHeapSnapshotLabels(parsed, arg.slice('--heap-snapshot-label='.length));
		} else if (arg === '--heap-snapshot-label') {
			addHeapSnapshotLabels(parsed, readArgValue(args, ++i, arg));
		} else if (arg === '--keep-user-data') {
			parsed.keepUserData = true;
		} else if (arg === '--keep-open') {
			parsed.keepOpen = true;
		} else if (arg === '--temporary-user-data') {
			parsed.temporaryUserData = true;
		} else if (arg.startsWith('--runtime-arg=')) {
			parsed.runtimeArgs.push(arg.slice('--runtime-arg='.length));
		} else if (arg === '--runtime-arg') {
			parsed.runtimeArgs.push(readArgValue(args, ++i, arg));
		} else if (arg.startsWith('--')) {
			const [key, inlineValue] = splitArg(arg);
			const value = inlineValue ?? readArgValue(args, ++i, key);
			switch (key) {
				case '--port': parsed.port = parseIntegerArg(key, value, 1); break;
				case '--iterations': parsed.iterations = parseIntegerArg(key, value, 0); break;
				case '--response-timeout': parsed.responseTimeout = parseIntegerArg(key, value, 1); break;
				case '--first-response-timeout': parsed.firstResponseTimeout = parseIntegerArg(key, value, 1); break;
				case '--settle-ms': parsed.settleMs = parseIntegerArg(key, value, 0); break;
				case '--workspace': parsed.workspace = path.resolve(value); break;
				case '--output': parsed.outputDir = value; break;
				case '--user-data-dir': parsed.userDataDir = value; break;
				case '--seed-user-data-dir': parsed.seedUserDataDir = value; break;
				case '--extensions-dir': parsed.extensionDir = value; break;
				case '--message': parsed.message = value; break;
				case '--draft-message': parsed.draftMessage = value; break;
				default: throw new Error(`Unknown argument: ${key}`);
			}
		} else {
			throw new Error(`Unexpected positional argument: ${arg}`);
		}
	}

	return parsed;
}

function addHeapSnapshotLabels(options: Options, value: string): void {
	options.heapSnapshotLabels ??= new Set();
	for (const label of value.split(',')) {
		const trimmedLabel = label.trim();
		if (trimmedLabel) {
			options.heapSnapshotLabels.add(trimmedLabel);
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
	const tmp = path.join(os.tmpdir(), 'vscode-chat-memory-smoke');
	console.log([
		'Usage: node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts [options]',
		'',
		'Launches Code - OSS, opens Chat with Playwright, runs a small chat scenario, and writes renderer heap snapshots plus summary.json.',
		'',
		'Options:',
		'  --workspace <path>              Workspace to open. Default: repo root',
		'  --output <path>                 Output folder. Default: .build/chat-memory-smoke/<timestamp>',
		'  --port <number>                 Remote debugging port. Default: 9224',
		'  --iterations <number>           Chat send iterations. Default: 3',
		'  --message <text>                Prompt template. Use {iteration} for the loop number',
		'  --skip-send                     Type prompts but do not press Enter',
		'  --no-heap-snapshots             Only record small heap-size metrics',
		'  --heap-snapshot-label <label>   Only snapshot matching sample labels. Repeatable or comma-separated',
		'  --reuse                         Attach to an already-running --enable-smoke-test-driver window',
		'  --skip-prelaunch                Set VSCODE_SKIP_PRELAUNCH=1 for the launched Code process',
		'  --temporary-user-data           Use an output-local clean user-data-dir and delete it when the run completes',
		'  --seed-user-data-dir <path>     Copy a logged-in profile into a fresh target user-data-dir before launch',
		'  --keep-user-data                Preserve the generated temporary user-data-dir',
		'  --keep-open                     Leave launched Code open',
		'  --runtime-arg <arg>             Forward one extra argument to scripts/code.sh. Repeatable',
		'',
		'Example:',
		`  node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --iterations 5 --output ${tmp}`,
		'',
		'Watch/login/retry example:',
		'  node .github/skills/auto-perf-optimize/scripts/chat-memory-smoke.mts --keep-open --iterations 1 --no-heap-snapshots',
	].join('\n'));
}
