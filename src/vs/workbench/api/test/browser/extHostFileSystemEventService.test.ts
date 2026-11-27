/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ExtHostFileSystemEventService } from '../../common/extHostFileSystemEventService.js';
import { IMainContext } from '../../common/extHost.protocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { URI } from '../../../../base/common/uri.js';
import { FileSystemProviderCapabilities } from '../../../../platform/files/common/files.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { RelativePattern } from '../../common/extHostTypes.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtHostConfigProvider } from '../../common/extHostConfiguration.js';

suite('ExtHostFileSystemEventService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const protocol: IMainContext = {
		getProxy: () => { return undefined!; },
		set: undefined!,
		dispose: undefined!,
		assertRegistered: undefined!,
		drain: undefined!
	};

	const protocolWithProxy: IMainContext = {
		getProxy: () => ({ $watch() { }, $unwatch() { }, dispose() { } }) as never,
		set: undefined!,
		dispose: undefined!,
		assertRegistered: undefined!,
		drain: undefined!
	};

	test('FileSystemWatcher ignore events properties are reversed #26851', function () {

		const fileSystemInfo = new ExtHostFileSystemInfo();

		const watcher1 = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!).createFileSystemWatcher(undefined!, undefined!, fileSystemInfo, undefined!, '**/somethingInteresting', {});
		assert.strictEqual(watcher1.ignoreChangeEvents, false);
		assert.strictEqual(watcher1.ignoreCreateEvents, false);
		assert.strictEqual(watcher1.ignoreDeleteEvents, false);
		watcher1.dispose();

		const watcher2 = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!).createFileSystemWatcher(undefined!, undefined!, fileSystemInfo, undefined!, '**/somethingBoring', { ignoreCreateEvents: true, ignoreChangeEvents: true, ignoreDeleteEvents: true });
		assert.strictEqual(watcher2.ignoreChangeEvents, true);
		assert.strictEqual(watcher2.ignoreCreateEvents, true);
		assert.strictEqual(watcher2.ignoreDeleteEvents, true);
		watcher2.dispose();
	});

	test('FileSystemWatcher matches case-insensitively via pre-lowercasing', function () {
		const fileSystemInfo = new ExtHostFileSystemInfo();
		// Default: no PathCaseSensitive capability → ignoreCase=true for string patterns

		const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = {
			getWorkspaceFolder: () => ({ uri: URI.file('/workspace'), name: 'test', index: 0 })
		};

		const service = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!);
		const watcher = service.createFileSystemWatcher(workspace as IExtHostWorkspace, undefined!, fileSystemInfo, undefined!, '**/*.TXT', {});

		const created: URI[] = [];
		const sub = watcher.onDidCreate(uri => created.push(uri));

		// lowercase path should match uppercase pattern on case-insensitive fs
		service.$onFileEvent({
			session: undefined,
			created: [URI.file('/workspace/file.txt')],
			changed: [],
			deleted: []
		});

		assert.strictEqual(created.length, 1);

		sub.dispose();
		watcher.dispose();
	});

	test('FileSystemWatcher matches case-sensitively when PathCaseSensitive', function () {
		const fileSystemInfo = new ExtHostFileSystemInfo();
		fileSystemInfo.$acceptProviderInfos(URI.file('/'), FileSystemProviderCapabilities.PathCaseSensitive);

		const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = {
			getWorkspaceFolder: () => ({ uri: URI.file('/workspace'), name: 'test', index: 0 })
		};

		const service = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!);
		const watcher = service.createFileSystemWatcher(workspace as IExtHostWorkspace, undefined!, fileSystemInfo, undefined!, '**/*.TXT', {});

		const created: URI[] = [];
		const sub = watcher.onDidCreate(uri => created.push(uri));

		// lowercase path should NOT match uppercase pattern on case-sensitive fs
		service.$onFileEvent({
			session: undefined,
			created: [URI.file('/workspace/file.txt')],
			changed: [],
			deleted: []
		});

		assert.strictEqual(created.length, 0);

		// uppercase path SHOULD match
		service.$onFileEvent({
			session: undefined,
			created: [URI.file('/workspace/file.TXT')],
			changed: [],
			deleted: []
		});

		assert.strictEqual(created.length, 1);

		sub.dispose();
		watcher.dispose();
	});

	test('FileSystemWatcher matches relative pattern case-insensitively via pre-lowercasing', function () {
		const fileSystemInfo = new ExtHostFileSystemInfo();
		fileSystemInfo.$acceptProviderInfos(URI.file('/'), FileSystemProviderCapabilities.FileReadWrite); // no PathCaseSensitive → ignoreCase=true

		const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = {
			getWorkspaceFolder: () => ({ uri: URI.file('/workspace'), name: 'test', index: 0 })
		};

		const configProvider = {
			getConfiguration: () => ({ get: () => ({}) })
		} as unknown as ExtHostConfigProvider;

		const service = new ExtHostFileSystemEventService(protocolWithProxy, new NullLogService(), undefined!);
		const watcher = service.createFileSystemWatcher(workspace as IExtHostWorkspace, configProvider, fileSystemInfo, nullExtensionDescription, new RelativePattern('/Workspace', '**/*.TXT'), {});

		const created: URI[] = [];
		const sub = watcher.onDidCreate(uri => created.push(uri));

		// lowercase path should match mixed-case base + uppercase extension on case-insensitive fs
		service.$onFileEvent({
			session: undefined,
			created: [URI.file('/workspace/file.txt')],
			changed: [],
			deleted: []
		});

		assert.strictEqual(created.length, 1);

		sub.dispose();
		watcher.dispose();
	});

	test('routes a batch to overlapping watcher bases in registration order', () => {
		const service = new ExtHostFileSystemEventService(protocolWithProxy, new NullLogService(), undefined!);
		const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = { getWorkspaceFolder: () => undefined };
		const fileSystemInfo = new ExtHostFileSystemInfo();
		const calls: string[] = [];
		const watch = (base: string, label: string) => {
			const watcher = disposables.add(service.createFileSystemWatcher(workspace as IExtHostWorkspace, undefined!, fileSystemInfo, nullExtensionDescription, new RelativePattern(base, '*'), {}));
			disposables.add(watcher.onDidChange(uri => calls.push(`${label}: ${uri.path}`)));
			return watcher;
		};
		const file = URI.file('/workspace/src/a.ts');
		const sibling = URI.file('/workspace/src/b.ts');
		watch(file.fsPath, 'file');
		watch('/workspace/src/', 'folder');
		watch('/workspace/src', 'disposed').dispose();
		watch(file.fsPath, 'second file watcher');
		watch('/workspace/s', 'non-parent');

		service.$onFileEvent({ session: undefined, created: [], changed: [sibling, file], deleted: [] });

		assert.deepStrictEqual(calls, [
			'file: /workspace/src/a.ts',
			'folder: /workspace/src/b.ts',
			'folder: /workspace/src/a.ts',
			'second file watcher: /workspace/src/a.ts',
		]);
	});

});
