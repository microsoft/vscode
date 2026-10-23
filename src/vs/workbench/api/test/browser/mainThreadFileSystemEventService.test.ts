/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileService } from '../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
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

	test('sends the files.watcherExcludeGitIgnore patterns of workspace folders to the extension host', async () => {
		const folder = URI.file('/repo');
		const log: string[] = [];
		const proxy: Pick<ExtHostFileSystemEventServiceShape, '$acceptGitIgnoreWatcherExcludes'> = {
			$acceptGitIgnoreWatcherExcludes(folder, excludes) {
				log.push(`${URI.revive(folder).path}: [${excludes}]`);
			}
		};

		let excludes = new DeferredPromise<readonly string[]>();
		const onDidChangeExcludes = disposables.add(new Emitter<URI>());
		const setExcludes = async (value: readonly string[], fire: () => void) => {
			excludes = new DeferredPromise();
			excludes.complete(value);
			fire();
			await timeout(0);
		};

		let workspace = testWorkspace(folder);
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const configurationService = new TestConfigurationService();

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override readonly onDidFilesChange = Event.None;
		});
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
			override getWorkspace(): IWorkspace { return workspace; }
		});
		instantiationService.stub(IGitIgnoreWatcherExcludesService, new class extends mock<IGitIgnoreWatcherExcludesService>() {
			override readonly onDidChangeExcludes = onDidChangeExcludes.event;
			override getExcludes() { return excludes.p; }
		});

		disposables.add(instantiationService.createInstance(MainThreadFileSystemEventService, SingleProxyRPCProtocol(proxy)));

		// Nothing to send initially
		excludes.complete([]);
		await timeout(0);
		log.push('-- initial');

		// `.gitignore` changes
		await setExcludes(['target', 'target/**'], () => onDidChangeExcludes.fire(folder));
		await setExcludes(['target', 'target/**'], () => onDidChangeExcludes.fire(folder));
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
		await setExcludes(['out', 'out/**'], () => onDidChangeExcludes.fire(folder));
		const removedWhileReading = new DeferredPromise<readonly string[]>();
		excludes = removedWhileReading;
		onDidChangeExcludes.fire(folder);
		workspace = testWorkspace();
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [testWorkspace(folder).folders[0]], changed: [] });
		removedWhileReading.complete(['dist', 'dist/**']);
		await timeout(0);
		log.push('-- folder removed');

		assert.deepStrictEqual(log, [
			'-- initial',
			'/repo: [target,target/**]',
			'-- .gitignore changed',
			'/repo: []',
			'-- setting changed',
			'/repo: [out,out/**]',
			'/repo: []',
			'-- folder removed',
		]);
	});
});
