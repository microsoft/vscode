/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import type { Protocol } from 'playwright-core/types/protocol';
import { dirname, join } from 'path';
import { promises, readFileSync } from 'fs';
import { IWindowDriver } from './driver';
import { measureAndLog } from './logger';
import { LaunchOptions } from './code';
import { teardown } from './processes';
import { ChildProcess } from 'child_process';
import type { AxeResults, RunOptions } from 'axe-core';

// Load axe-core source for injection into pages (works with Electron)
let axeSource = '';
try {
	const axePath = require.resolve('axe-core/axe.min.js');
	axeSource = readFileSync(axePath, 'utf-8');
} catch {
	// axe-core may not be installed; keep axeSource empty to avoid failing module initialization
	axeSource = '';
}

type PageFunction<Arg, T> = (arg: Arg) => T | Promise<T>;

export interface AccessibilityScanOptions {
	/** Specific selector to scan. If not provided, scans the entire page. */
	selector?: string;
	/** WCAG tags to include (e.g., 'wcag2a', 'wcag2aa', 'wcag21aa'). Defaults to WCAG 2.1 AA. */
	tags?: string[];
	/** Rule IDs to disable for this scan. */
	disableRules?: string[];
	/**
	 * Patterns to exclude from specific rules. Keys are rule IDs, values are strings to match against element target or HTML.
	 *
	 * **IMPORTANT**: Adding exclusions here bypasses accessibility checks. Before adding an exclusion:
	 * 1. File an issue to track the accessibility problem
	 * 2. Ensure there's a plan to fix the underlying issue (e.g., hover/focus states that axe can't detect)
	 * 3. Get approval from @anthropics/accessibility team
	 */
	excludeRules?: { [ruleId: string]: string[] };
}

export class PlaywrightDriver {

	private static traceCounter = 1;
	private static screenShotCounter = 1;

	private static readonly vscodeToPlaywrightKey: { [key: string]: string } = {
		cmd: 'Meta',
		ctrl: 'Control',
		shift: 'Shift',
		enter: 'Enter',
		escape: 'Escape',
		right: 'ArrowRight',
		up: 'ArrowUp',
		down: 'ArrowDown',
		left: 'ArrowLeft',
		home: 'Home',
		esc: 'Escape'
	};

	constructor(
		private readonly application: playwright.Browser | playwright.ElectronApplication,
		private readonly context: playwright.BrowserContext,
		private readonly page: playwright.Page,
		private readonly serverProcess: ChildProcess | undefined,
		private readonly whenLoaded: Promise<unknown>,
		private readonly options: LaunchOptions
	) {
	}

	get browserContext(): playwright.BrowserContext {
		return this.context;
	}

	get currentPage(): playwright.Page {
		return this.page;
	}

	async startTracing(name?: string): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			await measureAndLog(() => this.context.tracing.startChunk({ title: name }), `startTracing${name ? ` for ${name}` : ''}`, this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async stopTracing(name?: string, persist: boolean = false): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			let persistPath: string | undefined = undefined;
			if (persist) {
				const nameSuffix = name ? `-${name.replace(/\s+/g, '-')}` : '';
				persistPath = join(this.options.logsPath, `playwright-trace-${PlaywrightDriver.traceCounter++}${nameSuffix}.zip`);
			}

			await measureAndLog(() => this.context.tracing.stopChunk({ path: persistPath }), `stopTracing${name ? ` for ${name}` : ''}`, this.options.logger);

			// To ensure we have a screenshot at the end where
			// it failed, also trigger one explicitly. Tracing
			// does not guarantee to give us a screenshot unless
			// some driver action ran before.
			if (persist) {
				await this.takeScreenshot(name);
			}
		} catch (error) {
			// Ignore
		}
	}

	async didFinishLoad(): Promise<void> {
		await this.whenLoaded;
	}

	private _cdpSession: playwright.CDPSession | undefined;

	async startCDP() {
		if (this._cdpSession) {
			return;
		}

		this._cdpSession = await this.page.context().newCDPSession(this.page);
	}

	async collectGarbage() {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		await this._cdpSession.send('HeapProfiler.collectGarbage');
	}

	async evaluate(options: Protocol.Runtime.evaluateParameters): Promise<Protocol.Runtime.evaluateReturnValue> {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		return await this._cdpSession.send('Runtime.evaluate', options);
	}

	async releaseObjectGroup(parameters: Protocol.Runtime.releaseObjectGroupParameters): Promise<void> {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		await this._cdpSession.send('Runtime.releaseObjectGroup', parameters);
	}

	async queryObjects(parameters: Protocol.Runtime.queryObjectsParameters): Promise<Protocol.Runtime.queryObjectsReturnValue> {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		return await this._cdpSession.send('Runtime.queryObjects', parameters);
	}

	async callFunctionOn(parameters: Protocol.Runtime.callFunctionOnParameters): Promise<Protocol.Runtime.callFunctionOnReturnValue> {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		return await this._cdpSession.send('Runtime.callFunctionOn', parameters);
	}

	async takeHeapSnapshot(): Promise<string> {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		let snapshot = '';
		const listener = (c: { chunk: string }) => {
			snapshot += c.chunk;
		};

		this._cdpSession.addListener('HeapProfiler.addHeapSnapshotChunk', listener);

		await this._cdpSession.send('HeapProfiler.takeHeapSnapshot');

		this._cdpSession.removeListener('HeapProfiler.addHeapSnapshotChunk', listener);
		return snapshot;
	}

	async getProperties(parameters: Protocol.Runtime.getPropertiesParameters): Promise<Protocol.Runtime.getPropertiesReturnValue> {
		if (!this._cdpSession) {
			throw new Error('CDP not started');
		}

		return await this._cdpSession.send('Runtime.getProperties', parameters);
	}

	private async takeScreenshot(name?: string): Promise<void> {
		try {
			const nameSuffix = name ? `-${name.replace(/\s+/g, '-')}` : '';
			const persistPath = join(this.options.logsPath, `playwright-screenshot-${PlaywrightDriver.screenShotCounter++}${nameSuffix}.png`);

			await measureAndLog(() => this.page.screenshot({ path: persistPath, type: 'png' }), 'takeScreenshot', this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async reload() {
		await this.page.reload();
	}

	async close() {

		// Stop tracing
		try {
			if (this.options.tracing) {
				await measureAndLog(() => this.context.tracing.stop(), 'stop tracing', this.options.logger);
			}
		} catch (error) {
			// Ignore
		}

		// Web: Extract client logs
		if (this.options.web) {
			try {
				await measureAndLog(() => this.saveWebClientLogs(), 'saveWebClientLogs()', this.options.logger);
			} catch (error) {
				this.options.logger.log(`Error saving web client logs (${error})`);
			}
		}

		//  exit via `close` method
		try {
			await measureAndLog(() => this.application.close(), 'playwright.close()', this.options.logger);
		} catch (error) {
			this.options.logger.log(`Error closing application (${error})`);
		}

		// Server: via `teardown`
		if (this.serverProcess) {
			await measureAndLog(() => teardown(this.serverProcess!, this.options.logger), 'teardown server process', this.options.logger);
		}
	}

	private async saveWebClientLogs(): Promise<void> {
		const logs = await this.getLogs();

		for (const log of logs) {
			const absoluteLogsPath = join(this.options.logsPath, log.relativePath);

			await promises.mkdir(dirname(absoluteLogsPath), { recursive: true });
			await promises.writeFile(absoluteLogsPath, log.contents);
		}
	}

	async sendKeybinding(keybinding: string, accept?: () => Promise<void> | void) {
		const chords = keybinding.split(' ');
		for (let i = 0; i < chords.length; i++) {
			const chord = chords[i];
			if (i > 0) {
				await this.wait(100);
			}

			if (keybinding.startsWith('Alt') || keybinding.startsWith('Control') || keybinding.startsWith('Backspace')) {
				await this.page.keyboard.press(keybinding);
				return;
			}

			const keys = chord.split('+');
			const keysDown: string[] = [];
			for (let i = 0; i < keys.length; i++) {
				if (keys[i] in PlaywrightDriver.vscodeToPlaywrightKey) {
					keys[i] = PlaywrightDriver.vscodeToPlaywrightKey[keys[i]];
				}
				await this.page.keyboard.down(keys[i]);
				keysDown.push(keys[i]);
			}
			while (keysDown.length > 0) {
				await this.page.keyboard.up(keysDown.pop()!);
			}
		}

		await accept?.();
	}

	async click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined) {
		const { x, y } = await this.getElementXY(selector, xoffset, yoffset);
		await this.page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
	}

	async setValue(selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.setValue(selector, text), [await this.getDriverHandle(), selector, text] as const);
	}

	async getTitle() {
		return this.page.title();
	}

	async isActiveElement(selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.isActiveElement(selector), [await this.getDriverHandle(), selector] as const);
	}

	async getElements(selector: string, recursive: boolean = false) {
		return this.page.evaluate(([driver, selector, recursive]) => driver.getElements(selector, recursive), [await this.getDriverHandle(), selector, recursive] as const);
	}

	async getElementXY(selector: string, xoffset?: number, yoffset?: number) {
		return this.page.evaluate(([driver, selector, xoffset, yoffset]) => driver.getElementXY(selector, xoffset, yoffset), [await this.getDriverHandle(), selector, xoffset, yoffset] as const);
	}

	async typeInEditor(selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.typeInEditor(selector, text), [await this.getDriverHandle(), selector, text] as const);
	}

	async getEditorSelection(selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.getEditorSelection(selector), [await this.getDriverHandle(), selector] as const);
	}

	async getTerminalBuffer(selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.getTerminalBuffer(selector), [await this.getDriverHandle(), selector] as const);
	}

	async writeInTerminal(selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.writeInTerminal(selector, text), [await this.getDriverHandle(), selector, text] as const);
	}

	async getLocaleInfo() {
		return this.evaluateWithDriver(([driver]) => driver.getLocaleInfo());
	}

	async getLocalizedStrings() {
		return this.evaluateWithDriver(([driver]) => driver.getLocalizedStrings());
	}

	async getLogs() {
		return this.page.evaluate(([driver]) => driver.getLogs(), [await this.getDriverHandle()] as const);
	}

	private async evaluateWithDriver<T>(pageFunction: PageFunction<IWindowDriver[], T>) {
		return this.page.evaluate(pageFunction, [await this.getDriverHandle()]);
	}

	wait(ms: number): Promise<void> {
		return wait(ms);
	}

	whenWorkbenchRestored(): Promise<void> {
		return this.evaluateWithDriver(([driver]) => driver.whenWorkbenchRestored());
	}

	private async getDriverHandle(): Promise<playwright.JSHandle<IWindowDriver>> {
		return this.page.evaluateHandle('window.driver');
	}

	async isAlive(): Promise<boolean> {
		try {
			await this.getDriverHandle();
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Run an accessibility scan on the current page using axe-core.
	 * Uses direct script injection to work with Electron.
	 * @param options Configuration options for the accessibility scan.
	 * @returns The axe-core scan results including any violations found.
	 */
	async runAccessibilityScan(options?: AccessibilityScanOptions): Promise<AxeResults> {
		// Inject axe-core into the page if not already present
		await this.page.evaluate(axeSource);

		// Build axe-core run options
		const runOptions: RunOptions = {
			runOnly: {
				type: 'tag',
				values: options?.tags ?? ['wcag2a', 'wcag2aa', 'wcag21aa']
			}
		};

		// Disable specific rules if requested
		if (options?.disableRules && options.disableRules.length > 0) {
			runOptions.rules = {};
			for (const ruleId of options.disableRules) {
				runOptions.rules[ruleId] = { enabled: false };
			}
		}

		// Build context for axe.run
		const context: { include?: string[]; exclude?: string[][] } = {};

		if (options?.selector) {
			context.include = [options.selector];
		}

		// Exclude known problematic areas
		context.exclude = [
			['.monaco-editor .view-lines'],
			['.xterm-screen canvas']
		];

		// Run axe-core analysis
		const results = await measureAndLog(
			() => this.page.evaluate(
				([ctx, opts]) => {
					// @ts-expect-error axe is injected globally
					return window.axe.run(ctx, opts);
				},
				[context, runOptions] as const
			),
			'runAccessibilityScan',
			this.options.logger
		);

		return results as AxeResults;
	}

	/**
	 * Run an accessibility scan and throw an error if any violations are found.
	 * @param options Configuration options for the accessibility scan.
	 * @throws Error if accessibility violations are detected.
	 */
	async assertNoAccessibilityViolations(options?: AccessibilityScanOptions): Promise<void> {
		const results = await this.runAccessibilityScan(options);

		// Filter out violations for specific elements based on excludeRules
		let filteredViolations = results.violations;
		if (options?.excludeRules) {
			filteredViolations = results.violations.map((violation: AxeResults['violations'][number]) => {
				const excludePatterns = options.excludeRules![violation.id];
				if (!excludePatterns) {
					return violation;
				}
				// Filter out nodes that match any of the exclude patterns
				const filteredNodes = violation.nodes.filter((node: AxeResults['violations'][number]['nodes'][number]) => {
					const target = node.target.join(' ');
					const html = node.html || '';
					// Check if any exclude pattern appears in target or HTML
					return !excludePatterns.some(pattern => target.includes(pattern) || html.includes(pattern));
				});
				return { ...violation, nodes: filteredNodes };
			}).filter((violation: AxeResults['violations'][number]) => violation.nodes.length > 0);
		}

		if (filteredViolations.length > 0) {
			const violationMessages = filteredViolations.map((violation: AxeResults['violations'][number]) => {
				const nodes = violation.nodes.map((node: AxeResults['violations'][number]['nodes'][number]) => {
					const target = node.target.join(' > ');
					const html = node.html || 'N/A';
					// Extract class from HTML for easier identification
					const classMatch = html.match(/class="([^"]+)"/);
					const className = classMatch ? classMatch[1] : 'no class';
					return [
						`  Element: ${target}`,
						`    Class: ${className}`,
						`    HTML: ${html}`,
						`    Issue: ${node.failureSummary}`
					].join('\n');
				}).join('\n\n');
				return [
					`[${violation.id}] ${violation.help} (${violation.impact})`,
					`  Help URL: ${violation.helpUrl}`,
					nodes
				].join('\n');
			}).join('\n\n---\n\n');

			throw new Error(
				`Accessibility violations found:\n\n${violationMessages}\n\n` +
				`Total: ${filteredViolations.length} violation(s) affecting ${filteredViolations.reduce((sum: number, v: AxeResults['violations'][number]) => sum + v.nodes.length, 0)} element(s)`
			);
		}
	}
}

export function wait(ms: number): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export type { AxeResults };
