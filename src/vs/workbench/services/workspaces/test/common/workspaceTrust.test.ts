/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { FileService } from 'vs/platform/files/common/fileService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NullLogService } from 'vs/platform/log/common/log';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustInfo } from 'vs/platform/workspace/common/workspaceTrust';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { Memento } from 'vs/workbench/common/memento';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService, WORKSPACE_TRUST_STORAGE_KEY } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { TestContextService, TestStorageService, TestWorkspaceTrustEnablementService } from 'vs/workbench/test/common/workbenchTestServices';

suite('Workspace Trust', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let environmentService: IWorkbenchEnvironmentService;

	setup(async () => {
		instantiationService = new TestInstantiationService();

		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		environmentService = {} as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);

		instantiationService.stub(IUriIdentityService, new UriIdentityService(new FileService(new NullLogService())));
		instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() { });
	});

	teardown(() => {
		instantiationService.dispose();
	});

	suite('Enablement', () => {
		let testObject: WorkspaceTrustEnablementService;

		teardown(() => testObject.dispose());

		test('workspace trust enabled', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			testObject = instantiationService.createInstance(WorkspaceTrustEnablementService);

			assert.strictEqual(testObject.isWorkspaceTrustEnabled(), true);
		});

		test('workspace trust disabled (user setting)', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(false, true));
			testObject = instantiationService.createInstance(WorkspaceTrustEnablementService);

			assert.strictEqual(testObject.isWorkspaceTrustEnabled(), false);
		});

		test('workspace trust disabled (--disable-workspace-trust)', () => {
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService, disableWorkspaceTrust: true });
			testObject = instantiationService.createInstance(WorkspaceTrustEnablementService);

			assert.strictEqual(testObject.isWorkspaceTrustEnabled(), false);
		});
	});

	suite('Management', () => {
		let testObject: WorkspaceTrustManagementService;

		let storageService: TestStorageService;
		let workspaceService: TestContextService;

		setup(() => {
			storageService = new TestStorageService();
			instantiationService.stub(IStorageService, storageService);

			workspaceService = new TestContextService();
			instantiationService.stub(IWorkspaceContextService, workspaceService);

			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());
		});

		teardown(() => {
			testObject.dispose();
			Memento.clear(StorageScope.WORKSPACE);
		});

		test('empty workspace - trusted', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - untrusted', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - trusted, open trusted file', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));
			const trustInfo: IWorkspaceTrustInfo = { uriTrustInfo: [{ uri: URI.parse('file:///Folder'), trusted: true }] };
			storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), StorageScope.APPLICATION, StorageTarget.MACHINE);

			(environmentService as any).filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/file.txt') }];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - trusted, open untrusted file', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));

			(environmentService as any).filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/foo.txt') }];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
		});

		async function initializeTestObject(): Promise<WorkspaceTrustManagementService> {
			const workspaceTrustManagementService = instantiationService.createInstance(WorkspaceTrustManagementService);
			await workspaceTrustManagementService.workspaceTrustInitialized;

			return workspaceTrustManagementService;
		}
	});

	function getUserSettings(enabled: boolean, emptyWindow: boolean) {
		return { workspace: { trust: { emptyWindow, enabled } } };
	}
});
