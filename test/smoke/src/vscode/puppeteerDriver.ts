/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as puppeteer from 'puppeteer';
import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import { mkdir } from 'fs';
import { promisify } from 'util';

const width = 1200;
const height = 800;

const vscodeToPuppeteerKey = {
	cmd: 'Meta',
	ctrl: 'Control',
	shift: 'Shift',
	enter: 'Enter',
	escape: 'Escape',
	right: 'ArrowRight',
	up: 'ArrowUp',
	down: 'ArrowDown',
	left: 'ArrowLeft',
	home: 'Home'
};

function buildDriver(browser: puppeteer.Browser, page: puppeteer.Page): IDriver {
	const driver = {
		_serviceBrand: undefined,
		getWindowIds: () => {
			return Promise.resolve([1]);
		},
		capturePage: () => Promise.resolve(''),
		reloadWindow: (windowId) => Promise.resolve(),
		exitApplication: () => browser.close(),
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
					if (keys[i] in vscodeToPuppeteerKey) {
						keys[i] = vscodeToPuppeteerKey[keys[i]];
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
		setValue: async (windowId, selector, text) => page.evaluate(`window.driver.setValue('${selector}', '${text}')`),
		getTitle: (windowId) => page.evaluate(`window.driver.getTitle()`),
		isActiveElement: (windowId, selector) => page.evaluate(`window.driver.isActiveElement('${selector}')`),
		getElements: (windowId, selector, recursive) => page.evaluate(`window.driver.getElements('${selector}', ${recursive})`),
		getElementXY: (windowId, selector, xoffset?, yoffset?) => page.evaluate(`window.driver.getElementXY('${selector}', ${xoffset}, ${yoffset})`),
		typeInEditor: (windowId, selector, text) => page.evaluate(`window.driver.typeInEditor('${selector}', '${text}')`),
		getTerminalBuffer: (windowId, selector) => page.evaluate(`window.driver.getTerminalBuffer('${selector}')`),
		writeInTerminal: (windowId, selector, text) => page.evaluate(`window.driver.writeInTerminal('${selector}', '${text}')`)
	};
	return driver;
}

function timeout(ms: number): Promise<void> {
	return new Promise<void>(r => setTimeout(r, ms));
}

// function runInDriver(call: string, args: (string | boolean)[]): Promise<any> {}

let args: string[] | undefined;
let server: ChildProcess | undefined;
let endpoint: string | undefined;

export async function launch(_args: string[]): Promise<void> {
	args = _args;
	const webUserDataDir = args.filter(e => e.includes('--user-data-dir='))[0].replace('--user-data-dir=', '');
	await promisify(mkdir)(webUserDataDir);
	server = spawn(join(args[0], `resources/server/web.${process.platform === 'win32' ? 'bat' : 'sh'}`), ['--browser', 'none', '--driver', 'web', '--web-user-data-dir', webUserDataDir]);
	server.stderr.on('data', e => console.log('Server stderr: ' + e));
	server.stdout.on('data', e => console.log('Server stdout: ' + e));
	process.on('exit', teardown);
	process.on('SIGINT', teardown);
	endpoint = await waitForEndpoint();
}

function teardown(): void {
	if (server) {
		server.kill();
		server = undefined;
	}
}

function waitForEndpoint(): Promise<string> {
	return new Promise<string>(r => {
		server!.stdout.on('data', d => {
			const matches = d.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				r(matches[1]);
			}
		});
	});
}

export function connect(headless: boolean, outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }> {
	return new Promise(async (c) => {
		const browser = await puppeteer.launch({
			// Run in Edge dev on macOS
			// executablePath: '/Applications/Microsoft\ Edge\ Dev.app/Contents/MacOS/Microsoft\ Edge\ Dev',
			headless,
			slowMo: 80,
			args: [`--window-size=${width},${height}`]
		});
		const page = (await browser.pages())[0];
		await page.setViewport({ width, height });
		await page.goto(`${endpoint}&folder=${args![1]}`);
		const result = {
			client: { dispose: () => teardown },
			driver: buildDriver(browser, page)
		};
		c(result);
	});
}

/**
 * Thenable is a common denominator between ES6 promises, Q, jquery.Deferred, WinJS.Promise,
 * and others. This API makes no assumption about what promise library is being used which
 * enables reusing existing code without migrating to a specific promise implementation. Still,
 * we recommend the use of native promises which are available in this editor.
 */
export interface Thenable<T> {
	/**
	* Attaches callbacks for the resolution and/or rejection of the Promise.
	* @param onfulfilled The callback to execute when the Promise is resolved.
	* @param onrejected The callback to execute when the Promise is rejected.
	* @returns A Promise for the completion of which ever callback is executed.
	*/
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
	attributes: { [name: string]: string; };
	children: IElement[];
	top: number;
	left: number;
}

export interface IDriver {
	_serviceBrand: any;

	getWindowIds(): Promise<number[]>;
	capturePage(windowId: number): Promise<string>;
	reloadWindow(windowId: number): Promise<void>;
	exitApplication(): Promise<void>;
	dispatchKeybinding(windowId: number, keybinding: string): Promise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	doubleClick(windowId: number, selector: string): Promise<void>;
	setValue(windowId: number, selector: string, text: string): Promise<void>;
	getTitle(windowId: number): Promise<string>;
	isActiveElement(windowId: number, selector: string): Promise<boolean>;
	getElements(windowId: number, selector: string, recursive?: boolean): Promise<IElement[]>;
	getElementXY(selector: string, xoffset?: number, yoffset?: number): Promise<{ x: number; y: number; }>;
	typeInEditor(windowId: number, selector: string, text: string): Promise<void>;
	getTerminalBuffer(windowId: number, selector: string): Promise<string[]>;
	writeInTerminal(windowId: number, selector: string, text: string): Promise<void>;
}

export interface IDisposable {
	dispose(): void;
}
