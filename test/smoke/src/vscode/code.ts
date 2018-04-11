/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as cp from 'child_process';
import { tmpName } from 'tmp';
import { IDriver, connect as connectDriver, IDisposable, IElement } from './driver';

const repoPath = path.join(__dirname, '../../../..');

function getDevElectronPath(): string {
	const buildPath = path.join(repoPath, '.build');
	const product = require(path.join(repoPath, 'product.json'));

	switch (process.platform) {
		case 'darwin':
			return path.join(buildPath, 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', 'Electron');
		case 'linux':
			return path.join(buildPath, 'electron', `${product.applicationName}`);
		case 'win32':
			return path.join(buildPath, 'electron', `${product.nameShort}.exe`);
		default:
			throw new Error('Unsupported platform.');
	}
}

function getBuildElectronPath(root: string): string {
	switch (process.platform) {
		case 'darwin':
			return path.join(root, 'Contents', 'MacOS', 'Electron');
		case 'linux': {
			const product = require(path.join(root, 'resources', 'app', 'product.json'));
			return path.join(root, product.applicationName);
		}
		case 'win32': {
			const product = require(path.join(root, 'resources', 'app', 'product.json'));
			return path.join(root, `${product.nameShort}.exe`);
		}
		default:
			throw new Error('Unsupported platform.');
	}
}

function getDevOutPath(): string {
	return path.join(repoPath, 'out');
}

function getBuildOutPath(root: string): string {
	switch (process.platform) {
		case 'darwin':
			return path.join(root, 'Contents', 'Resources', 'app', 'out');
		default:
			return path.join(root, 'resources', 'app', 'out');
	}
}

async function connect(child: cp.ChildProcess, outPath: string, handlePath: string, verbose: boolean): Promise<Code> {
	let errCount = 0;

	while (true) {
		try {
			const { client, driver } = await connectDriver(outPath, handlePath);
			return new Code(child, client, driver, verbose);
		} catch (err) {
			if (++errCount > 50) {
				child.kill();
				throw err;
			}

			// retry
			await new Promise(c => setTimeout(c, 100));
		}
	}
}

// Kill all running instances, when dead
const instances = new Set<cp.ChildProcess>();
process.once('exit', () => instances.forEach(code => code.kill()));

export interface SpawnOptions {
	codePath?: string;
	workspacePath: string;
	userDataDir: string;
	extensionsPath: string;
	verbose: boolean;
	extraArgs?: string[];
}

export async function spawn(options: SpawnOptions): Promise<Code> {
	const codePath = options.codePath;
	const electronPath = codePath ? getBuildElectronPath(codePath) : getDevElectronPath();
	const outPath = codePath ? getBuildOutPath(codePath) : getDevOutPath();
	const handlePath = await new Promise<string>((c, e) => tmpName((err, handlePath) => err ? e(err) : c(handlePath)));

	const args = [
		options.workspacePath,
		'--skip-getting-started',
		'--skip-release-notes',
		'--sticky-quickopen',
		'--disable-telemetry',
		'--disable-updates',
		'--disable-crash-reporter',
		`--extensions-dir=${options.extensionsPath}`,
		`--user-data-dir=${options.userDataDir}`,
		'--driver', handlePath
	];

	if (!codePath) {
		args.unshift(repoPath);
	}

	if (options.extraArgs) {
		args.push(...options.extraArgs);
	}

	const spawnOptions: cp.SpawnOptions = {};

	if (options.verbose) {
		spawnOptions.stdio = 'inherit';
	}

	const child = cp.spawn(electronPath, args, spawnOptions);

	instances.add(child);
	child.once('exit', () => instances.delete(child));

	return connect(child, outPath, handlePath, options.verbose);
}

export class Code {

	private _activeWindowId: number | undefined = undefined;

	constructor(
		private process: cp.ChildProcess,
		private client: IDisposable,
		private driver: IDriver,
		private verbose: boolean
	) { }

	async dispatchKeybinding(keybinding: string): Promise<void> {
		if (this.verbose) {
			console.log('- dispatchKeybinding:', keybinding);
		}

		const windowId = await this.getActiveWindowId();
		await this.driver.dispatchKeybinding(windowId, keybinding);
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean): Promise<string> {
		if (this.verbose) {
			console.log('- waitForTextContent:', selector);
		}

		const windowId = await this.getActiveWindowId();
		accept = accept || (result => textContent !== void 0 ? textContent === result : !!result);
		return await this.waitFor(() => this.driver.getElements(windowId, selector).then(els => els[0].textContent), s => accept!(typeof s === 'string' ? s : ''), `getTextContent with selector ${selector}`);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number): Promise<void> {
		if (this.verbose) {
			console.log('- waitAndClick:', selector);
		}

		const windowId = await this.getActiveWindowId();

		// TODO should waitForClick
		await this.waitForElement(selector);
		await this.driver.click(windowId, selector, xoffset, yoffset);
	}

	async waitAndDoubleClick(selector: string): Promise<void> {
		if (this.verbose) {
			console.log('- waitAndDoubleClick:', selector);
		}

		const windowId = await this.getActiveWindowId();

		// TODO should waitForDoubleClick
		await this.waitForElement(selector);
		await this.driver.doubleClick(windowId, selector);
	}

	async waitAndMove(selector: string): Promise<void> {
		if (this.verbose) {
			console.log('- waitAndMove:', selector);
		}

		const windowId = await this.getActiveWindowId();
		// TODO should waitForMove
		await this.waitForElement(selector);
		await this.driver.move(windowId, selector);
	}

	// TODO should be waitForSetValue
	async setValue(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- setValue:', selector);
		}

		const windowId = await this.getActiveWindowId();
		// TODO should waitForSetValue
		await this.waitForElement(selector);
		await this.driver.setValue(windowId, selector, text);
	}

	// TODO merge with getElements
	async doesElementExist(selector: string): Promise<boolean> {
		if (this.verbose) {
			console.log('- doesElementExist:', selector);
		}

		const windowId = await this.getActiveWindowId();
		const elements = await this.driver.getElements(windowId, selector);
		return elements.length > 0;
	}

	// TODO merge with getElements
	async getElementCount(selector: string): Promise<number> {
		if (this.verbose) {
			console.log('- getElementCount:', selector);
		}

		const windowId = await this.getActiveWindowId();
		const elements = await this.driver.getElements(windowId, selector);
		return elements.length;
	}

	async waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		if (this.verbose) {
			console.log('- waitForElements:', selector);
		}

		const windowId = await this.getActiveWindowId();
		return await this.waitFor(() => this.driver.getElements(windowId, selector, recursive), accept, `elements with selector ${selector}`);
	}

	async waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result): Promise<IElement> {
		if (this.verbose) {
			console.log('- waitForElement:', selector);
		}

		const windowId = await this.getActiveWindowId();
		return await this.waitFor<IElement>(() => this.driver.getElements(windowId, selector).then(els => els[0]), accept, `element with selector ${selector}`);
	}

	async waitForActiveElement(selector: string): Promise<any> {
		if (this.verbose) {
			console.log('- waitForActiveElement:', selector);
		}

		const windowId = await this.getActiveWindowId();
		return await this.waitFor(() => this.driver.isActiveElement(windowId, selector), undefined, `wait for active element: ${selector}`);
	}

	// TODO make into waitForTitle
	async getTitle(): Promise<string> {
		if (this.verbose) {
			console.log('- getTitle');
		}

		const windowId = await this.getActiveWindowId();
		return await this.driver.getTitle(windowId);
	}

	// TODO make into waitForTypeInEditor
	async typeInEditor(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- typeInEditor', selector, text);
		}

		const windowId = await this.getActiveWindowId();
		await this.driver.typeInEditor(windowId, selector, text);
	}

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private readonly retryCount: number = 200;
	private readonly retryDuration = 100; // in milliseconds

	// TODO: clean function interface
	private async waitFor<T>(func: () => T | Promise<T | undefined>, accept?: (result: T) => boolean | Promise<boolean>, timeoutMessage?: string, retryCount?: number): Promise<T>;
	private async waitFor<T>(func: () => T | Promise<T>, accept: (result: T) => boolean | Promise<boolean> = result => !!result, timeoutMessage?: string, retryCount?: number): Promise<T> {
		let trial = 1;
		retryCount = typeof retryCount === 'number' ? retryCount : this.retryCount;

		while (true) {
			if (trial > retryCount) {
				throw new Error(`${timeoutMessage}: Timed out after ${(retryCount * this.retryDuration) / 1000} seconds.`);
			}

			let result;
			try {
				result = await func();
			} catch (e) {
				// console.warn(e);

				if (/Method not implemented/.test(e.message)) {
					throw e;
				}
			}

			if (accept(result)) {
				return result;
			}

			await new Promise(resolve => setTimeout(resolve, this.retryDuration));
			trial++;
		}
	}

	// TODO: replace with waitForWindows
	async getWindowIds(): Promise<number[]> {
		return await this.driver.getWindowIds();
	}

	private async getActiveWindowId(): Promise<number> {
		if (typeof this._activeWindowId !== 'number') {
			const windows = await this.driver.getWindowIds();
			this._activeWindowId = windows[0];
		}

		return this._activeWindowId;
	}

	dispose(): void {
		this.client.dispose();
		this.process.kill();
	}
}

export function findElement(element: IElement, fn: (element: IElement) => boolean): IElement | null {
	const queue = [element];

	while (queue.length > 0) {
		const element = queue.shift()!;

		if (fn(element)) {
			return element;
		}

		queue.push(...element.children);
	}

	return null;
}

export function findElements(element: IElement, fn: (element: IElement) => boolean): IElement[] {
	const result: IElement[] = [];
	const queue = [element];

	while (queue.length > 0) {
		const element = queue.shift()!;

		if (fn(element)) {
			result.push(element);
		}

		queue.push(...element.children);
	}

	return result;
}