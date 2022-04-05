/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import { IDriver, IDisposable, IElement, Thenable, ILocalizedStrings, ILocaleInfo } from './driver';
import { launch as launchElectron } from './electron';
import { launch as launchPlaywrightBrowser } from './playwrightBrowser';
import { launch as launchPlaywrightElectron } from './playwrightElectron';
import { Logger, measureAndLog } from './logger';
import { copyExtension } from './extensions';
import * as treekill from 'tree-kill';

const rootPath = join(__dirname, '../../..');

export interface LaunchOptions {
	codePath?: string;
	readonly workspacePath: string;
	userDataDir: string;
	readonly extensionsPath: string;
	readonly logger: Logger;
	readonly logsPath: string;
	readonly verbose?: boolean;
	readonly extraArgs?: string[];
	readonly remote?: boolean;
	readonly web?: boolean;
	readonly legacy?: boolean;
	readonly tracing?: boolean;
	readonly headless?: boolean;
	readonly browser?: 'chromium' | 'webkit' | 'firefox';
}

interface ICodeInstance {
	kill: () => Promise<void>;
}

const instances = new Set<ICodeInstance>();

function registerInstance(process: cp.ChildProcess, logger: Logger, type: string, kill: () => Promise<void>) {
	const instance = { kill };
	instances.add(instance);

	process.stdout?.on('data', data => logger.log(`[${type}] stdout: ${data}`));
	process.stderr?.on('data', error => logger.log(`[${type}] stderr: ${error}`));

	process.once('exit', (code, signal) => {
		logger.log(`[${type}] Process terminated (pid: ${process.pid}, code: ${code}, signal: ${signal})`);

		instances.delete(instance);
	});
}

async function teardown(signal?: number) {
	stopped = true;

	for (const instance of instances) {
		await instance.kill();
	}

	if (typeof signal === 'number') {
		process.exit(signal);
	}
}

let stopped = false;
process.on('exit', () => teardown());
process.on('SIGINT', () => teardown(128 + 2)); 	 // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
process.on('SIGTERM', () => teardown(128 + 15)); // same as above

export async function launch(options: LaunchOptions): Promise<Code> {
	if (stopped) {
		throw new Error('Smoke test process has terminated, refusing to spawn Code');
	}

	await measureAndLog(copyExtension(rootPath, options.extensionsPath, 'vscode-notebook-tests'), 'copyExtension(vscode-notebook-tests)', options.logger);

	// Browser smoke tests
	if (options.web) {
		const { serverProcess, client, driver, kill } = await measureAndLog(launchPlaywrightBrowser(options), 'launch playwright (browser)', options.logger);
		registerInstance(serverProcess, options.logger, 'server', kill);

		return new Code(client, driver, options.logger);
	}

	// Electron smoke tests (playwright)
	else if (!options.legacy) {
		const { client, driver } = await measureAndLog(launchPlaywrightElectron(options), 'launch playwright (electron)', options.logger);

		return new Code(client, driver, options.logger);
	}

	// Electron smoke tests (legacy driver)
	else {
		const { electronProcess, client, driver, kill } = await measureAndLog(launchElectron(options), 'launch electron', options.logger);
		registerInstance(electronProcess, options.logger, 'electron', kill);

		return new Code(client, driver, options.logger);
	}
}

export class Code {

	private _activeWindowId: number | undefined = undefined;
	readonly driver: IDriver;

	constructor(
		private client: IDisposable,
		driver: IDriver,
		readonly logger: Logger
	) {
		this.driver = new Proxy(driver, {
			get(target, prop) {
				if (typeof prop === 'symbol') {
					throw new Error('Invalid usage');
				}

				const targetProp = (target as any)[prop];
				if (typeof targetProp !== 'function') {
					return targetProp;
				}

				return function (this: any, ...args: any[]) {
					logger.log(`${prop}`, ...args.filter(a => typeof a === 'string'));
					return targetProp.apply(this, args);
				};
			}
		});
	}

	async startTracing(name: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		return await this.driver.startTracing(windowId, name);
	}

	async stopTracing(name: string, persist: boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		return await this.driver.stopTracing(windowId, name, persist);
	}

	async waitForWindowIds(accept: (windowIds: number[]) => boolean): Promise<void> {
		await this.poll(() => this.driver.getWindowIds(), accept, `get window ids`);
	}

	async dispatchKeybinding(keybinding: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.driver.dispatchKeybinding(windowId, keybinding);
	}

	async exit(): Promise<void> {

		// Start the exit flow via driver
		const pid = await measureAndLog(this.driver.exitApplication(), 'driver.exitApplication()', this.logger);

		return measureAndLog(new Promise<void>((resolve, reject) => {
			let done = false;

			(async () => {
				let retries = 0;
				while (!done) {
					retries++;

					if (retries === 20) {
						this.logger.log('Smoke test exit call did not terminate process after 10s, forcefully exiting the application...');

						// no need to await since we're polling for the process to die anyways
						treekill(pid, err => {
							try {
								process.kill(pid, 0); // throws an exception if the process doesn't exist anymore
								this.logger.log('Failed to kill Electron process tree:', err?.message);
							} catch (error) {
								// Expected when process is gone
							}
						});
					}

					if (retries === 40) {
						done = true;
						reject(new Error('Smoke test exit call did not terminate process after 20s, giving up'));
					}

					try {
						process.kill(pid, 0); // throws an exception if the process doesn't exist anymore.
						await new Promise(resolve => setTimeout(resolve, 500));
					} catch (error) {
						done = true;
						resolve();
					}
				}
			})();
		}).finally(() => {
			this.dispose();
		}), 'Code#exit()', this.logger);
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean, retryCount?: number): Promise<string> {
		const windowId = await this.getActiveWindowId();
		accept = accept || (result => textContent !== undefined ? textContent === result : !!result);

		return await this.poll(
			() => this.driver.getElements(windowId, selector).then(els => els.length > 0 ? Promise.resolve(els[0].textContent) : Promise.reject(new Error('Element not found for textContent'))),
			s => accept!(typeof s === 'string' ? s : ''),
			`get text content '${selector}'`,
			retryCount
		);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number, retryCount: number = 200): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.click(windowId, selector, xoffset, yoffset), () => true, `click '${selector}'`, retryCount);
	}

	async waitForSetValue(selector: string, value: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.setValue(windowId, selector, value), () => true, `set value '${selector}'`);
	}

	async waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		const windowId = await this.getActiveWindowId();
		return await this.poll(() => this.driver.getElements(windowId, selector, recursive), accept, `get elements '${selector}'`);
	}

	async waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result, retryCount: number = 200): Promise<IElement> {
		const windowId = await this.getActiveWindowId();
		return await this.poll<IElement>(() => this.driver.getElements(windowId, selector).then(els => els[0]), accept, `get element '${selector}'`, retryCount);
	}

	async waitForActiveElement(selector: string, retryCount: number = 200): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.isActiveElement(windowId, selector), r => r, `is active element '${selector}'`, retryCount);
	}

	async waitForTitle(accept: (title: string) => boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.getTitle(windowId), accept, `get title`);
	}

	async waitForTypeInEditor(selector: string, text: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.typeInEditor(windowId, selector, text), () => true, `type in editor '${selector}'`);
	}

	async waitForTerminalBuffer(selector: string, accept: (result: string[]) => boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.getTerminalBuffer(windowId, selector), accept, `get terminal buffer '${selector}'`);
	}

	async writeInTerminal(selector: string, value: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.poll(() => this.driver.writeInTerminal(windowId, selector, value), () => true, `writeInTerminal '${selector}'`);
	}

	async getLocaleInfo(): Promise<ILocaleInfo> {
		const windowId = await this.getActiveWindowId();
		return this.driver.getLocaleInfo(windowId);
	}

	async getLocalizedStrings(): Promise<ILocalizedStrings> {
		const windowId = await this.getActiveWindowId();
		return this.driver.getLocalizedStrings(windowId);
	}

	private async getActiveWindowId(): Promise<number> {
		if (typeof this._activeWindowId !== 'number') {
			this.logger.log('getActiveWindowId(): begin');
			const windows = await this.driver.getWindowIds();
			this._activeWindowId = windows[0];
			this.logger.log(`getActiveWindowId(): end (windowId=${this._activeWindowId})`);
		}

		return this._activeWindowId;
	}

	dispose(): void {
		this.client.dispose();
	}

	private async poll<T>(
		fn: () => Thenable<T>,
		acceptFn: (result: T) => boolean,
		timeoutMessage: string,
		retryCount = 200,
		retryInterval = 100 // millis
	): Promise<T> {
		let trial = 1;
		let lastError: string = '';

		while (true) {
			if (trial > retryCount) {
				this.logger.log('Timeout!');
				this.logger.log(lastError);
				this.logger.log(`Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.`);

				throw new Error(`Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.`);
			}

			let result;
			try {
				result = await fn();
				if (acceptFn(result)) {
					return result;
				} else {
					lastError = 'Did not pass accept function';
				}
			} catch (e: any) {
				lastError = Array.isArray(e.stack) ? e.stack.join(os.EOL) : e.stack;
			}

			await new Promise(resolve => setTimeout(resolve, retryInterval));
			trial++;
		}
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
