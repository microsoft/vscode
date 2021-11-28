/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from 'playwright';
import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import { mkdir } from 'fs';
import { promisify } from 'util';
import { IDriver, IDisposable, IWindowDriver } from './driver';
import { URI } from 'vscode-uri';
import * as kill from 'tree-kill';
import { PageFunction } from 'playwright-core/types/structs';

const width = 1200;
const height = 800;

const root = join(__dirname, '..', '..', '..');
const logsPath = join(root, '.build', 'logs', 'smoke-tests-browser');

const vscodeToPlaywrightKey: { [key: string]: string } = {
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

let traceCounter = 1;

class PlaywrightDriver implements IDriver {

	_serviceBrand: undefined;

	constructor(
		private readonly server: ChildProcess,
		private readonly browser: playwright.Browser,
		private readonly context: playwright.BrowserContext,
		readonly page: playwright.Page
	) {
	}

	async getWindowIds() {
		return [1];
	}

	async capturePage() {
		return '';
	}

	async reloadWindow(windowId: number) {
		throw new Error('Unsupported');
	}

	async exitApplication() {
		try {
			await this.context.tracing.stop({ path: join(logsPath, `playwright-trace-${traceCounter++}.zip`) });
		} catch (error) {
			console.warn(`Failed to stop playwright tracing: ${error}`);
		}

		try {
			await this.browser.close();
		} catch (error) {
			console.warn(`Failed to close browser: ${error}`);
		}

		await teardown(this.server);

		return false;
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
				if (keys[i] in vscodeToPlaywrightKey) {
					keys[i] = vscodeToPlaywrightKey[keys[i]];
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

	async doubleClick(windowId: number, selector: string) {
		await this.click(windowId, selector, 0, 0);
		await this.timeout(60);
		await this.click(windowId, selector, 0, 0);
		await this.timeout(100);
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

	// TODO: Cache
	private async _getDriverHandle(): Promise<playwright.JSHandle<IWindowDriver>> {
		return this.page.evaluateHandle('window.driver');
	}
}

let port = 9000;

export interface PlaywrightOptions {
	readonly browser?: 'chromium' | 'webkit' | 'firefox';
	readonly headless?: boolean;
}

export async function launch(codeServerPath = process.env.VSCODE_REMOTE_SERVER_PATH, userDataDir: string, extensionsPath: string, workspacePath: string, verbose: boolean, options: PlaywrightOptions = {}): Promise<{ serverProcess: ChildProcess, client: IDisposable, driver: IDriver }> {

	// Launch server
	const { serverProcess, endpoint } = await launchServer(userDataDir, codeServerPath, extensionsPath, verbose);

	// Launch browser
	const { browser, context, page } = await launchBrowser(options, endpoint, workspacePath);

	return {
		serverProcess,
		client: {
			dispose: () => { /* there is no client to dispose for browser, teardown is triggered via exitApplication call */ }
		},
		driver: new PlaywrightDriver(serverProcess, browser, context, page)
	};
}

async function launchServer(userDataDir: string, codeServerPath: string | undefined, extensionsPath: string, verbose: boolean) {
	const agentFolder = userDataDir;
	await promisify(mkdir)(agentFolder);
	const env = {
		VSCODE_AGENT_FOLDER: agentFolder,
		VSCODE_REMOTE_SERVER_PATH: codeServerPath,
		...process.env
	};

	const args = ['--disable-telemetry', '--port', `${port++}`, '--browser', 'none', '--driver', 'web', '--extensions-dir', extensionsPath];

	let serverLocation: string | undefined;
	if (codeServerPath) {
		serverLocation = join(codeServerPath, `server.${process.platform === 'win32' ? 'cmd' : 'sh'}`);
		args.push(`--logsPath=${logsPath}`);

		if (verbose) {
			console.log(`Starting built server from '${serverLocation}'`);
			console.log(`Storing log files into '${logsPath}'`);
		}
	} else {
		serverLocation = join(root, `resources/server/web.${process.platform === 'win32' ? 'bat' : 'sh'}`);
		args.push('--logsPath', logsPath);

		if (verbose) {
			console.log(`Starting server out of sources from '${serverLocation}'`);
			console.log(`Storing log files into '${logsPath}'`);
		}
	}

	const serverProcess = spawn(
		serverLocation,
		args,
		{ env }
	);

	if (verbose) {
		console.info(`*** Started server for browser smoke tests (pid: ${serverProcess.pid})`);
		serverProcess.once('exit', (code, signal) => console.info(`*** Server for browser smoke tests terminated (pid: ${serverProcess.pid}, code: ${code}, signal: ${signal})`));

		serverProcess.stderr?.on('data', error => console.log(`Server stderr: ${error}`));
		serverProcess.stdout?.on('data', data => console.log(`Server stdout: ${data}`));
	}

	process.on('exit', () => teardown(serverProcess));
	process.on('SIGINT', () => teardown(serverProcess));
	process.on('SIGTERM', () => teardown(serverProcess));

	return {
		serverProcess,
		endpoint: await waitForEndpoint(serverProcess)
	};
}

async function launchBrowser(options: PlaywrightOptions, endpoint: string, workspacePath: string) {
	const browser = await playwright[options.browser ?? 'chromium'].launch({ headless: options.headless ?? false });
	const context = await browser.newContext();

	try {
		await context.tracing.start({ screenshots: true, snapshots: true });
	} catch (error) {
		console.warn(`Failed to start playwright tracing.`); // do not fail the build when this fails
	}

	const page = await context.newPage();
	await page.setViewportSize({ width, height });

	page.on('pageerror', async (error) => console.error(`Playwright ERROR: page error: ${error}`));
	page.on('crash', page => console.error('Playwright ERROR: page crash'));
	page.on('response', async (response) => {
		if (response.status() >= 400) {
			console.error(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
		}
	});

	const payloadParam = `[["enableProposedApi",""],["skipWelcome","true"]]`;
	await page.goto(`${endpoint}&folder=vscode-remote://localhost:9888${URI.file(workspacePath!).path}&payload=${payloadParam}`);

	return { browser, context, page };
}

async function teardown(server: ChildProcess): Promise<void> {
	let retries = 0;
	while (retries < 3) {
		retries++;

		try {
			if (typeof server.pid === 'number') {
				await promisify(kill)(server.pid);
			}

			return;
		} catch (error) {
			console.warn(`Error tearing down server: ${error} (attempt: ${retries})`);
		}
	}

	console.error(`Gave up tearing down server after ${retries} attempts...`);
}

function waitForEndpoint(server: ChildProcess): Promise<string> {
	return new Promise<string>(resolve => {
		server.stdout?.on('data', (d: Buffer) => {
			const matches = d.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				resolve(matches[1]);
			}
		});
	});
}
