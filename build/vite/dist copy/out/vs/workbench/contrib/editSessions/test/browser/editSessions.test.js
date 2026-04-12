/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { EditSessionsContribution } from '../../browser/editSessions.contribution.js';
import { ProgressService } from '../../../../services/progress/browser/progressService.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ISCMService } from '../../../scm/common/scm.js';
import { SCMService } from '../../../scm/common/scmService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { mock } from '../../../../../base/test/common/mock.js';
import * as sinon from 'sinon';
import assert from 'assert';
import { ChangeType, FileType, IEditSessionsLogService, IEditSessionsStorageService } from '../../common/editSessions.js';
import { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { Event } from '../../../../../base/common/event.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IEditSessionIdentityService } from '../../../../../platform/workspace/common/editSessions.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceIdentityService, WorkspaceIdentityService } from '../../../../services/workspaces/common/workspaceIdentityService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const folderName = 'test-folder';
const folderUri = URI.file(`/${folderName}`);
suite('Edit session sync', () => {
    let instantiationService;
    let editSessionsContribution;
    let fileService;
    let sandbox;
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
        instantiationService.stub(ILifecycleService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onWillShutdown = Event.None;
            }
        });
        instantiationService.stub(INotificationService, new TestNotificationService());
        instantiationService.stub(IProductService, { 'editSessions.store': { url: 'https://test.com', canSwitch: true, authenticationProviders: {} } });
        instantiationService.stub(IStorageService, new TestStorageService());
        instantiationService.stub(IUriIdentityService, new UriIdentityService(fileService));
        instantiationService.stub(IEditSessionsStorageService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidSignIn = Event.None;
                this.onDidSignOut = Event.None;
            }
        });
        instantiationService.stub(IExtensionService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeExtensions = Event.None;
            }
        });
        instantiationService.stub(IProgressService, ProgressService);
        instantiationService.stub(ISCMService, SCMService);
        instantiationService.stub(IEnvironmentService, TestEnvironmentService);
        instantiationService.stub(ITelemetryService, NullTelemetryService);
        instantiationService.stub(IDialogService, new class extends mock() {
            async prompt(prompt) {
                const result = prompt.buttons?.[0].run({ checkboxChecked: false });
                return { result };
            }
            async confirm() {
                return { confirmed: false };
            }
        });
        instantiationService.stub(IRemoteAgentService, new class extends mock() {
            async getEnvironment() {
                return null;
            }
        });
        instantiationService.stub(IConfigurationService, new TestConfigurationService({ workbench: { experimental: { editSessions: { enabled: true } } } }));
        instantiationService.stub(IWorkspaceContextService, new class extends mock() {
            getWorkspace() {
                return {
                    id: 'workspace-id',
                    folders: [{
                            uri: folderUri,
                            name: folderName,
                            index: 0,
                            toResource: (relativePath) => joinPath(folderUri, relativePath)
                        }]
                };
            }
            getWorkbenchState() {
                return 2 /* WorkbenchState.FOLDER */;
            }
        });
        // Stub repositories
        instantiationService.stub(ISCMService, '_repositories', new Map());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IThemeService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidColorThemeChange = Event.None;
                this.onDidFileIconThemeChange = Event.None;
            }
        });
        instantiationService.stub(IViewDescriptorService, {
            onDidChangeLocation: Event.None
        });
        instantiationService.stub(ITextModelService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.registerTextModelContentProvider = () => ({ dispose: () => { } });
            }
        });
        instantiationService.stub(IEditorService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.saveAll = async (_options) => { return { success: true, editors: [] }; };
            }
        });
        instantiationService.stub(IEditSessionIdentityService, new class extends mock() {
            async getEditSessionIdentifier() {
                return 'test-identity';
            }
        });
        instantiationService.set(IWorkspaceIdentityService, instantiationService.createInstance(WorkspaceIdentityService));
        instantiationService.stub(IUserDataProfilesService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.defaultProfile = {
                    id: 'default',
                    name: 'Default',
                    isDefault: true,
                    location: URI.file('location'),
                    globalStorageHome: URI.file('globalStorageHome'),
                    settingsResource: URI.file('settingsResource'),
                    keybindingsResource: URI.file('keybindingsResource'),
                    tasksResource: URI.file('tasksResource'),
                    mcpResource: URI.file('mcp.json'),
                    snippetsHome: URI.file('snippetsHome'),
                    promptsHome: URI.file('promptsHome'),
                    extensionsResource: URI.file('extensionsResource'),
                    cacheHome: URI.file('cacheHome'),
                };
            }
        });
        editSessionsContribution = instantiationService.createInstance(EditSessionsContribution);
    });
    teardown(() => {
        sinon.restore();
        disposables.clear();
    });
    suiteTeardown(() => {
        disposables.dispose();
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
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0U2Vzc2lvbnMvdGVzdC9icm93c2VyL2VkaXRTZXNzaW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUNoSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFrQixNQUFNLHVEQUF1RCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxJQUFJLEVB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