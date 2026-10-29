/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { GitIgnoreWatcherExcludesService } from '../../common/gitIgnoreWatcherExcludesService.js';

suite('GitIgnoreWatcherExcludesService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const folder = URI.from({ scheme: Schemas.inMemory, path: '/repo' });

	function createService(fileService: IFileService, watcherExcludeGitIgnore: boolean) {
		const configurationService = new TestConfigurationService({ files: { watcherExcludeGitIgnore } });

		let workspace = testWorkspace(folder);
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const contextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
			override getWorkspace(): IWorkspace { return workspace; }
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null { return workspace.getFolder(resource); }
		};

		const service = disposables.add(new GitIgnoreWatcherExcludesService(fileService, configurationService, contextService, disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService()))))));

		// Record the excludes that consumers see when the service fires
		const changes: string[] = [];
		disposables.add(service.onDidChangeExcludes(folder => changes.push(`${folder.path}: ${JSON.stringify(service.getExcludes(folder))}`)));

		return {
			service,
			changes,
			setEnabled: (enabled: boolean) => {
				configurationService.setUserConfiguration('files', { watcherExcludeGitIgnore: enabled });
				configurationService.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set(['files.watcherExcludeGitIgnore']),
					change: { keys: ['files.watcherExcludeGitIgnore'], overrides: [] },
					affectsConfiguration: key => key === 'files.watcherExcludeGitIgnore'
				});
			},
			removeFolder: () => {
				workspace = testWorkspace();
				onDidChangeWorkspaceFolders.fire({ added: [], removed: testWorkspace(folder).folders, changed: [] });
			}
		};
	}

	async function createInMemoryFileService(gitIgnore: string) {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(joinPath(folder, '.gitignore'), VSBuffer.fromString(gitIgnore));

		return fileService;
	}

	test('provides the excludes of the root of enabled workspace folders', async () => {
		const enabled = createService(await createInMemoryFileService('/target/\n'), true);
		const pending = enabled.service.getExcludes(folder);
		await Event.toPromise(enabled.service.onDidChangeExcludes);
		const disabled = createService(await createInMemoryFileService('/target/\n'), false);

		assert.deepStrictEqual({
			pending,
			root: enabled.service.getExcludes(folder),
			subfolder: enabled.service.getExcludes(joinPath(folder, 'src')),
			outsideWorkspace: enabled.service.getExcludes(URI.from({ scheme: Schemas.inMemory, path: '/other' })),
			disabled: disabled.service.getExcludes(folder),
			excluded: ['target/a.o', 'TARGET/a.o', 'src/main.rs'].filter(path => enabled.service.isExcluded(joinPath(folder, path))),
		}, {
			pending: undefined,
			root: ['target/**/*'],
			subfolder: [],
			outsideWorkspace: [],
			disabled: [],
			excluded: ['target/a.o'],
		});
	});

	test('reports changes of the .gitignore file, the setting and the workspace folders', () => runWithFakedTimers({}, async () => {
		const fileService = await createInMemoryFileService('/target/\n');
		const { service, changes, setEnabled, removeFolder } = createService(fileService, true);
		await Event.toPromise(service.onDidChangeExcludes);

		// Only changes of the excludes are reported
		await fileService.writeFile(joinPath(folder, '.gitignore'), VSBuffer.fromString('# build output\n/target/\n'));
		await timeout(1000);
		await fileService.writeFile(joinPath(folder, '.gitignore'), VSBuffer.fromString('/target/\nnode_modules/\n'));
		await timeout(1000);

		setEnabled(false);
		setEnabled(true);
		const pendingAfterEnabling = service.getExcludes(folder);
		await Event.toPromise(service.onDidChangeExcludes);

		removeFolder();

		assert.deepStrictEqual({ pendingAfterEnabling, changes }, {
			pendingAfterEnabling: undefined,
			changes: [
				'/repo: ["target/**/*"]',
				'/repo: ["target/**/*","node_modules/**/*","*/node_modules/**/*","*/*/node_modules/**/*","*/*/*/node_modules/**/*"]',
				'/repo: []',
				'/repo: ["target/**/*","node_modules/**/*","*/node_modules/**/*","*/*/node_modules/**/*","*/*/*/node_modules/**/*"]',
				'/repo: []',
			]
		});
	}));

	test('ignores reads that are outdated when they complete', () => runWithFakedTimers({}, async () => {
		const reads: DeferredPromise<IFileContent>[] = [];
		const onDidFilesChange = disposables.add(new Emitter<FileChangesEvent>());
		const fileService = new class extends mock<IFileService>() {
			override readonly onDidFilesChange = onDidFilesChange.event;
			override readFile(): Promise<IFileContent> {
				const read = new DeferredPromise<IFileContent>();
				reads.push(read);
				return read.p;
			}
		};
		const content = (gitIgnore: string) => upcastPartial<IFileContent>({ value: VSBuffer.fromString(gitIgnore) });
		const changeGitIgnore = async () => {
			onDidFilesChange.fire(new FileChangesEvent([{ resource: joinPath(folder, '.gitignore'), type: FileChangeType.UPDATED }], false));
			await timeout(1000);
		};

		const disabled = createService(fileService, false);
		const readsWhenDisabled = reads.length;
		disabled.service.dispose();

		const { service, changes, setEnabled } = createService(fileService, true);

		// Newer reads complete before older ones (the first read is the initial one)
		await changeGitIgnore();
		await changeGitIgnore();
		reads[2].complete(content('/new/\n'));
		await timeout(0);
		reads[1].complete(content('/older/\n'));
		reads[0].complete(content('/initial/\n'));
		await timeout(0);
		const afterOutOfOrderReads = service.getExcludes(folder);

		// A read completes after the folder is no longer tracked
		await changeGitIgnore();
		setEnabled(false);
		reads[3].complete(content('/stale/\n'));
		await timeout(0);

		assert.deepStrictEqual({ readsWhenDisabled, afterOutOfOrderReads, changes }, {
			readsWhenDisabled: 0,
			afterOutOfOrderReads: ['new/**/*'],
			changes: ['/repo: ["new/**/*"]', '/repo: []'],
		});
	}));
});
