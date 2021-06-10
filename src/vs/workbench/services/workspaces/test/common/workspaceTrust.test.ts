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
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { WorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { TestContextService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

suite('Workspace Trust', () => {
	let testObject: WorkspaceTrustManagementService;
	let instantiationService: TestInstantiationService;
	let testConfigurationService: TestConfigurationService;
	let testStorageService: TestStorageService;
	let testWorkspaceService: IWorkspaceContextService;

	setup(async () => {
		instantiationService = new TestInstantiationService();

		testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);
		await testConfigurationService.setUserConfiguration('security', { workspace: { trust: { enabled: true } } });

		testStorageService = new TestStorageService();
		instantiationService.stub(IStorageService, testStorageService);

		testWorkspaceService = new TestContextService();
		instantiationService.stub(IWorkspaceContextService, testWorkspaceService);

		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() { });
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() { });
		instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() { });
	});

	teardown(() => testObject.dispose());

	test('Initialization - workspace trust disabled (user settings)', async () => {
		await testConfigurationService.setUserConfiguration('security', { workspace: { trust: { enabled: false } } });

		testObject = instantiationService.createInstance(WorkspaceTrustManagementService);
		assert.strictEqual(true, testObject.isWorkpaceTrusted());
	});

	test('Initialization - workspace trust disabled (--disable-workspace-trust)', () => {
		const testEnvironmentService = { disableWorkspaceTrust: true } as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, testEnvironmentService);

		testObject = instantiationService.createInstance(WorkspaceTrustManagementService);
		assert.strictEqual(true, testObject.isWorkpaceTrusted());
	});
});
