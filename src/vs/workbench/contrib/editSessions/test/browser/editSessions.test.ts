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
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { mock } from 'vs/base/test/common/mock';
import * as sinon from 'sinon';
import assert from 'assert';
import { ChangeType, FileType, IEditSessionsLogService, IEditSessionsStorageService } from 'vs/workbench/contrib/editSessions/common/editSessions';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { TestEnvironmentService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Event } from 'vs/base/common/event';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IDialogService, IPrompt } from 'vs/platform/dialogs/common/dialogs';
import { IEditorService, ISaveAllEditorsOptions } from 'vs/workbench/services/editor/common/editorService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { IWorkspaceIdentityService, WorkspaceIdentityService } from 'vs/workbench/services/workspaces/common/workspaceIdentityService';

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
		instantiationService.stub(ILifecycleService, new class extends mock<ILifecycleService>() {
			override onWillShutdown = Event.None;
		});
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IProductService, { 'editSessions.store': { url: 'https://test.com', canSwitch: true, authenticationProviders: {} } });
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IUriIdentityService, new UriIdentityService(fileService));
		instantiationService.stub(IEditSessionsStorageService, new class extends mock<IEditSessionsStorageService>() {
			override onDidSignIn = Event.None;
			override onDidSignOut = Event.None;
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override onDidChangeExtensions = Event.None;
		});
		instantiationService.stub(IProgressService, ProgressService);
		instantiationService.stub(ISCMService, SCMService);
		instantiationService.stub(IEnvironmentService, TestEnvironmentService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async prompt(prompt: IPrompt<any>) {
				const result = prompt.buttons?.[0].run({ checkboxChecked: false });
				return { result };
			}
			override async confirm() {
				return { confirmed: false };
			}
		});
		instantiationService.stub(IRemoteAgentService, new class extends mock<IRemoteAgentService>() {
			override async getEnvironment() {
				return null;
			}
		});
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
			override getWorkbenchState() {
				return WorkbenchState.FOLDER;
			}
		});

		// Stub repositories
		instantiationService.stub(ISCMService, '_repositories', new Map());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IThemeService, new class extends mock<IThemeService>() {
			override onDidColorThemeChange = Event.None;
			override onDidFileIconThemeChange = Event.None;
		});
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None
		});
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
			override registerTextModelContentProvider = () => ({ dispose: () => { } });
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override saveAll = async (_options: ISaveAllEditorsOptions) => { return { success: true, editors: [] }; };
		});
		instantiationService.stub(IEditSessionIdentityService, new class extends mock<IEditSessionIdentityService>() {
			override async getEditSessionIdentifier() {
				return 'test-identity';
			}
		});
		instantiationService.set(IWorkspaceIdentityService, instantiationService.createInstance(WorkspaceIdentityService));
		instantiationService.stub(IUserDataProfilesService, new class extends mock<IUserDataProfilesService>() {
			override defaultProfile = {
				id: 'default',
				name: 'Default',
				isDefault: true,
				location: URI.file('location'),
				globalStorageHome: URI.file('globalStorageHome'),
				settingsResource: URI.file('settingsResource'),
				keybindingsResource: URI.file('keybindingsResource'),
				tasksResource: URI.file('tasksResource'),
				snippetsHome: URI.file('snippetsHome'),
				extensionsResource: URI.file('extensionsResource'),
				cacheHome: URI.file('cacheHome'),
			};
		});

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
		const readStub = sandbox.stub().returns({ content: JSON.stringify(editSession), ref: '0' });
		instantiationService.stub(IEditSessionsStorageService, 'read', readStub);

		// Create root folder
		await fileService.createFolder(folderUri);

		// Resume edit session
		await editSessionsContribution.resumeEditSession();

		// Verify edit session was correctly applied
		assert.equal((await fileService.readFile(fileUri)).value.toString(), fileContents);
	});

	test('Edit session not stored if there are no edits', async function () {
		const writeStub = sandbox.stub();
		instantiationService.stub(IEditSessionsStorageService, 'write', writeStub);

		// Create root folder
		await fileService.createFolder(folderUri);

		await editSessionsContribution.storeEditSession(true, CancellationToken.None);

		// Verify that we did not attempt to write the edit session
		assert.equal(writeStub.called, false);
	});
});
