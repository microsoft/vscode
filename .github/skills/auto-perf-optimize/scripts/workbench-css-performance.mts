/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Measures Modern UI style and layout cost across resize, tab, and part-toggle
 * workflows. Writes raw rounds, medians, and screenshots to an output folder.
 */

import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as timeout } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const options = parseArgs(process.argv.slice(2));
const phaseNames = ['resize', 'class-mutations', 'open-tabs', 'switch-tabs', 'close-tabs', 'toggle-parts'] as const;

interface SmokeTestDriver {
	whenWorkbenchRestored(): Promise<void>;
}

declare global {
	var driver: SmokeTestDriver | undefined;
}

type PhaseName = typeof phaseNames[number];

interface Options {
	help: boolean;
	verbose: boolean;
	skipPrelaunch: boolean;
	keepOpen: boolean;
	port: number;
	rounds: number;
	warmupRounds: number;
	tabCount: number;
	tabsPerRound: number;
	resizesPerRound: number;
	switchesPerRound: number;
	partTogglesPerRound: number;
	classMutationsPerRound: number;
	outputDir: string;
	workspace: string;
	codeRoot: string;
}

interface MetricSnapshot {
	[name: string]: number;
}

interface PhaseResult {
	round: number;
	phase: PhaseName;
	wallTimeMs: number;
	recalcStyleDurationMs: number;
	layoutDurationMs: number;
	scriptDurationMs: number;
	taskDurationMs: number;
	recalcStyleCount: number;
	layoutCount: number;
	tabCountBefore: number;
	tabCountAfter: number;
}

interface Summary {
	createdAt: string;
	error?: string;
	options: Omit<Options, 'help' | 'verbose' | 'keepOpen'>;
	state: {
		modernUIEnabled: boolean;
		nodeCount: number;
		initialTabCount: number;
		finalTabCount?: number;
		classMutationTargetCount: number;
		sourceRevision: string;
	};
	results: PhaseResult[];
	aggregate?: Record<PhaseName, Omit<PhaseResult, 'round' | 'phase' | 'tabCountBefore' | 'tabCountAfter'>>;
}

interface LaunchedCode {
	child: ChildProcess;
	failedBeforeConnect: Promise<Error>;
	markConnected(): void;
	terminate(): Promise<void>;
}

if (options.help) {
	printHelp();
	process.exit(0);
}

await main();

async function main(): Promise<void> {
	const outputDir = path.resolve(options.outputDir);
	const workspace = path.resolve(options.workspace);
	const userDataDir = path.join(os.tmpdir(), `vscode-css-perf-${process.pid}`);
	const extensionsDir = path.join(os.tmpdir(), `vscode-css-perf-ext-${process.pid}`);
	const summary: Summary = {
		createdAt: new Date().toISOString(),
		options: {
			skipPrelaunch: options.skipPrelaunch,
			port: options.port,
			rounds: options.rounds,
			warmupRounds: options.warmupRounds,
			tabCount: options.tabCount,
			tabsPerRound: options.tabsPerRound,
			resizesPerRound: options.resizesPerRound,
			switchesPerRound: options.switchesPerRound,
			partTogglesPerRound: options.partTogglesPerRound,
			classMutationsPerRound: options.classMutationsPerRound,
			outputDir,
			workspace,
			codeRoot: options.codeRoot,
		},
		state: {
			modernUIEnabled: false,
			nodeCount: 0,
			initialTabCount: 0,
			classMutationTargetCount: 0,
			sourceRevision: 'unavailable',
		},
		results: [],
	};

	let launchedCode: LaunchedCode | undefined;
	let browser: Browser | undefined;
	let session: CDPSession | undefined;
	let processExitError: Error | undefined;
	try {
		summary.state.sourceRevision = getSourceRevision();
		await transpileClient();
		if (!options.skipPrelaunch) {
			await prepareCode();
		}
		await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
		await rm(extensionsDir, { recursive: true, force: true, maxRetries: 3 });
		await mkdir(workspace, { recursive: true });
		await mkdir(path.join(userDataDir, 'User'), { recursive: true });
		await mkdir(extensionsDir, { recursive: true });
		await writeFile(path.join(userDataDir, 'User', 'settings.json'), JSON.stringify({
			'workbench.experimental.modernUI': true,
			'window.density.layout': 'default',
			'workbench.startupEditor': 'none',
			'workbench.editor.enablePreview': false,
			'workbench.editor.showTabs': 'multiple',
			'workbench.editor.wrapTabs': false,
			'workbench.editor.pinnedTabSizing': 'normal',
			'workbench.editor.tabActionLocation': 'right',
			'window.commandCenter': true,
		}, undefined, '\t'));

		if (await isCDPAvailable(options.port)) {
			throw new Error(`Port ${options.port} already exposes CDP.`);
		}

		launchedCode = launchCode(userDataDir, extensionsDir, workspace);
		browser = await connectToCode(options.port, launchedCode.failedBeforeConnect);
		launchedCode.markConnected();
		const page = await findWorkbenchPage(browser);
		session = await page.context().newCDPSession(page);
		await session.send('Performance.enable', { timeDomain: 'timeTicks' });
		await page.evaluate(() => globalThis.driver?.whenWorkbenchRestored());
		await waitForFrames(page, 4);

		const initialState = await page.evaluate(() => ({
			modernUIEnabled: document.querySelector('.monaco-workbench')?.classList.contains('modern-ui-tabs') === true,
			nodeCount: document.querySelectorAll('*').length,
			tabCount: document.querySelectorAll('.tabs-container .tab').length,
		}));
		if (!initialState.modernUIEnabled) {
			throw new Error('Modern UI did not activate from the benchmark profile.');
		}
		summary.state.modernUIEnabled = initialState.modernUIEnabled;
		summary.state.nodeCount = initialState.nodeCount;
		summary.state.initialTabCount = initialState.tabCount;

		await ensureTabCount(page, options.tabCount);
		summary.state.classMutationTargetCount = await getClassMutationTargetCount(page);
		await page.screenshot({ path: path.join(outputDir, '01-warmed-workbench.png') });

		for (let round = 1; round <= options.warmupRounds; round++) {
			await runRound(page, session, round, false, summary);
		}

		for (let round = 1; round <= options.rounds; round++) {
			await runRound(page, session, round, true, summary);
			await writeSummary(outputDir, summary);
		}

		summary.state.finalTabCount = await getTabCount(page);
		summary.aggregate = aggregateResults(summary.results);
		await page.screenshot({ path: path.join(outputDir, '02-final-workbench.png') });
		await writeSummary(outputDir, summary);
		printSummary(summary);
	} catch (error) {
		summary.error = error instanceof Error && error.stack ? error.stack : String(error);
		await writeSummary(outputDir, summary);
		throw error;
	} finally {
		if (browser && !options.keepOpen) {
			const browserSession = await settleWithin(browser.newBrowserCDPSession(), 2000);
			if (browserSession) {
				await settleWithin(browserSession.send('Browser.close'), 5000);
				await settleWithin(browserSession.detach(), 1000);
			}
		}
		await session?.detach().catch(() => undefined);
		await settleWithin(browser?.close() ?? Promise.resolve(), 2000);
		if (launchedCode && !options.keepOpen) {
			if (!await waitForChildExit(launchedCode.child, 10000)) {
				await launchedCode.terminate();
				if (!await waitForChildExit(launchedCode.child, 5000)) {
					processExitError = new Error(`Code process tree did not exit after termination. pid=${launchedCode.child.pid}`);
				}
			}
		}
		if (!options.keepOpen) {
			await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
			await rm(extensionsDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
		}
	}
	if (processExitError) {
		summary.error = processExitError.stack ?? processExitError.message;
		await writeSummary(outputDir, summary);
		throw processExitError;
	}
}

async function runRound(page: Page, session: CDPSession, round: number, record: boolean, summary: Summary): Promise<void> {
	await ensureTabCount(page, options.tabCount);
	await measurePhase(page, session, round, 'resize', record, summary, () => resizeWindow(page, session));
	await measurePhase(page, session, round, 'class-mutations', record, summary, () => mutateUnreferencedClasses(page));
	await measurePhase(page, session, round, 'open-tabs', record, summary, () => openTabs(page, options.tabsPerRound));
	await measurePhase(page, session, round, 'switch-tabs', record, summary, () => switchTabs(page, options.switchesPerRound));
	await measurePhase(page, session, round, 'close-tabs', record, summary, () => closeTabs(page, options.tabsPerRound));
	await measurePhase(page, session, round, 'toggle-parts', record, summary, () => toggleWorkbenchParts(page, options.partTogglesPerRound));
}

async function measurePhase(
	page: Page,
	session: CDPSession,
	round: number,
	phase: PhaseName,
	record: boolean,
	summary: Summary,
	run: () => Promise<void>,
): Promise<void> {
	const tabCountBefore = await getTabCount(page);
	const metricsBefore = await getPerformanceMetrics(session);
	const started = performance.now();
	await run();
	await waitForFrames(page, 2);
	const wallTimeMs = performance.now() - started;
	const metricsAfter = await getPerformanceMetrics(session);
	const result: PhaseResult = {
		round,
		phase,
		wallTimeMs,
		recalcStyleDurationMs: metricDelta(metricsBefore, metricsAfter, 'RecalcStyleDuration') * 1000,
		layoutDurationMs: metricDelta(metricsBefore, metricsAfter, 'LayoutDuration') * 1000,
		scriptDurationMs: metricDelta(metricsBefore, metricsAfter, 'ScriptDuration') * 1000,
		taskDurationMs: metricDelta(metricsBefore, metricsAfter, 'TaskDuration') * 1000,
		recalcStyleCount: metricDelta(metricsBefore, metricsAfter, 'RecalcStyleCount'),
		layoutCount: metricDelta(metricsBefore, metricsAfter, 'LayoutCount'),
		tabCountBefore,
		tabCountAfter: await getTabCount(page),
	};
	if (record) {
		summary.results.push(result);
		console.log(formatResult(result));
	}
}

async function resizeWindow(page: Page, session: CDPSession): Promise<void> {
	const sizes = [
		{ width: 1120, height: 760 },
		{ width: 1540, height: 940 },
	];
	for (let index = 0; index < options.resizesPerRound; index++) {
		const size = sizes[index % sizes.length];
		await session.send('Emulation.setDeviceMetricsOverride', {
			width: size.width,
			height: size.height,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await page.waitForFunction(expected => window.innerWidth === expected.width && window.innerHeight === expected.height, size);
		await waitForFrames(page, 1);
	}
}

async function openTabs(page: Page, count: number): Promise<void> {
	const initialCount = await getTabCount(page);
	for (let index = 1; index <= count; index++) {
		await page.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
		await waitForTabCount(page, initialCount + index);
	}
}

async function mutateUnreferencedClasses(page: Page): Promise<void> {
	await page.evaluate(iterations => {
		const elements = Array.from(document.querySelectorAll<HTMLElement>('.codicon, .predefined-file-icon, .tab-label, .monaco-icon-label'));
		if (elements.length === 0) {
			throw new Error('No class mutation targets were found.');
		}
		for (let index = 0; index < iterations; index++) {
			const className = `css-performance-probe-${index % 2}`;
			for (const element of elements) {
				element.classList.add(className);
			}
			void document.body.offsetWidth;
			for (const element of elements) {
				element.classList.remove(className);
			}
			void document.body.offsetWidth;
		}
	}, options.classMutationsPerRound);
}

async function getClassMutationTargetCount(page: Page): Promise<number> {
	return page.locator('.codicon, .predefined-file-icon, .tab-label, .monaco-icon-label').count();
}

async function switchTabs(page: Page, count: number): Promise<void> {
	const tabs = page.locator('.tabs-container .tab');
	const tabCount = await tabs.count();
	if (tabCount < 2) {
		throw new Error(`Cannot switch tabs with only ${tabCount} tab(s).`);
	}
	for (let index = 0; index < count; index++) {
		await tabs.nth(index % tabCount).click();
		await page.waitForFunction(expectedIndex => {
			const candidates = Array.from(document.querySelectorAll('.tabs-container .tab'));
			return candidates[expectedIndex]?.classList.contains('active') === true;
		}, index % tabCount);
	}
}

async function closeTabs(page: Page, count: number): Promise<void> {
	const initialCount = await getTabCount(page);
	for (let index = 1; index <= count; index++) {
		await page.keyboard.press(process.platform === 'darwin' ? 'Meta+W' : 'Control+W');
		await waitForTabCount(page, initialCount - index);
	}
}

async function toggleWorkbenchParts(page: Page, count: number): Promise<void> {
	const initialState = await getWorkbenchVisibilityState(page);
	for (let index = 0; index < count; index++) {
		await toggleWorkbenchClass(page, process.platform === 'darwin' ? 'Meta+B' : 'Control+B', 'nosidebar');
		await toggleWorkbenchClass(page, process.platform === 'darwin' ? 'Meta+J' : 'Control+J', 'nopanel');
	}
	const finalState = await getWorkbenchVisibilityState(page);
	if (finalState.sideBarHidden !== initialState.sideBarHidden) {
		await toggleWorkbenchClass(page, process.platform === 'darwin' ? 'Meta+B' : 'Control+B', 'nosidebar');
	}
	if (finalState.panelHidden !== initialState.panelHidden) {
		await toggleWorkbenchClass(page, process.platform === 'darwin' ? 'Meta+J' : 'Control+J', 'nopanel');
	}
	const restoredState = await getWorkbenchVisibilityState(page);
	if (restoredState.sideBarHidden !== initialState.sideBarHidden || restoredState.panelHidden !== initialState.panelHidden) {
		throw new Error('Workbench parts did not return to their initial visibility state.');
	}
}

async function toggleWorkbenchClass(page: Page, keybinding: string, className: string): Promise<void> {
	const wasSet = await page.locator('.monaco-workbench').evaluate((workbench, expectedClass) => workbench.classList.contains(expectedClass), className);
	await page.keyboard.press(keybinding);
	await page.waitForFunction(({ expectedClass, expectedState }) => {
		const workbench = document.querySelector('.monaco-workbench');
		return workbench?.classList.contains(expectedClass) !== expectedState;
	}, { expectedClass: className, expectedState: wasSet });
	await waitForFrames(page, 1);
}

async function getWorkbenchVisibilityState(page: Page): Promise<{ sideBarHidden: boolean; panelHidden: boolean }> {
	return page.locator('.monaco-workbench').evaluate(workbench => ({
		sideBarHidden: workbench.classList.contains('nosidebar'),
		panelHidden: workbench.classList.contains('nopanel'),
	}));
}

async function ensureTabCount(page: Page, expected: number): Promise<void> {
	const current = await getTabCount(page);
	if (current < expected) {
		await openTabs(page, expected - current);
	} else if (current > expected) {
		await closeTabs(page, current - expected);
	}
}

async function getTabCount(page: Page): Promise<number> {
	return page.locator('.tabs-container .tab').count();
}

async function waitForTabCount(page: Page, count: number): Promise<void> {
	await page.waitForFunction(expected => document.querySelectorAll('.tabs-container .tab').length === expected, count);
	await waitForFrames(page, 1);
}

async function waitForFrames(page: Page, count: number): Promise<void> {
	await page.evaluate(async frameCount => {
		for (let index = 0; index < frameCount; index++) {
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		}
	}, count);
}

async function getPerformanceMetrics(session: CDPSession): Promise<MetricSnapshot> {
	const response = await session.send('Performance.getMetrics');
	return Object.fromEntries(response.metrics.map(metric => [metric.name, metric.value]));
}

function metricDelta(before: MetricSnapshot, after: MetricSnapshot, name: string): number {
	return (after[name] ?? 0) - (before[name] ?? 0);
}

function aggregateResults(results: PhaseResult[]): Summary['aggregate'] {
	return Object.fromEntries(phaseNames.map(phase => {
		const phaseResults = results.filter(result => result.phase === phase);
		return [phase, {
			wallTimeMs: median(phaseResults.map(result => result.wallTimeMs)),
			recalcStyleDurationMs: median(phaseResults.map(result => result.recalcStyleDurationMs)),
			layoutDurationMs: median(phaseResults.map(result => result.layoutDurationMs)),
			scriptDurationMs: median(phaseResults.map(result => result.scriptDurationMs)),
			taskDurationMs: median(phaseResults.map(result => result.taskDurationMs)),
			recalcStyleCount: median(phaseResults.map(result => result.recalcStyleCount)),
			layoutCount: median(phaseResults.map(result => result.layoutCount)),
		}];
	})) as Summary['aggregate'];
}

function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = values.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function formatResult(result: PhaseResult): string {
	return [
		`round=${result.round}`,
		`phase=${result.phase}`,
		`wall=${result.wallTimeMs.toFixed(1)}ms`,
		`style=${result.recalcStyleDurationMs.toFixed(2)}ms/${result.recalcStyleCount}`,
		`layout=${result.layoutDurationMs.toFixed(2)}ms/${result.layoutCount}`,
		`tabs=${result.tabCountBefore}->${result.tabCountAfter}`,
	].join(' ');
}

function printSummary(summary: Summary): void {
	console.log(`\nSummary: ${path.join(options.outputDir, 'summary.json')}`);
	for (const phase of phaseNames) {
		const result = summary.aggregate?.[phase];
		if (result) {
			console.log(`${phase.padEnd(14)} wall=${result.wallTimeMs.toFixed(1)}ms style=${result.recalcStyleDurationMs.toFixed(2)}ms layout=${result.layoutDurationMs.toFixed(2)}ms`);
		}
	}
}

async function writeSummary(outputDir: string, summary: Summary): Promise<void> {
	await mkdir(outputDir, { recursive: true });
	await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, undefined, '\t'));
}

function launchCode(userDataDir: string, extensionsDir: string, workspace: string): LaunchedCode {
	let failBeforeConnect: (error: Error) => void = () => undefined;
	let connected = false;
	let terminating = false;
	const failedBeforeConnect = new Promise<Error>(resolve => failBeforeConnect = resolve);
	const args = [
		'.',
		'--disable-extension=vscode.vscode-api-tests',
		'--enable-smoke-test-driver',
		'--disable-workspace-trust',
		`--remote-debugging-port=${options.port}`,
		`--user-data-dir=${userDataDir}`,
		`--extensions-dir=${extensionsDir}`,
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-updates',
		workspace,
	];
	const executable = resolveCodeExecutable();
	const child = spawn(executable, args, {
		cwd: options.codeRoot,
		env: {
			...process.env,
			NODE_ENV: 'development',
			VSCODE_DEV: '1',
			VSCODE_CLI: '1',
			ELECTRON_ENABLE_LOGGING: '1',
			ELECTRON_ENABLE_STACK_DUMPING: '1',
		},
		detached: options.keepOpen,
		stdio: options.verbose ? 'inherit' : 'ignore',
	});
	if (options.keepOpen) {
		child.unref();
	}

	child.once('error', error => failBeforeConnect(new Error(`Failed to launch Code from ${executable}: ${error.message}`)));
	child.once('exit', (code, signal) => {
		if (!connected && !terminating) {
			failBeforeConnect(new Error(`Code exited before CDP connected. code=${code} signal=${signal}`));
		}
	});
	return {
		child,
		failedBeforeConnect,
		markConnected: () => connected = true,
		terminate: async () => {
			terminating = true;
			await terminateProcessTree(child);
		},
	};
}

function transpileClient(): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'transpile-client'], {
			cwd: options.codeRoot,
			env: process.env,
			shell: process.platform === 'win32',
			stdio: 'inherit',
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Client transpile failed. code=${code} signal=${signal}`)));
	});
}

function prepareCode(): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(options.codeRoot, 'build', 'lib', 'preLaunch.ts')], {
			cwd: options.codeRoot,
			env: process.env,
			stdio: 'inherit',
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Code prelaunch failed. code=${code} signal=${signal}`)));
	});
}

function resolveCodeExecutable(): string {
	const product: Record<string, unknown> = JSON.parse(readFileSync(path.join(options.codeRoot, 'product.json'), 'utf8'));
	if (process.platform === 'darwin') {
		return path.join(options.codeRoot, '.build', 'electron', `${requiredProductString(product, 'nameLong')}.app`, 'Contents', 'MacOS', requiredProductString(product, 'nameShort'));
	}
	if (process.platform === 'win32') {
		return path.join(options.codeRoot, '.build', 'electron', `${requiredProductString(product, 'nameShort')}.exe`);
	}
	return path.join(options.codeRoot, '.build', 'electron', requiredProductString(product, 'applicationName'));
}

function requiredProductString(product: Record<string, unknown>, key: string): string {
	const value = product[key];
	if (typeof value !== 'string' || !value) {
		throw new Error(`product.json does not define ${key}.`);
	}
	return value;
}

function getSourceRevision(): string {
	const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.codeRoot, encoding: 'utf8' }).trim();
	const status = execFileSync('git', ['status', '--short', '--untracked-files=all'], { cwd: options.codeRoot, encoding: 'utf8' }).trim();
	if (!status) {
		return revision;
	}

	const hash = createHash('sha256');
	hash.update(status);
	hash.update(execFileSync('git', ['diff', '--binary', 'HEAD', '--'], { cwd: options.codeRoot, maxBuffer: 50 * 1024 * 1024 }));
	const untrackedFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: options.codeRoot })
		.toString('utf8')
		.split('\0')
		.filter(Boolean);
	for (const file of untrackedFiles) {
		const absolutePath = path.join(options.codeRoot, file);
		hash.update(file);
		const stat = lstatSync(absolutePath);
		if (stat.isSymbolicLink()) {
			hash.update(readlinkSync(absolutePath));
		} else if (stat.isFile()) {
			hash.update(readFileSync(absolutePath));
		}
	}
	return `${revision} (dirty:${hash.digest('hex').slice(0, 12)})`;
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
	return Promise.race([
		promise.catch(() => undefined),
		timeout(timeoutMs).then(() => undefined),
	]);
}

function terminateProcessTree(child: ChildProcess): Promise<void> {
	if (child.pid === undefined) {
		return Promise.resolve();
	}
	if (process.platform !== 'win32') {
		child.kill('SIGTERM');
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
		taskkill.once('error', reject);
		taskkill.once('exit', code => code === 0 ? resolve() : reject(new Error(`taskkill failed with exit code ${code}`)));
	});
}

async function connectToCode(port: number, launchFailure: Promise<Error>): Promise<Browser> {
	const endpoint = `http://127.0.0.1:${port}`;
	for (let index = 0; index < 120; index++) {
		try {
			await Promise.race([waitForCDPEndpoint(port), launchFailure.then(error => Promise.reject(error))]);
			return await chromium.connectOverCDP(endpoint);
		} catch {
			const launchError = await Promise.race([
				launchFailure,
				new Promise<undefined>(resolve => queueMicrotask(() => resolve(undefined))),
			]);
			if (launchError) {
				throw launchError;
			}
			await timeout(500);
		}
	}
	throw new Error(`Timed out waiting for CDP on ${endpoint}.`);
}

async function findWorkbenchPage(browser: Browser): Promise<Page> {
	for (let index = 0; index < 120; index++) {
		for (const page of browser.contexts().flatMap(context => context.pages())) {
			if (await page.evaluate(() => !!globalThis.driver?.whenWorkbenchRestored).catch(() => false)) {
				return page;
			}
		}
		await timeout(500);
	}
	throw new Error('Timed out waiting for the workbench page.');
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve(true);
	}
	return new Promise(resolve => {
		const timer = setTimeout(() => resolve(false), timeoutMs);
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
	await new Promise<void>((resolve, reject) => {
		const request = http.get(`http://127.0.0.1:${port}/json/version`, response => {
			response.resume();
			response.once('end', () => response.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${response.statusCode}`)));
		});
		request.setTimeout(1000, () => request.destroy(new Error('Request timed out')));
		request.once('error', reject);
	});
}

function parseArgs(args: string[]): Options {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const defaultOutputDir = path.join(root, '.build', 'css-performance', timestamp);
	const result: Options = {
		help: false,
		verbose: false,
		skipPrelaunch: false,
		keepOpen: false,
		port: 9231,
		rounds: 7,
		warmupRounds: 3,
		tabCount: 12,
		tabsPerRound: 4,
		resizesPerRound: 10,
		switchesPerRound: 16,
		partTogglesPerRound: 4,
		classMutationsPerRound: 40,
		outputDir: defaultOutputDir,
		workspace: path.join(defaultOutputDir, 'workspace'),
		codeRoot: root,
	};
	let workspaceWasSet = false;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--help' || argument === '-h') {
			result.help = true;
		} else if (argument === '--verbose') {
			result.verbose = true;
		} else if (argument === '--skip-prelaunch') {
			result.skipPrelaunch = true;
		} else if (argument === '--keep-open') {
			result.keepOpen = true;
		} else if (argument === '--port') {
			result.port = readNumber(args, ++index, argument);
		} else if (argument === '--rounds') {
			result.rounds = readNumber(args, ++index, argument);
		} else if (argument === '--warmup-rounds') {
			result.warmupRounds = readNumber(args, ++index, argument);
		} else if (argument === '--output') {
			result.outputDir = path.resolve(readValue(args, ++index, argument));
		} else if (argument === '--workspace') {
			result.workspace = path.resolve(readValue(args, ++index, argument));
			workspaceWasSet = true;
		} else if (argument === '--code-root') {
			result.codeRoot = path.resolve(readValue(args, ++index, argument));
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}
	if (result.rounds < 1 || result.warmupRounds < 0) {
		throw new Error('Rounds must be positive and warmup rounds cannot be negative.');
	}
	if (!workspaceWasSet) {
		result.workspace = path.join(result.outputDir, 'workspace');
	}
	return result;
}

function readNumber(args: string[], index: number, option: string): number {
	const value = Number(readValue(args, index, option));
	if (!Number.isInteger(value)) {
		throw new Error(`${option} expects an integer.`);
	}
	return value;
}

function readValue(args: string[], index: number, option: string): string {
	const value = args[index];
	if (!value) {
		throw new Error(`${option} expects a value.`);
	}
	return value;
}

function printHelp(): void {
	console.log(`Usage: node workbench-css-performance.mts [options]

Options:
  --rounds <count>         Measured rounds (default: 7)
  --warmup-rounds <count>  Warmup rounds (default: 3)
  --port <port>            DevTools port (default: 9231)
  --output <path>          Artifact directory
  --workspace <path>       Throwaway workspace
  --code-root <path>       VS Code checkout to launch (default: current checkout)
  --skip-prelaunch         Skip Electron/extensions prelaunch preparation
  --keep-open              Leave the Code OSS window open
  --verbose                Stream Code OSS output`);
}
