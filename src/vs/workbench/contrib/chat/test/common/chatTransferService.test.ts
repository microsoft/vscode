/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspace } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatTransferService } from '../../common/model/chatTransferService.js';

const TRANSFERRED_WORKSPACES_KEY = 'chat.transferedWorkspaces';
const WORKSPACE = URI.file('/transferred-workspace');

suite('ChatTransferService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): { service: ChatTransferService; storage: IStorageService; trustCalls: boolean[] } {
		const storage = disposables.add(new InMemoryStorageService());
		const trustCalls: boolean[] = [];

		const workspaceService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace {
				return { id: 'test', folders: [{ uri: WORKSPACE, name: 'w', index: 0, toResource: () => WORKSPACE }], transient: false, configuration: null } as unknown as IWorkspace;
			}
		};

		// An empty folder, which is the state the transfer flow expects.
		const fileService = new class extends mock<IFileService>() {
			override async resolve(): Promise<any> {
				return { children: [] };
			}
		};

		const workspaceTrustManagementService = new class extends mock<IWorkspaceTrustManagementService>() {
			override async setWorkspaceTrust(trusted: boolean): Promise<void> {
				trustCalls.push(trusted);
			}
		};

		const service = new ChatTransferService(workspaceService, storage, fileService, workspaceTrustManagementService);
		return { service, storage, trustCalls };
	}

	test('a workspace this machine recorded is trusted on open', async () => {
		const { service, storage, trustCalls } = createService();
		service.addWorkspaceToTransferred(WORKSPACE);

		// The record is machine-local by construction.
		assert.ok(storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE).includes(TRANSFERRED_WORKSPACES_KEY));

		await service.checkAndSetTransferredWorkspaceTrust();

		assert.deepStrictEqual(trustCalls, [true]);
	});

	test('a list arriving at USER target does not grant trust', async () => {
		const { service, storage, trustCalls } = createService();

		// This is the shape applying profile content produces: the same key and
		// value, written at USER target rather than recorded by this machine.
		storage.store(TRANSFERRED_WORKSPACES_KEY, JSON.stringify([WORKSPACE.toString()]), StorageScope.PROFILE, StorageTarget.USER);

		await service.checkAndSetTransferredWorkspaceTrust();

		assert.deepStrictEqual(trustCalls, [], 'a USER target value must not stand in for this machine\'s own record');
	});

	test('a USER target value cannot overwrite a machine record into being accepted', async () => {
		const { service, storage, trustCalls } = createService();
		service.addWorkspaceToTransferred(URI.file('/some-other-workspace'));

		// Re-writing the key at USER target moves the key's target with it.
		storage.store(TRANSFERRED_WORKSPACES_KEY, JSON.stringify([WORKSPACE.toString()]), StorageScope.PROFILE, StorageTarget.USER);

		await service.checkAndSetTransferredWorkspaceTrust();

		assert.deepStrictEqual(trustCalls, []);
	});

	test('an unrelated workspace is not trusted', async () => {
		const { service, trustCalls } = createService();
		service.addWorkspaceToTransferred(URI.file('/some-other-workspace'));

		await service.checkAndSetTransferredWorkspaceTrust();

		assert.deepStrictEqual(trustCalls, []);
	});

	test('no record at all does not grant trust', async () => {
		const { service, trustCalls } = createService();

		await service.checkAndSetTransferredWorkspaceTrust();

		assert.deepStrictEqual(trustCalls, []);
	});
});
