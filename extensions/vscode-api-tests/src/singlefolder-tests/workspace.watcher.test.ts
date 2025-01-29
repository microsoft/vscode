/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFS } from '../memfs';
import { assertNoRpc } from '../utils';

suite('vscode API - workspace-watcher', () => {

	interface IWatchRequest {
		uri: vscode.Uri;
		options: { recursive: boolean; excludes: string[] };
	}

	class WatcherTestFs extends TestFS {

		private _onDidWatch = new vscode.EventEmitter<IWatchRequest>();
		readonly onDidWatch = this._onDidWatch.event;

		override watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
			this._onDidWatch.fire({ uri, options });

			return super.watch(uri, options);
		}
	}

	let fs: WatcherTestFs;
	let disposable: vscode.Disposable;

	function onDidWatchPromise() {
		const onDidWatchPromise = new Promise<IWatchRequest>(resolve => {
			fs.onDidWatch(request => resolve(request));
		});

		return onDidWatchPromise;
	}

	setup(() => {
		fs = new WatcherTestFs('watcherTest', false);
		disposable = vscode.workspace.registerFileSystemProvider('watcherTest', fs);
	});

	teardown(() => {
		disposable.dispose();
		assertNoRpc();
	});

	test('createFileSystemWatcher (old style)', async function () {

		// Non-recursive
		let watchUri = vscode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchUri, '*.txt'));
		let request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, false);

		watcher.dispose();

		// Recursive
		watchUri = vscode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchUri, '**/*.txt'));
		request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, true);
	});

	test('createFileSystemWatcher (new style)', async function () {

		// Non-recursive
		let watchUri = vscode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchUri, '*.txt'), { excludes: ['testing'], ignoreChangeEvents: true });
		let request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, false);
		assert.strictEqual(request.options.excludes.length, 1);
		assert.strictEqual(request.options.excludes[0], 'testing');

		watcher.dispose();

		// Recursive
		watchUri = vscode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(watchUri, '**/*.txt'), { excludes: ['testing'], ignoreCreateEvents: true });
		request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, true);
		assert.strictEqual(request.options.excludes.length, 1);
		assert.strictEqual(request.options.excludes[0], 'testing');
	});
});
