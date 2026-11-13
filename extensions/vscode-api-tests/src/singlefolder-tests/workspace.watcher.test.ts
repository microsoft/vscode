/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFS } from '../memfs';
import { asPromise, assertNoRpc, disposeAll } from '../utils';

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

	test('createFileSystemWatcher', async function () {

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

	test('RelativePattern filters events by URI scheme and authority', async () => {
		const otherFs = new WatcherTestFs('otherWatcherTest', false);
		const disposables = [vscode.workspace.registerFileSystemProvider(otherFs.scheme, otherFs)];
		const entries = [
			{ provider: fs, baseUri: vscode.Uri.from({ scheme: fs.scheme, authority: 'one', path: '/' }) },
			{ provider: fs, baseUri: vscode.Uri.from({ scheme: fs.scheme, authority: 'two', path: '/' }) },
			{ provider: otherFs, baseUri: vscode.Uri.from({ scheme: otherFs.scheme, authority: 'one', path: '/' }) }
		];
		const watchers: vscode.FileSystemWatcher[] = [];
		const events = entries.map(() => ({ created: new Set<string>(), changed: new Set<string>(), deleted: new Set<string>() }));

		try {
			for (const [index, { provider, baseUri }] of entries.entries()) {
				const watching = asPromise(provider.onDidWatch);
				const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(baseUri, '*.txt'));
				disposables.push(watcher);
				watchers.push(watcher);
				disposables.push(
					watcher.onDidCreate(uri => events[index].created.add(uri.toString())),
					watcher.onDidChange(uri => events[index].changed.add(uri.toString())),
					watcher.onDidDelete(uri => events[index].deleted.add(uri.toString()))
				);
				await watching;
			}

			for (const [index, { baseUri }] of entries.entries()) {
				const uri = vscode.Uri.joinPath(baseUri, 'file.txt');
				const created = asPromise(watchers[index].onDidCreate);
				await vscode.workspace.fs.writeFile(uri, new Uint8Array([1]));
				await created;

				const changed = asPromise(watchers[index].onDidChange);
				await vscode.workspace.fs.writeFile(uri, new Uint8Array([2]));
				await changed;

				const deleted = asPromise(watchers[index].onDidDelete);
				await vscode.workspace.fs.delete(uri);
				await deleted;
			}

			assert.deepStrictEqual(events, entries.map(({ baseUri }) => {
				const expected = new Set([vscode.Uri.joinPath(baseUri, 'file.txt').toString()]);
				return { created: expected, changed: expected, deleted: expected };
			}));
		} finally {
			disposeAll(disposables);
		}
	});

	test('RelativePattern respects ignored events and disposal', async () => {
		const baseUri = vscode.Uri.from({ scheme: fs.scheme, path: '/' });
		const watching = asPromise(fs.onDidWatch);
		const control = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(baseUri, '*.txt'));
		const disposables: vscode.Disposable[] = [control];
		const events = new Set<string>();

		try {
			await watching;
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(baseUri, '*.txt'), true, false, true);
			disposables.push(watcher);
			disposables.push(
				watcher.onDidCreate(uri => events.add(`created:${uri.toString()}`)),
				watcher.onDidChange(uri => events.add(`changed:${uri.toString()}`)),
				watcher.onDidDelete(uri => events.add(`deleted:${uri.toString()}`))
			);

			const uri = vscode.Uri.joinPath(baseUri, 'file.txt');
			const changed = asPromise(watcher.onDidChange);
			await vscode.workspace.fs.writeFile(uri, new Uint8Array([1]));
			await changed;

			const deleted = asPromise(control.onDidDelete);
			await vscode.workspace.fs.delete(uri);
			await deleted;

			watcher.dispose();
			const created = asPromise(control.onDidCreate);
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(baseUri, 'after-dispose.txt'), new Uint8Array([2]));
			await created;

			assert.deepStrictEqual(events, new Set([`changed:${uri.toString()}`]));
		} finally {
			disposeAll(disposables);
		}
	});
});
