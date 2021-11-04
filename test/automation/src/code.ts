/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import { IDriver, IDisposable, IElement, Thenable, ILocalizedStrings, ILocaleInfo } from './driver';
import { connectBrowser, connectElectron, launchServer } from './playwright';
import { Logger } from './logger';
import { ncp } from 'ncp';
import { URI } from 'vscode-uri';

const repoPath = path.join(__dirname, '../../..');

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

async function connect(driverFn: () => Promise<{ client: IDisposable, driver: IDriver }>, logger: Logger): Promise<Code> {
	let errCount = 0;

	while (true) {
		try {
			const { client, driver } = await driverFn();

			return new Code(client, driver, logger);
		} catch (err) {
			if (++errCount > 50) {
				throw err;
			}

			// retry
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}
}

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

	// Copy notebook smoketests over
	copyExtension(options.extensionsPath, 'vscode-notebook-tests');

	// Browser Smoke Test
	if (options.web) {

		// We need a server first
		await launchServer(options.userDataDir, options.workspacePath, options.codePath, options.extensionsPath, Boolean(options.verbose));

		// Then connect via browser
		return connect(() => connectBrowser(options), options.logger);
	}

	// Electron Smoke Test
	else {
		const env = { ...process.env };

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
			`--logsPath=${path.join(repoPath, '.build', 'logs', 'smoke-tests')}`,
			'--enable-driver'
		];

		if (process.platform === 'linux') {
			args.push('--disable-gpu'); // Linux has trouble in VMs to render properly with GPU enabled
		}

		if (options.remote) {

			// Replace workspace path with URI
			args[0] = `--${options.workspacePath.endsWith('.code-workspace') ? 'file' : 'folder'}-uri=vscode-remote://test+test/${URI.file(options.workspacePath).path}`;

			if (options.codePath) {
				// running against a build: copy the test resolver extension
				copyExtension(options.extensionsPath, 'vscode-test-resolver');
			}
			args.push('--enable-proposed-api=vscode.vscode-test-resolver');
			const remoteDataDir = `${options.userDataDir}-server`;
			mkdirp.sync(remoteDataDir);

			if (options.codePath) {
				// running against a build: copy the test resolver extension into remote extensions dir
				const remoteExtensionsDir = path.join(remoteDataDir, 'extensions');
				mkdirp.sync(remoteExtensionsDir);
				copyExtension(remoteExtensionsDir, 'vscode-notebook-tests');
			}

			env['TESTRESOLVER_DATA_FOLDER'] = remoteDataDir;
		}

		args.push('--enable-proposed-api=vscode.vscode-notebook-tests');

		if (!options.codePath) {
			args.unshift(repoPath);
		}

		if (options.log) {
			args.push('--log', options.log);
		}

		if (options.extraArgs) {
			args.push(...options.extraArgs);
		}

		const executablePath = options.codePath ? getBuildElectronPath(options.codePath) : getDevElectronPath();
		return connect(() => connectElectron({ executablePath, args, env }), options.logger);
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

	private ready: Promise<void> | undefined = undefined;
	private driver: IDriver;

	constructor(
		private client: IDisposable,
		driver: IDriver,
		readonly logger: Logger
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

	async waitForReady(): Promise<void> {
		if (!this.ready) {
			this.ready = this.driver.waitForReady();
		}

		return this.ready;
	}

	async dispatchKeybinding(keybinding: string): Promise<void> {
		await this.driver.dispatchKeybinding(keybinding);
	}

	async reload(): Promise<void> {
		await this.driver.reloadWindow();
	}

	async exit(): Promise<void> {
		return this.driver.exitApplication();
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean, retryCount?: number): Promise<string> {
		accept = accept || (result => textContent !== undefined ? textContent === result : !!result);

		return await poll(
			() => this.driver.getElements(selector).then(els => els.length > 0 ? Promise.resolve(els[0].textContent) : Promise.reject(new Error('Element not found for textContent'))),
			s => accept!(typeof s === 'string' ? s : ''),
			`get text content '${selector}'`,
			retryCount
		);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number, retryCount: number = 200): Promise<void> {
		await poll(() => this.driver.click(selector, xoffset, yoffset), () => true, `click '${selector}'`, retryCount);
	}

	async waitAndDoubleClick(selector: string): Promise<void> {
		await poll(() => this.driver.doubleClick(selector), () => true, `double click '${selector}'`);
	}

	async waitForSetValue(selector: string, value: string): Promise<void> {
		await poll(() => this.driver.setValue(selector, value), () => true, `set value '${selector}'`);
	}

	async waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		return await poll(() => this.driver.getElements(selector, recursive), accept, `get elements '${selector}'`);
	}

	async waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result, retryCount: number = 200): Promise<IElement> {
		return await poll<IElement>(() => this.driver.getElements(selector).then(els => els[0]), accept, `get element '${selector}'`, retryCount);
	}

	async waitForActiveElement(selector: string, retryCount: number = 200): Promise<void> {
		await this.waitForReady();
		await poll(() => this.driver.isActiveElement(selector), r => r, `is active element '${selector}'`, retryCount);
	}

	async waitForTitle(fn: (title: string) => boolean): Promise<void> {
		await poll(() => this.driver.getTitle(), fn, `get title`);
	}

	async waitForTypeInEditor(selector: string, text: string): Promise<void> {
		await this.waitForReady();
		await poll(() => this.driver.typeInEditor(selector, text), () => true, `type in editor '${selector}'`);
	}

	async waitForTerminalBuffer(selector: string, accept: (result: string[]) => boolean): Promise<void> {
		await poll(() => this.driver.getTerminalBuffer(selector), accept, `get terminal buffer '${selector}'`);
	}

	async writeInTerminal(selector: string, value: string): Promise<void> {
		await poll(() => this.driver.writeInTerminal(selector, value), () => true, `writeInTerminal '${selector}'`);
	}

	async getLocaleInfo(): Promise<ILocaleInfo> {
		return this.driver.getLocaleInfo();
	}

	async getLocalizedStrings(): Promise<ILocalizedStrings> {
		return this.driver.getLocalizedStrings();
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
