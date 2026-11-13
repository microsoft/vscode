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

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('FileSystemWatcher string patterns only report events in workspace folders', () => {
		const fileSystemInfo = new ExtHostFileSystemInfo();
		const folder = { uri: URI.parse('watcher-test://one/workspace'), name: 'test', index: 0 };
		const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = {
			getWorkspaceFolder: uri => fileSystemInfo.extUri.isEqualOrParent(uri, folder.uri) ? folder : undefined
		};
		const service = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!);
		const watcher = store.add(service.createFileSystemWatcher(workspace as IExtHostWorkspace, undefined!, fileSystemInfo, nullExtensionDescription, '**/*.txt', {}));
		const created: string[] = [];
		store.add(watcher.onDidCreate(uri => created.push(uri.toString())));

		const matching = URI.joinPath(folder.uri, 'file.txt');
		service.$onFileEvent({
			created: [
				matching,
				matching.with({ scheme: 'other-watcher-test' }),
				matching.with({ authority: 'two' }),
				matching.with({ path: '/outside/file.txt' }),
				matching.with({ path: '/workspace/file.md' })
			],
			changed: [],
			deleted: []
		});

		assert.deepStrictEqual(created, [matching.toString()]);
	});

	for (const caseSensitive of [false, true]) {
		test(`FileSystemWatcher relative pattern filters by scheme and authority (caseSensitive: ${caseSensitive})`, () => {
			const baseUri = URI.parse('watcher-test://one/workspace');
			const fileSystemInfo = new ExtHostFileSystemInfo();
			fileSystemInfo.$acceptProviderInfos(baseUri, FileSystemProviderCapabilities.FileReadWrite | (caseSensitive ? FileSystemProviderCapabilities.PathCaseSensitive : 0));

			const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = {
				getWorkspaceFolder: () => undefined
			};
			const service = new ExtHostFileSystemEventService(protocolWithProxy, new NullLogService(), undefined!);
			const watcher = store.add(service.createFileSystemWatcher(workspace as IExtHostWorkspace, undefined!, fileSystemInfo, nullExtensionDescription, new RelativePattern(baseUri, '*.TXT'), {}));
			const created: string[] = [];
			const changed: string[] = [];
			const deleted: string[] = [];
			store.add(watcher.onDidCreate(uri => created.push(uri.toString())));
			store.add(watcher.onDidChange(uri => changed.push(uri.toString())));
			store.add(watcher.onDidDelete(uri => deleted.push(uri.toString())));

			const matching = URI.joinPath(baseUri, 'file.TXT');
			const matchingAuthority = matching.with({ authority: 'ONE', path: '/workspace/other.TXT' });
			const matchingLowerCase = matching.with({ path: '/WORKSPACE/lower.txt' });
			const events = [
				matching,
				matchingAuthority,
				matchingLowerCase,
				matching.with({ scheme: 'other-watcher-test' }),
				matching.with({ authority: 'two' }),
				matching.with({ path: '/workspace-other/file.TXT' }),
				matching.with({ path: '/workspace/nested/file.TXT' }),
				matching.with({ path: '/workspace/file.md' })
			];
			service.$onFileEvent({ created: events, changed: events, deleted: events });

			const expected = [matching, matchingAuthority, ...caseSensitive ? [] : [matchingLowerCase]].map(uri => uri.toString());
			assert.deepStrictEqual({ created, changed, deleted }, { created: expected, changed: expected, deleted: expected });
		});
	}

});
