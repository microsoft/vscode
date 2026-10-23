/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService, IFileSystemWatcher, IWatchOptions, IWatchOptionsWithCorrelation, IWatchOptionsWithoutCorrelation } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService, IVisibleEditorsChangeEvent } from '../../../../services/editor/common/editorService.js';
import { IGitIgnoreWatcherExcludesService } from '../../../../services/files/common/gitIgnoreWatcherExcludesService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { WorkspaceWatcher } from '../../browser/workspaceWatcher.js';

suite('Files - WorkspaceWatcher', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const folder = URI.file('/repo');

	class TestEditorInput extends EditorInput {
		readonly typeId = 'workspaceWatcherTestEditor';

		constructor(readonly resource: URI) {
			super();
		}
	}

	function configurationChangeEvent(key: string): IConfigurationChangeEvent {
		return {
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: configuration => configuration === key
		};
	}

	function createWatcher(watcherExcludeGitIgnore: boolean) {
		const log: string[] = [];
		let getExcludesCalls = 0;

		const fileService = new class extends mock<IFileService>() {
			override readonly onDidWatchError = Event.None;
			override watch(resource: URI, options: IWatchOptionsWithCorrelation): IFileSystemWatcher;
			override watch(resource: URI, options?: IWatchOptionsWithoutCorrelation): IDisposable;
			override watch(resource: URI, options?: IWatchOptions): IDisposable {
				const request = options ? `${resource.path} ${options.excludes.join(',')}` : resource.path;
				log.push(`watch ${request}`);

				return toDisposable(() => log.push(`unwatch ${request}`));
			}
		};

		const configurationService = new TestConfigurationService({ files: { watcherExclude: { '.git/objects/**': true }, watcherExcludeGitIgnore } });

		let workspace = testWorkspace(folder);
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const contextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
			override readonly onDidChangeWorkbenchState = Event.None;
			override getWorkspace(): IWorkspace { return workspace; }
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null { return workspace.getFolder(resource); }
		};
		const setFolders = (folders: URI[]) => {
			const previous = workspace.folders;
			workspace = testWorkspace(...folders);
			onDidChangeWorkspaceFolders.fire({
				added: workspace.folders.filter(folder => !previous.some(p => p.uri.path === folder.uri.path)),
				removed: previous.filter(folder => !workspace.folders.some(f => f.uri.path === folder.uri.path)),
				changed: []
			});
		};

		const onDidChangeExcludes = disposables.add(new Emitter<URI>());
		const gitIgnore = {
			excludes: new DeferredPromise<readonly string[]>(),
			fireChange: () => onDidChangeExcludes.fire(folder)
		};
		const gitIgnoreWatcherExcludesService = new class extends mock<IGitIgnoreWatcherExcludesService>() {
			override readonly onDidChangeExcludes = onDidChangeExcludes.event;
			override getExcludes(): Promise<readonly string[]> {
				getExcludesCalls++;
				return gitIgnore.excludes.p;
			}
		};

		const onDidVisibleEditorsChange = disposables.add(new Emitter<IVisibleEditorsChangeEvent>());
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidVisibleEditorsChange = onDidVisibleEditorsChange.event;
			override visibleEditors: readonly EditorInput[] = [];
		};
		const setVisibleEditors = (resources: URI[]) => {
			editorService.visibleEditors = resources.map(resource => disposables.add(new TestEditorInput(resource)));
			onDidVisibleEditorsChange.fire({ isExplicit: true });
		};

		const watcher = disposables.add(new WorkspaceWatcher(
			fileService,
			configurationService,
			contextService,
			new TestNotificationService(),
			NullOpenerService,
			disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService())))),
			new class extends mock<IHostService>() { },
			NullTelemetryService,
			gitIgnoreWatcherExcludesService,
			editorService
		));

		const setWatcherExcludeGitIgnore = (enabled: boolean) => {
			configurationService.setUserConfiguration('files', { watcherExclude: { '.git/objects/**': true }, watcherExcludeGitIgnore: enabled });
			configurationService.onDidChangeConfigurationEmitter.fire(configurationChangeEvent('files.watcherExcludeGitIgnore'));
		};
		const changeWatcherExclude = () => configurationService.onDidChangeConfigurationEmitter.fire(configurationChangeEvent('files.watcherExclude'));

		return { watcher, log, gitIgnore, getExcludesCalls: () => getExcludesCalls, setFolders, setVisibleEditors, setWatcherExcludeGitIgnore, changeWatcherExclude };
	}

	test('watches right away without reading .gitignore when disabled', () => {
		const { log, getExcludesCalls } = createWatcher(false);

		assert.deepStrictEqual({ log, getExcludesCalls: getExcludesCalls() }, {
			log: ['watch /repo .git/objects/**'],
			getExcludesCalls: 0
		});
	});

	test('excludes the paths ignored by .gitignore and watches again only when they change', async () => {
		const { log, gitIgnore, setWatcherExcludeGitIgnore } = createWatcher(true);
		const beforeRead = [...log];

		gitIgnore.excludes.complete(['target', 'target/**']);
		await timeout(0);

		gitIgnore.excludes = new DeferredPromise();
		gitIgnore.excludes.complete(['target', 'target/**']);
		gitIgnore.fireChange();
		await timeout(0);
		const afterUnchanged = [...log];

		gitIgnore.excludes = new DeferredPromise();
		gitIgnore.excludes.complete(['out', 'out/**']);
		gitIgnore.fireChange();
		await timeout(0);

		setWatcherExcludeGitIgnore(false);

		assert.deepStrictEqual({ beforeRead, afterUnchanged, log }, {
			beforeRead: [],
			afterUnchanged: ['watch /repo .git/objects/**,target,target/**'],
			log: [
				'watch /repo .git/objects/**,target,target/**',
				'watch /repo .git/objects/**,out,out/**',
				'unwatch /repo .git/objects/**,target,target/**',
				'watch /repo .git/objects/**',
				'unwatch /repo .git/objects/**,out,out/**',
			]
		});
	});

	test('drops excludes read for a folder that was refreshed, removed or disposed meanwhile', async () => {
		const { watcher, log, gitIgnore, setFolders, changeWatcherExclude } = createWatcher(true);

		// Refreshed while reading
		const first = gitIgnore.excludes;
		gitIgnore.excludes = new DeferredPromise();
		changeWatcherExclude();
		first.complete(['first']);
		await timeout(0);
		gitIgnore.excludes.complete(['second']);
		await timeout(0);

		// Removed while reading
		setFolders([]);
		gitIgnore.excludes = new DeferredPromise();
		setFolders([folder]);
		setFolders([]);
		gitIgnore.excludes.complete(['removed']);
		await timeout(0);

		// Disposed while reading
		gitIgnore.excludes = new DeferredPromise();
		setFolders([folder]);
		watcher.dispose();
		gitIgnore.excludes.complete(['disposed']);
		await timeout(0);

		assert.deepStrictEqual(log, [
			'watch /repo .git/objects/**,second',
			'unwatch /repo .git/objects/**,second',
		]);
	});

	test('watches visible editors whose file is excluded by .gitignore', async () => {
		const { log, gitIgnore, setVisibleEditors } = createWatcher(true);
		gitIgnore.excludes.complete(['target', 'target/**']);
		await timeout(0);

		setVisibleEditors([joinPath(folder, 'target', 'debug.log'), joinPath(folder, 'src', 'main.rs')]);
		setVisibleEditors([joinPath(folder, 'src', 'main.rs')]);

		setVisibleEditors([joinPath(folder, 'target', 'debug.log')]);
		gitIgnore.excludes = new DeferredPromise();
		gitIgnore.excludes.complete(['out', 'out/**']);
		gitIgnore.fireChange();
		await timeout(0);

		assert.deepStrictEqual(log, [
			'watch /repo .git/objects/**,target,target/**',
			'watch /repo/target/debug.log',
			'unwatch /repo/target/debug.log',
			'watch /repo/target/debug.log',
			'watch /repo .git/objects/**,out,out/**',
			'unwatch /repo .git/objects/**,target,target/**',
			'unwatch /repo/target/debug.log',
		]);
	});
});
