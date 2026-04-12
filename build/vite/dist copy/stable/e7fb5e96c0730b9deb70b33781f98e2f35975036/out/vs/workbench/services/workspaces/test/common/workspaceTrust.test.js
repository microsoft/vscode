/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { Memento } from '../../../../common/memento.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService, WORKSPACE_TRUST_STORAGE_KEY } from '../../common/workspaceTrust.js';
import { TestContextService, TestStorageService, TestWorkspaceTrustEnablementService } from '../../../../test/common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('Workspace Trust', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let environmentService;
    setup(async () => {
        instantiationService = store.add(new TestInstantiationService());
        configurationService = new TestConfigurationService();
        instantiationService.stub(IConfigurationService, configurationService);
        environmentService = {};
        instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
        const fileService = store.add(new FileService(new NullLogService()));
        const uriIdentityService = store.add(new UriIdentityService(fileService));
        instantiationService.stub(IUriIdentityService, uriIdentityService);
        instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock() {
        });
    });
    suite('Enablement', () => {
        test('workspace trust enabled', async () => {
            await configurationService.setUserConfiguration('security', getUserSettings(true, true));
            const testObject = store.add(instantiationService.createInstance(WorkspaceTrustEnablementService));
            assert.strictEqual(testObject.isWorkspaceTrustEnabled(), true);
        });
        test('workspace trust disabled (user setting)', async () => {
            await configurationService.setUserConfiguration('security', getUserSettings(false, true));
            const testObject = store.add(instantiationService.createInstance(WorkspaceTrustEnablementService));
            assert.strictEqual(testObject.isWorkspaceTrustEnabled(), false);
        });
        test('workspace trust disabled (--disable-workspace-trust)', () => {
            instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService, disableWorkspaceTrust: true });
            const testObject = store.add(instantiationService.createInstance(WorkspaceTrustEnablementService));
            assert.strictEqual(testObject.isWorkspaceTrustEnabled(), false);
        });
    });
    suite('Management', () => {
        let storageService;
        let workspaceService;
        teardown(() => {
            Memento.clear(1 /* StorageScope.WORKSPACE */);
        });
        setup(() => {
            storageService = store.add(new TestStorageService());
            instantiationService.stub(IStorageService, storageService);
            workspaceService = new TestContextService();
            instantiationService.stub(IWorkspaceContextService, workspaceService);
            instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());
        });
        test('empty workspace - trusted', async () => {
            await configurationService.setUserConfiguration('security', getUserSettings(true, true));
            workspaceService.setWorkspace(new Workspace('empty-workspace'));
            const testObject = await initializeTestObject();
            assert.strictEqual(true, testObject.isWorkspaceTrusted());
        });
        test('empty workspace - untrusted', async () => {
            await configurationService.setUserConfiguration('security', getUserSettings(true, false));
            workspaceService.setWorkspace(new Workspace('empty-workspace'));
            const testObject = await initializeTestObject();
            assert.strictEqual(false, testObject.isWorkspaceTrusted());
        });
        test('empty workspace - trusted, open trusted file', async () => {
            await configurationService.setUserConfiguration('security', getUserSettings(true, true));
            const trustInfo = { uriTrustInfo: [{ uri: URI.parse('file:///Folder'), trusted: true }] };
            storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            environmentService.filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/file.txt') }];
            instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });
            workspaceService.setWorkspace(new Workspace('empty-workspace'));
            const testObject = await initializeTestObject();
            assert.strictEqual(true, testObject.isWorkspaceTrusted());
        });
        test('empty workspace - trusted, open untrusted file', async () => {
            await configurationService.setUserConfiguration('security', getUserSettings(true, true));
            environmentService.filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/foo.txt') }];
            instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });
            workspaceService.setWorkspace(new Workspace('empty-workspace'));
            const testObject = await initializeTestObject();
            assert.strictEqual(false, testObject.isWorkspaceTrusted());
        });
        async function initializeTestObject() {
            const workspaceTrustManagementService = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
            await workspaceTrustManagementService.workspaceTrustInitialized;
            return workspaceTrustManagementService;
        }
    });
    function getUserSettings(enabled, emptyWindow) {
        return { workspace: { trust: { emptyWindow, enabled } } };
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVHJ1c3QudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL3Rlc3QvY29tbW9uL3dvcmtzcGFjZVRydXN0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNuSCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBdUIsTUFBTSw0REFBNEQsQ0FBQztBQUNuSSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDM0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSwrQkFBK0IsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQy9JLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR25HLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxrQkFBeUQsQ0FBQztJQUU5RCxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDaEIsb0JBQW9CLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUVqRSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7UUFDdEQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFdkUsa0JBQWtCLEdBQUcsRUFBa0MsQ0FBQztRQUN4RCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUU1RSxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksV0FBVyxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFMUUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDbkUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLCtCQUErQixFQUFFLElBQUksS0FBTSxTQUFRLElBQUksRUFBbUM7U0FBSSxDQUFDLENBQUM7SUFDM0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtRQUN4QixJQUFJLENBQUMseUJBQXlCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDMUMsTUFBTSxvQkFBb0IsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3pGLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQztZQUVuRyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFELE1BQU0sb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxRixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7WUFFbkcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzREFBc0QsRUFBRSxHQUFHLEVBQUU7WUFDakUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEVBQUUsR0FBRyxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2hILE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQztZQUVuRyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtRQUN4QixJQUFJLGNBQWtDLENBQUM7UUFDdkMsSUFBSSxnQkFBb0MsQ0FBQztRQUV6QyxRQUFRLENBQUMsR0FBRyxFQUFFO1lBQ2IsT0FBTyxDQUFDLEtBQUssZ0NBQXdCLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsR0FBRyxFQUFFO1lBQ1YsY0FBYyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7WUFDckQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUUzRCxnQkFBZ0IsR0FBRyxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDNUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFFdEUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLElBQUksbUNBQW1DLEVBQUUsQ0FBQyxDQUFDO1FBQ3hHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVDLE1BQU0sb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RixnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsSUFBSSxTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sVUFBVSxHQUFHLE1BQU0sb0JBQW9CLEVBQUUsQ0FBQztZQUVoRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzlDLE1BQU0sb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUMxRixnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsSUFBSSxTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sVUFBVSxHQUFHLE1BQU0sb0JBQW9CLEVBQUUsQ0FBQztZQUVoRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBQzVELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQy9ELE1BQU0sb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RixNQUFNLFNBQVMsR0FBd0IsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUMvRyxjQUFjLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLG1FQUFrRCxDQUFDO1lBRTlILGtCQUFrQixDQUFDLG1CQUFtQixHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3RixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxHQUFHLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUVuRixnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsSUFBSSxTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sVUFBVSxHQUFHLE1BQU0sb0JBQW9CLEVBQUUsQ0FBQztZQUVoRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2pFLE1BQU0sb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUV6RixrQkFBa0IsQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEVBQUUsR0FBRyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7WUFFbkYsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLElBQUksU0FBUyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUNoRSxNQUFNLFVBQVUsR0FBRyxNQUFNLG9CQUFvQixFQUFFLENBQUM7WUFFaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUM1RCxDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssVUFBVSxvQkFBb0I7WUFDbEMsTUFBTSwrQkFBK0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7WUFDeEgsTUFBTSwrQkFBK0IsQ0FBQyx5QkFBeUIsQ0FBQztZQUVoRSxPQUFPLCtCQUErQixDQUFDO1FBQ3hDLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILFNBQVMsZUFBZSxDQUFDLE9BQWdCLEVBQUUsV0FBb0I7UUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDM0QsQ0FBQztBQUNGLENBQUMsQ0FBQyxDQUFDIn0=