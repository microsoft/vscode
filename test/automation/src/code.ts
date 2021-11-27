/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import { IDriver, IDisposable, IElement, Thenable, ILocalizedStrings, ILocaleInfo } from './driver';
import { connect as connectElectronDriver, createDriverHandle, getBuildElectronPath, getBuildOutPath, getDevElectronPath, getDevOutPath } from './electronDriver';
import { launch as launchPlaywright } from './playwrightDriver';
import { Logger } from './logger';
import { ncp } from 'ncp';
import { URI } from 'vscode-uri';
import * as kill from 'tree-kill';
import { promisify } from 'util';

const repoPath = path.join(__dirname, '../../..');

export interface SpawnOptions {
	codePath?: string;
	workspacePath: string;
	userDataDir: string;
	extensionsPath: string;
	logger: Logger;
	verbose?: boolean;
	extraArgs?: string[];
	log?: string;
	remote?: boolean;
	web?: boolean;
	headless?: boolean;
	browser?: 'chromium' | 'webkit' | 'firefox';
}

export async function spawn(options: SpawnOptions): Promise<Code> {

	await copyExtension(options.extensionsPath, 'vscode-notebook-tests');

	// Browser smoke tests
	if (options.web) {
		return spawnBrowser(options);
	}

	// Electron smoke tests
	return spawnElectron(options);
}

async function spawnBrowser(options: SpawnOptions): Promise<Code> {
	const { serverProcess, client, driver } = await launchPlaywright(options.workspacePath, options.userDataDir, options.codePath, options.extensionsPath, Boolean(options.verbose), options);

	return new Code(client, driver, options.logger, serverProcess.pid);
}

async function spawnElectron(options: SpawnOptions): Promise<Code> {
	const env = { ...process.env };
	const codePath = options.codePath;
	const logsPath = path.join(repoPath, '.build', 'logs', options.remote ? 'smoke-tests-remote' : 'smoke-tests');
	const outPath = codePath ? getBuildOutPath(codePath) : getDevOutPath();

	const driverIPCHandle = await createDriverHandle();

	const args = [
		options.workspacePath,
		'--skip-release-notes',
		'--skip-welcome',
		'--disable-telemetry',
		'--no-cached-data',
		'--disable-updates',
		'--disable-keytar',
		'--disable-crash-reporter',
		'--disable-workspace-trust',
		`--extensions-dir=${options.extensionsPath}`,
		`--user-data-dir=${options.userDataDir}`,
		`--logsPath=${logsPath}`,
		'--driver', driverIPCHandle
	];

	if (process.platform === 'linux') {
		args.push('--disable-gpu'); // Linux has trouble in VMs to render properly with GPU enabled
	}

	if (options.remote) {
		// Replace workspace path with URI
		args[0] = `--${options.workspacePath.endsWith('.code-workspace') ? 'file' : 'folder'}-uri=vscode-remote://test+test/${URI.file(options.workspacePath).path}`;

		if (codePath) {
			// running against a build: copy the test resolver extension
			await copyExtension(options.extensionsPath, 'vscode-test-resolver');
		}
		args.push('--enable-proposed-api=vscode.vscode-test-resolver');
		const remoteDataDir = `${options.userDataDir}-server`;
		mkdirp.sync(remoteDataDir);

		if (codePath) {
			// running against a build: copy the test resolver extension into remote extensions dir
			const remoteExtensionsDir = path.join(remoteDataDir, 'extensions');
			mkdirp.sync(remoteExtensionsDir);
			await copyExtension(remoteExtensionsDir, 'vscode-notebook-tests');
		}

		env['TESTRESOLVER_DATA_FOLDER'] = remoteDataDir;
		env['TESTRESOLVER_LOGS_FOLDER'] = path.join(logsPath, 'server');
	}

	const spawnOptions: cp.SpawnOptions = { env };

	args.push('--enable-proposed-api=vscode.vscode-notebook-tests');

	if (!codePath) {
		args.unshift(repoPath);
	}

	if (options.verbose) {
		args.push('--driver-verbose');
		spawnOptions.stdio = ['ignore', 'inherit', 'inherit'];
	}

	if (options.log) {
		args.push('--log', options.log);
	}

	if (options.extraArgs) {
		args.push(...options.extraArgs);
	}

	const electronPath = codePath ? getBuildElectronPath(codePath) : getDevElectronPath();
	const electronProcess = cp.spawn(electronPath, args, spawnOptions);

	console.info(`*** Started electron for desktop smoke tests on pid ${electronProcess.pid}`);

	let electronProcessDidExit = false;
	electronProcess.once('exit', (code, signal) => {
		console.info(`*** Electron for desktop smoke tests terminated (pid: ${electronProcess.pid}, code: ${code}, signal: ${signal})`);
		electronProcessDidExit = true;
	});

	process.once('exit', () => {
		if (!electronProcessDidExit) {
			electronProcess.kill();
		}
	});

	let retries = 0;

	while (true) {
		try {
			const { client, driver } = await connectElectronDriver(outPath, driverIPCHandle);
			return new Code(client, driver, options.logger, electronProcess.pid);
		} catch (err) {

			// give up
			if (++retries > 30) {
				console.error(`*** Error connecting driver: ${err}. Giving up...`);

				try {
					await promisify(kill)(electronProcess.pid);
				} catch (error) {
					console.warn(`*** Error tearing down: ${error}`);
				}

				throw err;
			}

			// retry
			else {
				if ((err as NodeJS.ErrnoException).code !== 'ENOENT' /* ENOENT is expected for as long as the server has not started on the socket */) {
					console.error(`*** Error connecting driver: ${err}. Attempting to retry...`);
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}
}

async function copyExtension(extensionsPath: string, extId: string): Promise<void> {
	const dest = path.join(extensionsPath, extId);
	if (!fs.existsSync(dest)) {
		const orig = path.join(repoPath, 'extensions', extId);
		await new Promise<void>((resolve, reject) => ncp(orig, dest, err => err ? reject(err) : resolve()));
	}
}

async function poll<T>(
	fn: () => Thenable<T>,
	acceptFn: (result: T) => boolean,
	timeoutMessage: string,
	retryCount: number = 200,
	retryInterval: number = 100 // millis
): Promise<T> {
	let trial = 1;
	let lastError: string = '';

	while (true) {
		if (trial > retryCount) {
			console.error('** Timeout!');
			console.error(lastError);
			console.error(`*** Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.`);
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

export class Code {

	private _activeWindowId: number | undefined = undefined;
	driver: IDriver;

	constructor(
		private client: IDisposable,
		driver: IDriver,
		readonly logger: Logger,
		private readonly mainProcessId: number
	) {
		this.driver = new Proxy(driver, {
			get(target, prop, receiver) {
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

	async capturePage(): Promise<string> {
		const windowId = await this.getActiveWindowId();
		return await this.driver.capturePage(windowId);
	}

	async waitForWindowIds(fn: (windowIds: number[]) => boolean): Promise<void> {
		await poll(() => this.driver.getWindowIds(), fn, `get window ids`);
	}

	async dispatchKeybinding(keybinding: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await this.driver.dispatchKeybinding(windowId, keybinding);
	}

	async exit(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let done = false;

			// Start the exit flow via driver
			this.driver.exitApplication().then(veto => {
				if (veto) {
					done = true;
					reject(new Error('Smoke test exit call resulted in unexpected veto'));
				}
			});

			// Await the exit of the application
			(async () => {
				let retries = 0;
				while (!done) {
					retries++;

					if (retries > 40) {
						done = true;
						reject(new Error('Smoke test exit call did not terminate process after 20s, giving up'));
					}

					try {
						process.kill(this.mainProcessId, 0); // throws an exception if the process doesn't exist anymore.
						await new Promise(resolve => setTimeout(resolve, 500));
					} catch (error) {
						done = true;
						resolve();
					}
				}
			})();
		}).finally(() => {
			this.dispose();
		});
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean, retryCount?: number): Promise<string> {
		const windowId = await this.getActiveWindowId();
		accept = accept || (result => textContent !== undefined ? textContent === result : !!result);

		return await poll(
			() => this.driver.getElements(windowId, selector).then(els => els.length > 0 ? Promise.resolve(els[0].textContent) : Promise.reject(new Error('Element not found for textContent'))),
			s => accept!(typeof s === 'string' ? s : ''),
			`get text content '${selector}'`,
			retryCount
		);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number, retryCount: number = 200): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.click(windowId, selector, xoffset, yoffset), () => true, `click '${selector}'`, retryCount);
	}

	async waitAndDoubleClick(selector: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.doubleClick(windowId, selector), () => true, `double click '${selector}'`);
	}

	async waitForSetValue(selector: string, value: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.setValue(windowId, selector, value), () => true, `set value '${selector}'`);
	}

	async waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		const windowId = await this.getActiveWindowId();
		return await poll(() => this.driver.getElements(windowId, selector, recursive), accept, `get elements '${selector}'`);
	}

	async waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result, retryCount: number = 200): Promise<IElement> {
		const windowId = await this.getActiveWindowId();
		return await poll<IElement>(() => this.driver.getElements(windowId, selector).then(els => els[0]), accept, `get element '${selector}'`, retryCount);
	}

	async waitForActiveElement(selector: string, retryCount: number = 200): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.isActiveElement(windowId, selector), r => r, `is active element '${selector}'`, retryCount);
	}

	async waitForTitle(fn: (title: string) => boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.getTitle(windowId), fn, `get title`);
	}

	async waitForTypeInEditor(selector: string, text: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.typeInEditor(windowId, selector, text), () => true, `type in editor '${selector}'`);
	}

	async waitForTerminalBuffer(selector: string, accept: (result: string[]) => boolean): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.getTerminalBuffer(windowId, selector), accept, `get terminal buffer '${selector}'`);
	}

	async writeInTerminal(selector: string, value: string): Promise<void> {
		const windowId = await this.getActiveWindowId();
		await poll(() => this.driver.writeInTerminal(windowId, selector, value), () => true, `writeInTerminal '${selector}'`);
	}

	async getLocaleInfo(): Promise<ILocaleInfo> {
		const windowId = await this.getActiveWindowId();
		return await this.driver.getLocaleInfo(windowId);
	}

	async getLocalizedStrings(): Promise<ILocalizedStrings> {
		const windowId = await this.getActiveWindowId();
		return await this.driver.getLocalizedStrings(windowId);
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
