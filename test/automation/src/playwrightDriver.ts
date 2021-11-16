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

function buildDriver(browser: playwright.Browser, context: playwright.BrowserContext, page: playwright.Page): IDriver {
	return new PlaywrightDriver(browser, context, page);
}

class PlaywrightDriver implements IDriver {
	_serviceBrand: undefined;
	page: playwright.Page;
	constructor(
		private readonly _browser: playwright.Browser,
		private readonly _context: playwright.BrowserContext,
		private readonly _page: playwright.Page
	) {
		this.page = _page;
	}

	async getWindowIds() { return [1]; }
	async capturePage() { return ''; }
	async reloadWindow(windowId: number) { }
	async exitApplication() {
		try {
			await this._context.tracing.stop({ path: join(logsPath, `playwright-trace-${traceCounter++}.zip`) });
		} catch (error) {
			console.warn(`Failed to stop playwright tracing.`); // do not fail the build when this fails
		}
		await this._browser.close();
		await teardown();

		return false;
	}
	async dispatchKeybinding(windowId: number, keybinding: string) {
		const chords = keybinding.split(' ');
		for (let i = 0; i < chords.length; i++) {
			const chord = chords[i];
			if (i > 0) {
				await timeout(100);
			}

			if (keybinding.startsWith('Alt') || keybinding.startsWith('Control')) {
				await this._page.keyboard.press(keybinding);
				return;
			}

			const keys = chord.split('+');
			const keysDown: string[] = [];
			for (let i = 0; i < keys.length; i++) {
				if (keys[i] in vscodeToPlaywrightKey) {
					keys[i] = vscodeToPlaywrightKey[keys[i]];
				}
				await this._page.keyboard.down(keys[i]);
				keysDown.push(keys[i]);
			}
			while (keysDown.length > 0) {
				await this._page.keyboard.up(keysDown.pop()!);
			}
		}

		await timeout(100);
	}
	async click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined) {
		const { x, y } = await this.getElementXY(windowId, selector, xoffset, yoffset);
		await this._page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
	}
	async doubleClick(windowId: number, selector: string) {
		await this.click(windowId, selector, 0, 0);
		await timeout(60);
		await this.click(windowId, selector, 0, 0);
		await timeout(100);
	}

	async setValue(windowId: number, selector: string, text: string) {
		return this._page.evaluate(([driver, selector, text]) => driver.setValue(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}
	async getTitle(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getTitle());
	}
	async isActiveElement(windowId: number, selector: string) {
		return this._page.evaluate(([driver, selector]) => driver.isActiveElement(selector), [await this._getDriverHandle(), selector] as const);
	}
	async getElements(windowId: number, selector: string, recursive: boolean = false) {
		return this._page.evaluate(([driver, selector, recursive]) => driver.getElements(selector, recursive), [await this._getDriverHandle(), selector, recursive] as const);
	}
	async getElementXY(windowId: number, selector: string, xoffset?: number, yoffset?: number) {
		return this._page.evaluate(([driver, selector, xoffset, yoffset]) => driver.getElementXY(selector, xoffset, yoffset), [await this._getDriverHandle(), selector, xoffset, yoffset] as const);
	}
	async typeInEditor(windowId: number, selector: string, text: string) {
		return this._page.evaluate(([driver, selector, text]) => driver.typeInEditor(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}
	async getTerminalBuffer(windowId: number, selector: string) {
		return this._page.evaluate(([driver, selector]) => driver.getTerminalBuffer(selector), [await this._getDriverHandle(), selector] as const);
	}
	async writeInTerminal(windowId: number, selector: string, text: string) {
		return this._page.evaluate(([driver, selector, text]) => driver.writeInTerminal(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}
	async getLocaleInfo(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getLocaleInfo());
	}
	async getLocalizedStrings(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getLocalizedStrings());
	}

	private async _evaluateWithDriver<T>(pageFunction: PageFunction<playwright.JSHandle<IWindowDriver>[], T>) {
		return this._page.evaluate(pageFunction, [await this._getDriverHandle()]);
	}

	// TODO: Cache
	private async _getDriverHandle(): Promise<playwright.JSHandle<IWindowDriver>> {
		return this._page.evaluateHandle('window.driver');
	}
}

function timeout(ms: number): Promise<void> {
	return new Promise<void>(r => setTimeout(r, ms));
}

let port = 9000;
let server: ChildProcess | undefined;
let endpoint: string | undefined;
let workspacePath: string | undefined;

export async function launch(userDataDir: string, _workspacePath: string, codeServerPath = process.env.VSCODE_REMOTE_SERVER_PATH, extPath: string, verbose: boolean): Promise<void> {
	workspacePath = _workspacePath;

	const agentFolder = userDataDir;
	await promisify(mkdir)(agentFolder);
	const env = {
		VSCODE_AGENT_FOLDER: agentFolder,
		VSCODE_REMOTE_SERVER_PATH: codeServerPath,
		...process.env
	};

	const args = ['--disable-telemetry', '--port', `${port++}`, '--browser', 'none', '--driver', 'web', '--extensions-dir', extPath];

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

	server = spawn(
		serverLocation,
		args,
		{ env }
	);

	if (verbose) {
		server.stderr?.on('data', error => console.log(`Server stderr: ${error}`));
		server.stdout?.on('data', data => console.log(`Server stdout: ${data}`));
	}

	process.on('exit', teardown);
	process.on('SIGINT', teardown);
	process.on('SIGTERM', teardown);

	endpoint = await waitForEndpoint();
}

async function teardown(): Promise<void> {
	if (server) {
		try {
			await new Promise<void>((c, e) => kill(server!.pid, err => err ? e(err) : c()));
		} catch {
			// noop
		}

		server = undefined;
	}
}

function waitForEndpoint(): Promise<string> {
	return new Promise<string>(r => {
		server!.stdout?.on('data', (d: Buffer) => {
			const matches = d.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				r(matches[1]);
			}
		});
	});
}

interface Options {
	readonly browser?: 'chromium' | 'webkit' | 'firefox';
	readonly headless?: boolean;
}

export async function connect(options: Options = {}): Promise<{ client: IDisposable, driver: IDriver }> {
	const browser = await playwright[options.browser ?? 'chromium'].launch({ headless: options.headless ?? false });
	const context = await browser.newContext();
	try {
		await context.tracing.start({ screenshots: true, snapshots: true });
	} catch (error) {
		console.warn(`Failed to start playwright tracing.`); // do not fail the build when this fails
	}
	const page = await context.newPage();
	await page.setViewportSize({ width, height });
	page.on('pageerror', async error => console.error(`Playwright ERROR: page error: ${error}`));
	page.on('crash', page => console.error('Playwright ERROR: page crash'));
	page.on('response', async response => {
		if (response.status() >= 400) {
			console.error(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
		}
	});
	const payloadParam = `[["enableProposedApi",""],["skipWelcome","true"]]`;
	await page.goto(`${endpoint}&folder=vscode-remote://localhost:9888${URI.file(workspacePath!).path}&payload=${payloadParam}`);

	return {
		client: {
			dispose: () => {
				browser.close();
				teardown();
			}
		},
		driver: buildDriver(browser, context, page)
	};
}
