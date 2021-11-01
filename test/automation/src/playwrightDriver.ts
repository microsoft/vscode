/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from 'playwright';
import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import { mkdir } from 'fs';
import { promisify } from 'util';
import { IDriver, IDisposable } from './driver';
import { URI } from 'vscode-uri';
import * as kill from 'tree-kill';

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
	const driver: IDriver = {
		_serviceBrand: undefined,
		getWindowIds: () => {
			return Promise.resolve([1]);
		},
		capturePage: () => Promise.resolve(''),
		reloadWindow: (windowId) => Promise.resolve(),
		exitApplication: async () => {
			try {
				await context.tracing.stop({ path: join(logsPath, `playwright-trace-${traceCounter++}.zip`) });
			} catch (error) {
				console.warn(`Failed to stop playwright tracing.`); // do not fail the build when this fails
			}
			await browser.close();
			await teardown();

			return false;
		},
		dispatchKeybinding: async (windowId, keybinding) => {
			const chords = keybinding.split(' ');
			for (let i = 0; i < chords.length; i++) {
				const chord = chords[i];
				if (i > 0) {
					await timeout(100);
				}
				const keys = chord.split('+');
				const keysDown: string[] = [];
				for (let i = 0; i < keys.length; i++) {
					if (keys[i] in vscodeToPlaywrightKey) {
						keys[i] = vscodeToPlaywrightKey[keys[i]];
					}
					await page.keyboard.down(keys[i]);
					keysDown.push(keys[i]);
				}
				while (keysDown.length > 0) {
					await page.keyboard.up(keysDown.pop()!);
				}
			}

			await timeout(100);
		},
		click: async (windowId, selector, xoffset, yoffset) => {
			const { x, y } = await driver.getElementXY(windowId, selector, xoffset, yoffset);
			await page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
		},
		doubleClick: async (windowId, selector) => {
			await driver.click(windowId, selector, 0, 0);
			await timeout(60);
			await driver.click(windowId, selector, 0, 0);
			await timeout(100);
		},
		setValue: async (windowId, selector, text) => page.evaluate(`window.driver.setValue('${selector}', '${text}')`).then(undefined),
		getTitle: (windowId) => page.evaluate(`window.driver.getTitle()`),
		isActiveElement: (windowId, selector) => page.evaluate(`window.driver.isActiveElement('${selector}')`),
		getElements: (windowId, selector, recursive) => page.evaluate(`window.driver.getElements('${selector}', ${recursive})`),
		getElementXY: (windowId, selector, xoffset?, yoffset?) => page.evaluate(`window.driver.getElementXY('${selector}', ${xoffset}, ${yoffset})`),
		typeInEditor: (windowId, selector, text) => page.evaluate(`window.driver.typeInEditor('${selector}', '${text}')`),
		getTerminalBuffer: (windowId, selector) => page.evaluate(`window.driver.getTerminalBuffer('${selector}')`),
		writeInTerminal: (windowId, selector, text) => page.evaluate(`window.driver.writeInTerminal('${selector}', '${text}')`),
		getLocaleInfo: (windowId) => page.evaluate(`window.driver.getLocaleInfo()`),
		getLocalizedStrings: (windowId) => page.evaluate(`window.driver.getLocalizedStrings()`)
	};
	return driver;
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
