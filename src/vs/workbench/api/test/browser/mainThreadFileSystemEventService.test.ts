/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../platform/files/common/fileService.js';
import { IFileService, IFileStatWithMetadata, IFileSystemWatcher, IWatchOptions, IWatchOptionsWithCorrelation, IWatchOptionsWithoutCorrelation } from '../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFoldersChangeEvent } from '../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../platform/workspace/test/common/testWorkspace.js';
import { IGitIgnoreWatcherExcludesService } from '../../../services/files/common/gitIgnoreWatcherExcludesService.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { MainThreadFileSystemEventService } from '../../browser/mainThreadFileSystemEventService.js';
import { ExtHostFileSystemEventServiceShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadFileSystemEventService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const folder = URI.file('/repo');

	function createService(fileService: IFileService, proxy: Partial<ExtHostFileSystemEventServiceShape>) {
		const state = { workspace: testWorkspace(folder), excludes: new DeferredPromise<readonly string[]>() };
		const onDidChangeExcludes = disposables.add(new Emitter<URI>());
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const configurationService = new TestConfigurationService();

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkingCopyFileService, new class extends mock<IWorkingCopyFileService>() {
			override readonly onDidRunWorkingCopyFileOperation = Event.None;
			override addFileOperationParticipant() { return Disposable.None; }
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IBulkEditService, {});
		instantiationService.stub(IProgressService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IStorageService, {});
		instantiationService.stub(IEnvironmentService, {});
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService())))));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
			override getWorkspace(): IWorkspace { return state.workspace; }
		});
		instantiationService.stub(IGitIgnoreWatcherExcludesService, new class extends mock<IGitIgnoreWatcherExcludesService>() {
			override readonly onDidChangeExcludes = onDidChangeExcludes.event;
			override getExcludes() { return state.excludes.p; }
		});

		const service = instantiationService.createInstance(MainThreadFileSystemEventService, SingleProxyRPCProtocol({ $acceptGitIgnoreWatcherExcludes() { }, ...proxy }));

		return { service, state, onDidChangeExcludes, onDidChangeWorkspaceFolders, configurationService };
	}

	test('sends the files.watcherExcludeGitIgnore patterns of workspace folders to the extension host', async () => {
		const log: string[] = [];
		const { service, state, onDidChangeExcludes, onDidChangeWorkspaceFolders, configurationService } = createService(new class extends mock<IFileService>() {
			override readonly onDidFilesChange = Event.None;
		}, {
			$acceptGitIgnoreWatcherExcludes(folder, excludes) {
				log.push(`${URI.revive(folder).path}: [${excludes}]`);
			}
		});
		disposables.add(service);

		const setExcludes = async (value: readonly string[], fire: () => void) => {
			state.excludes = new DeferredPromise();
			state.excludes.complete(value);
			fire();
			await timeout(0);
		};

		// Nothing to send initially
		state.excludes.complete([]);
		await timeout(0);
		log.push('-- initial');

		// `.gitignore` changes
		await setExcludes(['target/**/*'], () => onDidChangeExcludes.fire(folder));
		await setExcludes(['target/**/*'], () => onDidChangeExcludes.fire(folder));
		log.push('-- .gitignore changed');

		// Setting changes
		await setExcludes([], () => configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set(['files.watcherExcludeGitIgnore']),
			change: { keys: ['files.watcherExcludeGitIgnore'], overrides: [] },
			affectsConfiguration: key => key === 'files.watcherExcludeGitIgnore'
		}));
		log.push('-- setting changed');

		// Folder removed, also while reading
		await setExcludes(['out/**/*'], () => onDidChangeExcludes.fire(folder));
		const removedWhileReading = new DeferredPromise<readonly string[]>();
		state.excludes = removedWhileReading;
		onDidChangeExcludes.fire(folder);
		state.workspace = testWorkspace();
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [testWorkspace(folder).folders[0]], changed: [] });
		removedWhileReading.complete(['dist/**/*']);
		await timeout(0);
		log.push('-- folder removed');

		assert.deepStrictEqual(log, [
			'-- initial',
			'/repo: [target/**/*]',
			'-- .gitignore changed',
			'/repo: []',
			'-- setting changed',
			'/repo: [out/**/*]',
			'/repo: []',
			'-- folder removed',
		]);
	});

	test('ignores watch requests that are outdated when they are ready', async () => {
		const log: string[] = [];
		const stats: DeferredPromise<IFileStatWithMetadata>[] = [];
		const { service, state } = createService(new class extends mock<IFileService>() {
			override readonly onDidFilesChange = Event.None;
			override async canHandleResource() { return true; }
			override stat(): Promise<IFileStatWithMetadata> {
				const stat = new DeferredPromise<IFileStatWithMetadata>();
				stats.push(stat);
				return stat.p;
			}
			override watch(resource: URI, options: IWatchOptionsWithCorrelation): IFileSystemWatcher;
			override watch(resource: URI, options?: IWatchOptionsWithoutCorrelation): IDisposable;
			override watch(resource: URI, options?: IWatchOptions): IDisposable {
				const request = `${resource.path} [${options?.excludes}]`;
				log.push(`watch ${request}`);
				return toDisposable(() => log.push(`unwatch ${request}`));
			}
		}, {});
		state.excludes.complete([]);
		const directory = upcastPartial<IFileStatWithMetadata>({ isDirectory: true });

		// A newer request of the same session is ready first
		const first = service.$watch('ext', 1, folder, { recursive: true, excludes: [] }, false);
		const second = service.$watch('ext', 1, folder, { recursive: true, excludes: ['out/**/*'] }, false);
		await timeout(0);
		stats[1].complete(directory);
		await second;
		stats[0].complete(directory);
		await first;
		log.push('-- out of order');

		// Unwatched while pending
		const unwatched = service.$watch('ext', 2, folder, { recursive: true, excludes: [] }, false);
		await timeout(0);
		service.$unwatch(2);
		stats[2].complete(directory);
		await unwatched;
		log.push('-- unwatched');

		// Disposed while pending
		const disposed = service.$watch('ext', 3, folder, { recursive: true, excludes: [] }, false);
		await timeout(0);
		service.dispose();
		stats[3].complete(directory);
		await disposed;

		assert.deepStrictEqual(log, [
			'watch /repo [out/**/*]',
			'-- out of order',
			'-- unwatched',
			'unwatch /repo [out/**/*]',
		]);
	});
});
