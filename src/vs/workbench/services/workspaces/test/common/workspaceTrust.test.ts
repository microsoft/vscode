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
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustInfo } from '../../../../../platform/workspace/common/workspaceTrust.js';
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

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let environmentService: IWorkbenchEnvironmentService;

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());

		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		environmentService = {} as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);

		const fileService = store.add(new FileService(new NullLogService()));
		const uriIdentityService = store.add(new UriIdentityService(fileService));

		instantiationService.stub(IUriIdentityService, uriIdentityService);
		instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock<IRemoteAuthorityResolverService>() { });
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
		let storageService: TestStorageService;
		let workspaceService: TestContextService;

		teardown(() => {
			Memento.clear(StorageScope.WORKSPACE);
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
			const trustInfo: IWorkspaceTrustInfo = { uriTrustInfo: [{ uri: URI.parse('file:///Folder'), trusted: true }] };
			storageService.store(WORKSPACE_TRUST_STORAGE_KEY, JSON.stringify(trustInfo), StorageScope.APPLICATION, StorageTarget.MACHINE);

			(environmentService as any).filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/file.txt') }];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			assert.strictEqual(true, testObject.isWorkspaceTrusted());
		});

		test('empty workspace - trusted, open untrusted file', async () => {
			await configurationService.setUserConfiguration('security', getUserSettings(true, true));

			(environmentService as any).filesToOpenOrCreate = [{ fileUri: URI.parse('file:///Folder/foo.txt') }];
			instantiationService.stub(IWorkbenchEnvironmentService, { ...environmentService });

			workspaceService.setWorkspace(new Workspace('empty-workspace'));
			const testObject = await initializeTestObject();

			assert.strictEqual(false, testObject.isWorkspaceTrusted());
		});

		async function initializeTestObject(): Promise<WorkspaceTrustManagementService> {
			const workspaceTrustManagementService = store.add(instantiationService.createInstance(WorkspaceTrustManagementService));
			await workspaceTrustManagementService.workspaceTrustInitialized;

			return workspaceTrustManagementService;
		}
	});

	function getUserSettings(enabled: boolean, emptyWindow: boolean) {
		return { workspace: { trust: { emptyWindow, enabled } } };
	}
});
