/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NullLogService } from 'vs/platform/log/common/log';
import { EditSessionsContribution } from 'vs/workbench/contrib/editSessions/browser/editSessions.contribution';
import { ProgressService } from 'vs/workbench/services/progress/browser/progressService';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { SCMService } from 'vs/workbench/contrib/scm/common/scmService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { mock } from 'vs/base/test/common/mock';
import * as sinon from 'sinon';
import * as assert from 'assert';
import { ChangeType, FileType, IEditSessionsLogService, IEditSessionsWorkbenchService } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { TestEnvironmentService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

const folderName = 'test-folder';
const folderUri = URI.file(`/${folderName}`);

suite('Edit session sync', () => {
	let instantiationService: TestInstantiationService;
	let editSessionsContribution: EditSessionsContribution;
	let fileService: FileService;
	let sandbox: sinon.SinonSandbox;

	const disposables = new DisposableStore();

	suiteSetup(() => {
		sandbox = sinon.createSandbox();

		instantiationService = new TestInstantiationService();

		// Set up filesystem
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		fileService.registerProvider(Schemas.file, fileSystemProvider);

		// Stub out all services
		instantiationService.stub(IEditSessionsLogService, logService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IEditSessionsWorkbenchService, new class extends mock<IEditSessionsWorkbenchService>() { });
		instantiationService.stub(IProgressService, ProgressService);
		instantiationService.stub(ISCMService, SCMService);
		instantiationService.stub(IEnvironmentService, TestEnvironmentService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ workbench: { experimental: { editSessions: { enabled: true } } } }));
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspace() {
				return {
					id: 'workspace-id',
					folders: [{
						uri: folderUri,
						name: folderName,
						index: 0,
						toResource: (relativePath: string) => joinPath(folderUri, relativePath)
					}]
				};
			}
		});

		// Stub repositories
		instantiationService.stub(ISCMService, '_repositories', new Map());

		editSessionsContribution = instantiationService.createInstance(EditSessionsContribution);
	});

	teardown(() => {
		sinon.restore();
		disposables.clear();
	});

	test('Can apply edit session', async function () {
		const fileUri = joinPath(folderUri, 'dir1', 'README.md');
		const fileContents = '# readme';
		const editSession = {
			version: 1,
			folders: [
				{
					name: folderName,
					workingChanges: [
						{
							relativeFilePath: 'dir1/README.md',
							fileType: FileType.File,
							contents: fileContents,
							type: ChangeType.Addition
						}
					]
				}
			]
		};

		// Stub sync service to return edit session data
		const readStub = sandbox.stub().returns({ editSession, ref: '0' });
		instantiationService.stub(IEditSessionsWorkbenchService, 'read', readStub);

		// Create root folder
		await fileService.createFolder(folderUri);

		// Apply edit session
		await editSessionsContribution.applyEditSession();

		// Verify edit session was correctly applied
		assert.equal((await fileService.readFile(fileUri)).value.toString(), fileContents);
	});

	test('Edit session not stored if there are no edits', async function () {
		const writeStub = sandbox.stub();
		instantiationService.stub(IEditSessionsWorkbenchService, 'write', writeStub);

		// Create root folder
		await fileService.createFolder(folderUri);

		await editSessionsContribution.storeEditSession(true);

		// Verify that we did not attempt to write the edit session
		assert.equal(writeStub.called, false);
	});
});
