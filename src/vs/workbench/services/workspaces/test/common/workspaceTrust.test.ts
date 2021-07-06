/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from 'vs/base/test/common/mock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { Memento } from 'vs/workbench/common/memento';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { WorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { TestContextService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('Workspace Trust', () => {
	let testObject: WorkspaceTrustManagementService;

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let environmentService: IWorkbenchEnvironmentService;
	let storageService: TestStorageService;
	let workspaceService: TestContextService;

	setup(async () => {
		instantiationService = new TestInstantiationService();

		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		await configurationService.setUserConfiguration('security', getUserSettings());

		storageService = new TestStorageService();
		instantiationService.stub(IStorageService, storageService);

		workspaceService = new TestContextService();
		instantiationService.stub(IWorkspaceContextService, workspaceService);

		environmentService = { configuration: {} } as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);

		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() { });
		instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() { });
	});

	teardown(() => {
		testObject.dispose();
		Memento.clear(StorageScope.WORKSPACE);
	});

	suite('Initialization', () => {
		test('workspace trust disabled (user settings)', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(false));

			testObject = await initializeTestObject();
			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('workspace trust disabled (--disable-workspace-trust)', async () => {
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService, disableWorkspaceTrust: true });

			testObject = await initializeTestObject();
			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - trusted', async () => {
			workspaceService.setWorkspace(new Workspace('empty-workspace'));

			testObject = await initializeTestObject();
			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - untrusted', async () => {
			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			await configurationService.setUserConfiguration('security', getUserSettings(true, false));

			testObject = await initializeTestObject();
			assert.strictEqual(false, testObject.isWorkspaceTrusted());
		});

		// test('empty workspace - trusted, open trusted file', () => {
		// });

		// test('empty workspace - trusted, open untrusted file', () => {
		// });

		// test('empty workspace - trusted, open untitled trusted file', () => {
		// });

		// test('empty workspace - trusted, open untitled untrusted file', () => {
		// });
	});

	async function initializeTestObject(): Promise<WorkspaceTrustManagementService> {
		const workspaceTrustManagementService = instantiationService.createInstance(WorkspaceTrustManagementService);
		await workspaceTrustManagementService.workspaceTrustInitialized;

		return workspaceTrustManagementService;
	}

	function getUserSettings(enabled: boolean = true, emptyWindow: boolean = true) {
		return { workspace: { trust: { emptyWindow, enabled } } };
	}
});
