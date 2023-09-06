/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EOL } from 'os';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { TestFS } from './memfs';

export function rndName() {
	return crypto.randomBytes(8).toString('hex');
}

export const testFs = new TestFS('fake-fs', true);
vscode.workspace.registerFileSystemProvider(testFs.scheme, testFs, { isCaseSensitive: testFs.isCaseSensitive });

export async function createRandomFile(contents = '', dir: vscode.Uri | undefined = undefined, ext = ''): Promise<vscode.Uri> {
	let fakeFile: vscode.Uri;
	if (dir) {
		assert.strictEqual(dir.scheme, testFs.scheme);
		fakeFile = dir.with({ path: dir.path + '/' + rndName() + ext });
	} else {
		fakeFile = vscode.Uri.parse(`${testFs.scheme}:/${rndName() + ext}`);
	}
	testFs.writeFile(fakeFile, Buffer.from(contents), { create: true, overwrite: true });
	return fakeFile;
}

export async function deleteFile(file: vscode.Uri): Promise<boolean> {
	try {
		testFs.delete(file);
		return true;
	} catch {
		return false;
	}
}

export function pathEquals(path1: string, path2: string): boolean {
	if (process.platform !== 'linux') {
		path1 = path1.toLowerCase();
		path2 = path2.toLowerCase();
	}

	return path1 === path2;
}

export function closeAllEditors(): Thenable<any> {
	return vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export function saveAllEditors(): Thenable<any> {
	return vscode.commands.executeCommand('workbench.action.files.saveAll');
}

export async function revertAllDirty(): Promise<void> {
	return vscode.commands.executeCommand('_workbench.revertAllDirty');
}

export function disposeAll(disposables: vscode.Disposable[]) {
	vscode.Disposable.from(...disposables).dispose();
}

export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function withLogLevel(level: string, runnable: () => Promise<any>): () => Promise<void> {
	return async (): Promise<void> => {
		const logLevel = await vscode.commands.executeCommand('_extensionTests.getLogLevel');
		await vscode.commands.executeCommand('_extensionTests.setLogLevel', level);

		try {
			await runnable();
		} finally {
			await vscode.commands.executeCommand('_extensionTests.setLogLevel', logLevel);
		}
	};
}

export function withLogDisabled(runnable: () => Promise<any>): () => Promise<void> {
	return withLogLevel('off', runnable);
}

export function withVerboseLogs(runnable: () => Promise<any>): () => Promise<void> {
	return withLogLevel('trace', runnable);
}

export function assertNoRpc() {
	assertNoRpcFromEntry([vscode, 'vscode']);
}

export function assertNoRpcFromEntry(entry: [obj: any, name: string]) {

	const symProxy = Symbol.for('rpcProxy');
	const symProtocol = Symbol.for('rpcProtocol');

	const proxyPaths: string[] = [];
	const rpcPaths: string[] = [];

	function walk(obj: any, path: string, seen: Set<any>) {
		if (!obj) {
			return;
		}
		if (typeof obj !== 'object' && typeof obj !== 'function') {
			return;
		}
		if (seen.has(obj)) {
			return;
		}
		seen.add(obj);

		if (obj[symProtocol]) {
			rpcPaths.push(`PROTOCOL via ${path}`);
		}
		if (obj[symProxy]) {
			proxyPaths.push(`PROXY '${obj[symProxy]}' via ${path}`);
		}

		for (const key in obj) {
			walk(obj[key], `${path}.${String(key)}`, seen);
		}
	}

	try {
		walk(entry[0], entry[1], new Set());
	} catch (err) {
		assert.fail(err);
	}
	assert.strictEqual(rpcPaths.length, 0, rpcPaths.join('\n'));
	assert.strictEqual(proxyPaths.length, 0, proxyPaths.join('\n')); // happens...
}

export async function asPromise<T>(event: vscode.Event<T>, timeout = vscode.env.uiKind === vscode.UIKind.Desktop ? 5000 : 15000): Promise<T> {
	const error = new Error('asPromise TIMEOUT reached');
	return new Promise<T>((resolve, reject) => {

		const handle = setTimeout(() => {
			sub.dispose();
			reject(error);
		}, timeout);

		const sub = event(e => {
			clearTimeout(handle);
			sub.dispose();
			resolve(e);
		});
	});
}

export function testRepeat(n: number, description: string, callback: (this: any) => any): void {
	for (let i = 0; i < n; i++) {
		test(`${description} (iteration ${i})`, callback);
	}
}

export function suiteRepeat(n: number, description: string, callback: (this: any) => any): void {
	for (let i = 0; i < n; i++) {
		suite(`${description} (iteration ${i})`, callback);
	}
}

export async function poll<T>(
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
			throw new Error(`Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.\r${lastError}`);
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
			lastError = Array.isArray(e.stack) ? e.stack.join(EOL) : e.stack;
		}

		await new Promise(resolve => setTimeout(resolve, retryInterval));
		trial++;
	}
}

export type ValueCallback<T = unknown> = (value: T | Promise<T>) => void;

/**
 * Creates a promise whose resolution or rejection can be controlled imperatively.
 */
export class DeferredPromise<T> {

	private completeCallback!: ValueCallback<T>;
	private errorCallback!: (err: unknown) => void;
	private rejected = false;
	private resolved = false;

	public get isRejected() {
		return this.rejected;
	}

	public get isResolved() {
		return this.resolved;
	}

	public get isSettled() {
		return this.rejected || this.resolved;
	}

	public readonly p: Promise<T>;

	constructor() {
		this.p = new Promise<T>((c, e) => {
			this.completeCallback = c;
			this.errorCallback = e;
		});
	}

	public complete(value: T) {
		return new Promise<void>(resolve => {
			this.completeCallback(value);
			this.resolved = true;
			resolve();
		});
	}

	public error(err: unknown) {
		return new Promise<void>(resolve => {
			this.errorCallback(err);
			this.rejected = true;
			resolve();
		});
	}

	public cancel() {
		new Promise<void>(resolve => {
			this.errorCallback(new Error('Canceled'));
			this.rejected = true;
			resolve();
		});
	}
}
