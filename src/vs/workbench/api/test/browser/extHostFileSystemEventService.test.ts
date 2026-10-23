/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ExtHostFileSystemEventService } from '../../common/extHostFileSystemEventService.js';
import { IMainContext, MainThreadFileSystemEventServiceShape } from '../../common/extHost.protocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { FileSystemProviderCapabilities } from '../../../../platform/files/common/files.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { RelativePattern } from '../../common/extHostTypes.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtHostConfigProvider } from '../../common/extHostConfiguration.js';

suite('ExtHostFileSystemEventService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('FileSystemWatcher accounts for the files.watcherExcludeGitIgnore patterns of the workspace folder', function () {
		const folder = URI.file('/workspace');
		const log: string[] = [];
		const sessions = new Map<number, string>();
		const proxy: Pick<MainThreadFileSystemEventServiceShape, '$watch' | '$unwatch'> = {
			$watch(_extensionId, session, resource, opts) {
				const path = URI.revive(resource).path;
				sessions.set(session, path);
				const includes = opts.includes?.map(include => typeof include === 'string' ? include : `${include.base}:${include.pattern}`);
				log.push(`watch ${path} recursive=${opts.recursive} excludes=[${opts.excludes}]${includes ? ` includes=[${includes}]` : ''}`);
			},
			$unwatch(session) {
				log.push(`unwatch ${sessions.get(session)}`);
			}
		};
		const protocolWithRecordingProxy: IMainContext = { ...protocol, getProxy: () => proxy as never };

		const workspace: Pick<IExtHostWorkspace, 'getWorkspaceFolder'> = {
			getWorkspaceFolder: uri => isEqualOrParent(uri, folder) ? { uri: folder, name: 'workspace', index: 0 } : undefined
		};
		const configProvider = {
			getConfiguration: () => ({ get: () => ({}) })
		} as unknown as ExtHostConfigProvider;

		const service = new ExtHostFileSystemEventService(protocolWithRecordingProxy, new NullLogService(), undefined!);
		const createWatcher = (base: URI, pattern: string) => service.createFileSystemWatcher(workspace as IExtHostWorkspace, configProvider, new ExtHostFileSystemInfo(), nullExtensionDescription, new RelativePattern(base, pattern), {});
		const watchers = [
			createWatcher(folder, '**/*.js'),
			createWatcher(joinPath(folder, 'src'), '**/*.js'),
			createWatcher(joinPath(folder, 'out'), '*.js'),
		];

		log.push('-- excluded');
		service.$acceptGitIgnoreWatcherExcludes(folder, ['out/**/*', '**/legacy/**']);
		log.push('-- cleared');
		service.$acceptGitIgnoreWatcherExcludes(folder, []);
		log.push('-- disposed');
		watchers.forEach(watcher => watcher.dispose());
		service.$acceptGitIgnoreWatcherExcludes(folder, ['out/**/*']);

		assert.deepStrictEqual(log, [
			'watch /workspace recursive=true excludes=[]',
			'watch /workspace/src recursive=true excludes=[]',
			'-- excluded',
			'watch /workspace recursive=true excludes=[out/**/*,**/legacy/**]',
			`watch /workspace/out recursive=false excludes=[] includes=[${folder.fsPath}:out/**/*,${folder.fsPath}:**/legacy/**]`,
			'-- cleared',
			'watch /workspace recursive=true excludes=[]',
			'unwatch /workspace/out',
			'-- disposed',
			'unwatch /workspace',
			'unwatch /workspace/src',
		]);
	});

});
