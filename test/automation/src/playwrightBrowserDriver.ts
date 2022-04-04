/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import { mkdir } from 'fs';
import { promisify } from 'util';
import { IDriver, IDisposable, IWindowDriver } from './driver';
import { URI } from 'vscode-uri';
import * as kill from 'tree-kill';
import { PageFunction } from 'playwright-core/types/structs';
import { Logger, measureAndLog } from './logger';
import type { LaunchOptions } from './code';

export class PlaywrightDriver implements IDriver {

	private static traceCounter = 1;

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

	_serviceBrand: undefined;

	constructor(
		private readonly application: playwright.Browser | playwright.ElectronApplication,
		private readonly context: playwright.BrowserContext,
		readonly page: playwright.Page, // TODO@bpasero make private again
		private readonly serverPid: number | undefined,
		private readonly options: LaunchOptions
	) {
	}

	async getWindowIds() {
		return [1];
	}

	async capturePage() {
		return '';
	}

	async startTracing(windowId: number, name: string): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			await measureAndLog(this.context.tracing.startChunk({ title: name }), `startTracing for ${name}`, this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async stopTracing(windowId: number, name: string, persist: boolean): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			let persistPath: string | undefined = undefined;
			if (persist) {
				persistPath = join(this.options.logsPath, `playwright-trace-${PlaywrightDriver.traceCounter++}-${name.replace(/\s+/g, '-')}.zip`);
			}

			await measureAndLog(this.context.tracing.stopChunk({ path: persistPath }), `stopTracing for ${name}`, this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async reloadWindow(windowId: number) {
		await this.page.reload();
	}

	async exitApplication() {

		// Stop tracing
		try {
			if (this.options.tracing) {
				await measureAndLog(this.context.tracing.stop(), 'stop tracing', this.options.logger);
			}
		} catch (error) {
			// Ignore
		}

		// VSCode shutdown (desktop only)
		let mainPid: number | undefined = undefined;
		if (!this.options.web) {
			try {
				mainPid = await measureAndLog(this._evaluateWithDriver(([driver]) => (driver as unknown as IDriver).exitApplication()), 'driver.exitApplication()', this.options.logger);
			} catch (error) {
				this.options.logger.log(`Error exiting appliction (${error})`);
			}
		}

		// Playwright shutdown
		try {
			await measureAndLog(this.application.close(), 'playwright.close()', this.options.logger);
		} catch (error) {
			this.options.logger.log(`Error closing appliction (${error})`);
		}

		// Server shutdown
		if (typeof this.serverPid === 'number') {
			await measureAndLog(teardown(this.serverPid, this.options.logger), 'teardown server', this.options.logger);
		}

		return mainPid ?? this.serverPid! /* when running web we must have a server Pid */;
	}

	async dispatchKeybinding(windowId: number, keybinding: string) {
		const chords = keybinding.split(' ');
		for (let i = 0; i < chords.length; i++) {
			const chord = chords[i];
			if (i > 0) {
				await this.timeout(100);
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

		await this.timeout(100);
	}

	async click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined) {
		const { x, y } = await this.getElementXY(windowId, selector, xoffset, yoffset);
		await this.page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
	}

	async setValue(windowId: number, selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.setValue(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}

	async getTitle(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getTitle());
	}

	async isActiveElement(windowId: number, selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.isActiveElement(selector), [await this._getDriverHandle(), selector] as const);
	}

	async getElements(windowId: number, selector: string, recursive: boolean = false) {
		return this.page.evaluate(([driver, selector, recursive]) => driver.getElements(selector, recursive), [await this._getDriverHandle(), selector, recursive] as const);
	}

	async getElementXY(windowId: number, selector: string, xoffset?: number, yoffset?: number) {
		return this.page.evaluate(([driver, selector, xoffset, yoffset]) => driver.getElementXY(selector, xoffset, yoffset), [await this._getDriverHandle(), selector, xoffset, yoffset] as const);
	}

	async typeInEditor(windowId: number, selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.typeInEditor(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}

	async getTerminalBuffer(windowId: number, selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.getTerminalBuffer(selector), [await this._getDriverHandle(), selector] as const);
	}

	async writeInTerminal(windowId: number, selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.writeInTerminal(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}

	async getLocaleInfo(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getLocaleInfo());
	}

	async getLocalizedStrings(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getLocalizedStrings());
	}

	private async _evaluateWithDriver<T>(pageFunction: PageFunction<playwright.JSHandle<IWindowDriver>[], T>) {
		return this.page.evaluate(pageFunction, [await this._getDriverHandle()]);
	}

	private timeout(ms: number): Promise<void> {
		return new Promise<void>(resolve => setTimeout(resolve, ms));
	}

	private async _getDriverHandle(): Promise<playwright.JSHandle<IWindowDriver>> {
		return this.page.evaluateHandle('window.driver');
	}
}

const root = join(__dirname, '..', '..', '..');

let port = 9000;

export async function launch(options: LaunchOptions): Promise<{ serverProcess: ChildProcess; client: IDisposable; driver: IDriver; kill: () => Promise<void> }> {

	// Launch server
	const { serverProcess, endpoint } = await launchServer(options);

	// Launch browser
	const { browser, context, page } = await launchBrowser(options, endpoint);

	return {
		serverProcess,
		client: {
			dispose: () => { /* there is no client to dispose for browser, teardown is triggered via exitApplication call */ }
		},
		driver: new PlaywrightDriver(browser, context, page, serverProcess.pid, options),
		kill: () => teardown(serverProcess.pid, options.logger)
	};
}

async function launchServer(options: LaunchOptions) {
	const { userDataDir, codePath, extensionsPath, logger, logsPath } = options;
	const codeServerPath = codePath ?? process.env.VSCODE_REMOTE_SERVER_PATH;
	const agentFolder = userDataDir;
	await measureAndLog(promisify(mkdir)(agentFolder), `mkdir(${agentFolder})`, logger);
	const env = {
		VSCODE_REMOTE_SERVER_PATH: codeServerPath,
		...process.env
	};

	const args = ['--disable-telemetry', '--disable-workspace-trust', '--port', `${port++}`, '--driver', 'web', '--extensions-dir', extensionsPath, '--server-data-dir', agentFolder, '--accept-server-license-terms'];

	let serverLocation: string | undefined;
	if (codeServerPath) {
		const { serverApplicationName } = require(join(codeServerPath, 'product.json'));
		serverLocation = join(codeServerPath, 'bin', `${serverApplicationName}${process.platform === 'win32' ? '.cmd' : ''}`);

		logger.log(`Starting built server from '${serverLocation}'`);
	} else {
		serverLocation = join(root, `scripts/code-server.${process.platform === 'win32' ? 'bat' : 'sh'}`);

		logger.log(`Starting server out of sources from '${serverLocation}'`);
	}

	logger.log(`Storing log files into '${logsPath}'`);
	args.push('--logsPath', logsPath);

	logger.log(`Command line: '${serverLocation}' ${args.join(' ')}`);
	const serverProcess = spawn(
		serverLocation,
		args,
		{ env }
	);

	logger.log(`Started server for browser smoke tests (pid: ${serverProcess.pid})`);

	return {
		serverProcess,
		endpoint: await measureAndLog(waitForEndpoint(serverProcess, logger), 'waitForEndpoint(serverProcess)', logger)
	};
}

async function launchBrowser(options: LaunchOptions, endpoint: string) {
	const { logger, workspacePath, tracing, headless } = options;

	const browser = await measureAndLog(playwright[options.browser ?? 'chromium'].launch({ headless: headless ?? false }), 'playwright#launch', logger);
	browser.on('disconnected', () => logger.log(`Playwright: browser disconnected`));

	const context = await measureAndLog(browser.newContext(), 'browser.newContext', logger);

	if (tracing) {
		try {
			await measureAndLog(context.tracing.start({ screenshots: true, /* remaining options are off for perf reasons */ }), 'context.tracing.start()', logger);
		} catch (error) {
			logger.log(`Failed to start playwright tracing: ${error}`); // do not fail the build when this fails
		}
	}

	const page = await measureAndLog(context.newPage(), 'context.newPage()', logger);
	await measureAndLog(page.setViewportSize({ width: 1200, height: 800 }), 'page.setViewportSize', logger);

	page.on('pageerror', async (error) => logger.log(`Playwright ERROR: page error: ${error}`));
	page.on('crash', () => logger.log('Playwright ERROR: page crash'));
	page.on('close', () => logger.log('Playwright: page close'));
	page.on('response', async (response) => {
		if (response.status() >= 400) {
			logger.log(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
		}
	});

	const payloadParam = `[["enableProposedApi",""],["webviewExternalEndpointCommit","181b43c0e2949e36ecb623d8cc6de29d4fa2bae8"],["skipWelcome","true"]]`;
	await measureAndLog(page.goto(`${endpoint}&${workspacePath.endsWith('.code-workspace') ? 'workspace' : 'folder'}=${URI.file(workspacePath!).path}&payload=${payloadParam}`), 'page.goto()', logger);

	return { browser, context, page };
}

async function teardown(serverPid: number | undefined, logger: Logger): Promise<void> {
	if (typeof serverPid !== 'number') {
		return;
	}

	let retries = 0;
	while (retries < 3) {
		retries++;

		try {
			return await promisify(kill)(serverPid);
		} catch (error) {
			try {
				process.kill(serverPid, 0); // throws an exception if the process doesn't exist anymore
				logger.log(`Error tearing down server (pid: ${serverPid}, attempt: ${retries}): ${error}`);
			} catch (error) {
				return; // Expected when process is gone
			}
		}
	}

	logger.log(`Gave up tearing down server after ${retries} attempts...`);
}

function waitForEndpoint(server: ChildProcess, logger: Logger): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let endpointFound = false;

		server.stdout?.on('data', data => {
			if (!endpointFound) {
				logger.log(`[server] stdout: ${data}`); // log until endpoint found to diagnose issues
			}

			const matches = data.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				endpointFound = true;

				resolve(matches[1]);
			}
		});

		server.stderr?.on('data', error => {
			if (!endpointFound) {
				logger.log(`[server] stderr: ${error}`); // log until endpoint found to diagnose issues
			}

			if (error.toString().indexOf('EADDRINUSE') !== -1) {
				reject(new Error(error));
			}
		});
	});
}
