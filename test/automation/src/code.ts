/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as os from 'os';
import * as treekill from 'tree-kill';
import { IElement, ILocaleInfo, ILocalizedStrings, ILogFile } from './driver';
import { Logger, measureAndLog } from './logger';
import { launch as launchPlaywrightBrowser } from './playwrightBrowser';
import { PlaywrightDriver } from './playwrightDriver';
import { launch as launchPlaywrightElectron } from './playwrightElectron';
import { teardown } from './processes';

export interface LaunchOptions {
	codePath?: string;
	readonly workspacePath: string;
	userDataDir: string;
	readonly extensionsPath: string;
	readonly logger: Logger;
	logsPath: string;
	crashesPath: string;
	readonly verbose?: boolean;
	readonly extraArgs?: string[];
	readonly remote?: boolean;
	readonly web?: boolean;
	readonly tracing?: boolean;
	readonly headless?: boolean;
	readonly browser?: 'chromium' | 'webkit' | 'firefox';
}

interface ICodeInstance {
	kill: () => Promise<void>;
}

const instances = new Set<ICodeInstance>();

function registerInstance(process: cp.ChildProcess, logger: Logger, type: string) {
	const instance = { kill: () => teardown(process, logger) };
	instances.add(instance);

	process.stdout?.on('data', data => logger.log(`[${type}] stdout: ${data}`));
	process.stderr?.on('data', error => logger.log(`[${type}] stderr: ${error}`));

	process.once('exit', (code, signal) => {
		logger.log(`[${type}] Process terminated (pid: ${process.pid}, code: ${code}, signal: ${signal})`);

		instances.delete(instance);
	});
}

async function teardownAll(signal?: number) {
	stopped = true;

	for (const instance of instances) {
		await instance.kill();
	}

	if (typeof signal === 'number') {
		process.exit(signal);
	}
}

let stopped = false;
process.on('exit', () => teardownAll());
process.on('SIGINT', () => teardownAll(128 + 2)); 	 // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
process.on('SIGTERM', () => teardownAll(128 + 15)); // same as above

export async function launch(options: LaunchOptions): Promise<Code> {
	if (stopped) {
		throw new Error('Smoke test process has terminated, refusing to spawn Code');
	}

	// Browser smoke tests
	if (options.web) {
		const { serverProcess, driver } = await measureAndLog(() => launchPlaywrightBrowser(options), 'launch playwright (browser)', options.logger);
		registerInstance(serverProcess, options.logger, 'server');

		return new Code(driver, options.logger, serverProcess);
	}

	// Electron smoke tests (playwright)
	else {
		const { electronProcess, driver } = await measureAndLog(() => launchPlaywrightElectron(options), 'launch playwright (electron)', options.logger);
		registerInstance(electronProcess, options.logger, 'electron');

		return new Code(driver, options.logger, electronProcess);
	}
}

export class Code {

	readonly driver: PlaywrightDriver;

	constructor(
		driver: PlaywrightDriver,
		readonly logger: Logger,
		private readonly mainProcess: cp.ChildProcess
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
		return await this.driver.startTracing(name);
	}

	async stopTracing(name: string, persist: boolean): Promise<void> {
		return await this.driver.stopTracing(name, persist);
	}

	async dispatchKeybinding(keybinding: string): Promise<void> {
		await this.driver.dispatchKeybinding(keybinding);
	}

	async didFinishLoad(): Promise<void> {
		return this.driver.didFinishLoad();
	}

	async exit(): Promise<void> {
		return measureAndLog(() => new Promise<void>(resolve => {
			const pid = this.mainProcess.pid!;

			let done = false;

			// Start the exit flow via driver
			this.driver.exitApplication();

			// Await the exit of the application
			(async () => {
				let retries = 0;
				while (!done) {
					retries++;

					switch (retries) {

						// after 5 / 10 seconds: try to exit gracefully again
						case 10:
						case 20: {
							this.logger.log('Smoke test exit call did not terminate process after 5-10s, gracefully trying to exit the application again...');
							this.driver.exitApplication();
							break;
						}

						// after 20 seconds: forcefully kill
						case 40: {
							this.logger.log('Smoke test exit call did not terminate process after 20s, forcefully exiting the application...');

							// no need to await since we're polling for the process to die anyways
							treekill(pid, err => {
								try {
									process.kill(pid, 0); // throws an exception if the process doesn't exist anymore
									this.logger.log('Failed to kill Electron process tree:', err?.message);
								} catch (error) {
									// Expected when process is gone
								}
							});

							break;
						}

						// after 30 seconds: give up
						case 60: {
							done = true;
							this.logger.log('Smoke test exit call did not terminate process after 30s, giving up');
							resolve();
						}
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
		}), 'Code#exit()', this.logger);
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean, retryCount?: number): Promise<string> {
		accept = accept || (result => textContent !== undefined ? textContent === result : !!result);

		return await this.poll(
			() => this.driver.getElements(selector).then(els => els.length > 0 ? Promise.resolve(els[0].textContent) : Promise.reject(new Error('Element not found for textContent'))),
			s => accept!(typeof s === 'string' ? s : ''),
			`get text content '${selector}'`,
			retryCount
		);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number, retryCount: number = 200): Promise<void> {
		await this.poll(() => this.driver.click(selector, xoffset, yoffset), () => true, `click '${selector}'`, retryCount);
	}

	async waitForSetValue(selector: string, value: string): Promise<void> {
		await this.poll(() => this.driver.setValue(selector, value), () => true, `set value '${selector}'`);
	}

	async waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		return await this.poll(() => this.driver.getElements(selector, recursive), accept, `get elements '${selector}'`);
	}

	async waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result, retryCount: number = 200): Promise<IElement> {
		return await this.poll<IElement>(() => this.driver.getElements(selector).then(els => els[0]), accept, `get element '${selector}'`, retryCount);
	}

	async waitForActiveElement(selector: string, retryCount: number = 200): Promise<void> {
		await this.poll(() => this.driver.isActiveElement(selector), r => r, `is active element '${selector}'`, retryCount);
	}

	async waitForTitle(accept: (title: string) => boolean): Promise<void> {
		await this.poll(() => this.driver.getTitle(), accept, `get title`);
	}

	async waitForTypeInEditor(selector: string, text: string): Promise<void> {
		await this.poll(() => this.driver.typeInEditor(selector, text), () => true, `type in editor '${selector}'`);
	}

	async waitForTerminalBuffer(selector: string, accept: (result: string[]) => boolean): Promise<void> {
		await this.poll(() => this.driver.getTerminalBuffer(selector), accept, `get terminal buffer '${selector}'`);
	}

	async writeInTerminal(selector: string, value: string): Promise<void> {
		await this.poll(() => this.driver.writeInTerminal(selector, value), () => true, `writeInTerminal '${selector}'`);
	}

	getLocaleInfo(): Promise<ILocaleInfo> {
		return this.driver.getLocaleInfo();
	}

	getLocalizedStrings(): Promise<ILocalizedStrings> {
		return this.driver.getLocalizedStrings();
	}

	getLogs(): Promise<ILogFile[]> {
		return this.driver.getLogs();
	}

	private async poll<T>(
		fn: () => Promise<T>,
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
