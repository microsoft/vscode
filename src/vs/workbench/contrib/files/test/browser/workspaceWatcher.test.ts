/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { match } from '../../../../../base/common/glob.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
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

	function createWatcher(initialGitIgnoreExcludes: readonly string[] | undefined) {
		const log: string[] = [];

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

		const configurationService = new TestConfigurationService({ files: { watcherExclude: { '.git/objects/**': true } } });

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

		// The excludes of `folder`, `undefined` while they are read
		let gitIgnoreExcludes = initialGitIgnoreExcludes;
		const onDidChangeExcludes = disposables.add(new Emitter<URI>());
		const gitIgnoreWatcherExcludesService = new class extends mock<IGitIgnoreWatcherExcludesService>() {
			override readonly onDidChangeExcludes = onDidChangeExcludes.event;
			override getExcludes(): readonly string[] | undefined { return gitIgnoreExcludes; }
			override isExcluded(resource: URI): boolean {
				const path = relativePath(folder, resource);
				return !!path && !!gitIgnoreExcludes?.some(exclude => match(exclude, path));
			}
		};
		const setGitIgnoreExcludes = (excludes: readonly string[]) => {
			gitIgnoreExcludes = excludes;
			onDidChangeExcludes.fire(folder);
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

		const changeWatcherExclude = () => configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set(['files.watcherExclude']),
			change: { keys: ['files.watcherExclude'], overrides: [] },
			affectsConfiguration: key => key === 'files.watcherExclude'
		});

		return { watcher, log, setFolders, setGitIgnoreExcludes, setVisibleEditors, changeWatcherExclude };
	}

	test('watches right away when no .gitignore excludes apply', () => {
		const { log } = createWatcher([]);

		assert.deepStrictEqual(log, ['watch /repo .git/objects/**']);
	});

	test('excludes the paths ignored by .gitignore and watches again only when they change', () => {
		const { log, setGitIgnoreExcludes } = createWatcher(undefined);
		const beforeRead = [...log];

		setGitIgnoreExcludes(['target/**/*']);
		setGitIgnoreExcludes(['target/**/*']);
		setGitIgnoreExcludes(['out/**/*']);
		setGitIgnoreExcludes([]);

		assert.deepStrictEqual({ beforeRead, log }, {
			beforeRead: [],
			log: [
				'watch /repo .git/objects/**,target/**/*',
				'watch /repo .git/objects/**,out/**/*',
				'unwatch /repo .git/objects/**,target/**/*',
				'watch /repo .git/objects/**',
				'unwatch /repo .git/objects/**,out/**/*',
			]
		});
	});

	test('watches a folder only once its excludes are known and stops reacting when disposed', () => {
		const { watcher, log, setFolders, setGitIgnoreExcludes, changeWatcherExclude } = createWatcher(undefined);

		// Still reading after a refresh
		changeWatcherExclude();

		// Read after the folder was removed
		setFolders([]);
		setGitIgnoreExcludes(['removed/**/*']);
		setFolders([folder]);

		watcher.dispose();
		setGitIgnoreExcludes(['disposed/**/*']);

		assert.deepStrictEqual(log, [
			'watch /repo .git/objects/**,removed/**/*',
			'unwatch /repo .git/objects/**,removed/**/*',
		]);
	});

	test('watches visible editors whose file is excluded by .gitignore', () => {
		const { log, setGitIgnoreExcludes, setVisibleEditors } = createWatcher(undefined);
		setGitIgnoreExcludes(['target/**/*']);

		setVisibleEditors([joinPath(folder, 'target', 'debug.log'), joinPath(folder, 'src', 'main.rs')]);
		setVisibleEditors([joinPath(folder, 'src', 'main.rs')]);

		setVisibleEditors([joinPath(folder, 'target', 'debug.log')]);
		setGitIgnoreExcludes(['out/**/*']);

		assert.deepStrictEqual(log, [
			'watch /repo .git/objects/**,target/**/*',
			'watch /repo/target/debug.log',
			'unwatch /repo/target/debug.log',
			'watch /repo/target/debug.log',
			'watch /repo .git/objects/**,out/**/*',
			'unwatch /repo .git/objects/**,target/**/*',
			'unwatch /repo/target/debug.log',
		]);
	});
});
