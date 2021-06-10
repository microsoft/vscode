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
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Workspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { WorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { TestContextService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('Workspace Trust', () => {
	let testObject: WorkspaceTrustManagementService;
	let instantiationService: TestInstantiationService;
	let testConfigurationService: TestConfigurationService;
	let testEnvironmentService: IWorkbenchEnvironmentService;
	let testStorageService: TestStorageService;
	let testWorkspaceService: TestContextService;

	setup(async () => {
		instantiationService = new TestInstantiationService();

		testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);
		await testConfigurationService.setUserConfiguration('security', getUserSettings());

		testStorageService = new TestStorageService();
		instantiationService.stub(IStorageService, testStorageService);

		testWorkspaceService = new TestContextService();
		instantiationService.stub(IWorkspaceContextService, testWorkspaceService);

		testEnvironmentService = { configuration: {} } as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, testEnvironmentService);

		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() { });
		instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() { });
	});

	teardown(() => testObject.dispose());

	suite('Initialization', () => {
		test.only('workspace trust disabled (user settings)', async () => {
			await testConfigurationService.setUserConfiguration('security', getUserSettings(false));

			testObject = await initializeTestObject();
			assert.strictEqual(true, testObject.isWorkpaceTrusted());
		});

		test('workspace trust disabled (--disable-workspace-trust)', async () => {
			instantiationService.stub(IWorkbenchEnvironmentService, { ...testEnvironmentService, disableWorkspaceTrust: true });

			testObject = await initializeTestObject();
			assert.strictEqual(true, testObject.isWorkpaceTrusted());
		});

		test('empty workspace - trusted, no open files', async () => {
			const workspace = new Workspace('empty-workspace');
			testWorkspaceService.setWorkspace(workspace);

			testObject = await initializeTestObject();
			assert.strictEqual(true, testObject.isWorkpaceTrusted());
		});

		test('empty workspace - untrusted, no open files', async () => {
			await testConfigurationService.setUserConfiguration('security', getUserSettings(true, false));

			const workspace = new Workspace('empty-workspace');
			testWorkspaceService.setWorkspace(workspace);

			testObject = await initializeTestObject();
			assert.strictEqual(false, testObject.isWorkpaceTrusted());
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
