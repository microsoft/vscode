/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceKey, IUserDataSyncStoreService, SyncSource, SyncStatus } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { AbstractSynchroniser, IRemoteUserData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { Barrier } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';

class TestSynchroniser extends AbstractSynchroniser {

	syncBarrier: Barrier = new Barrier();
	onDoSyncCall: Emitter<void> = this._register(new Emitter<void>());

	readonly resourceKey: ResourceKey = 'settings';
	protected readonly version: number = 1;

	protected async doSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<void> {
		try {
			this.onDoSyncCall.fire();
			await this.syncBarrier.wait();
			const ref = await this.updateRemote(remoteUserData.ref);
			await this.updateLastSyncUserData({ ref, syncData: { content: '', version: this.version } });
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async updateRemote(ref: string): Promise<string> {
		return this.userDataSyncStoreService.write(this.resourceKey, '', ref);
	}

}

suite('TestSynchronizer', () => {

	const disposableStore = new DisposableStore();
	const server = new UserDataSyncTestServer();
	let client: UserDataSyncClient;
	let userDataSyncStoreService: IUserDataSyncStoreService;

	setup(async () => {
		client = disposableStore.add(new UserDataSyncClient(server));
		await client.setUp();
		userDataSyncStoreService = client.instantiationService.get(IUserDataSyncStoreService);
		disposableStore.add(toDisposable(() => userDataSyncStoreService.clear()));
	});

	teardown(() => disposableStore.clear());

	test('request latest data on precondition failure', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncSource.Settings);
		// Sync once
		testObject.syncBarrier.open();
		await testObject.sync();
		testObject.syncBarrier = new Barrier();

		// update remote data before syncing so that 412 is thrown by server
		const disposable = testObject.onDoSyncCall.event(async () => {
			disposable.dispose();
			await testObject.updateRemote(ref);
			server.reset();
			testObject.syncBarrier.open();
		});

		// Start sycing
		const { ref } = await userDataSyncStoreService.read(testObject.resourceKey, null);
		await testObject.sync(ref);

		assert.deepEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resourceKey}`, headers: { 'If-Match': ref } },
			{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resourceKey}/latest`, headers: {} },
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resourceKey}`, headers: { 'If-Match': `${parseInt(ref) + 1}` } },
		]);
	});


});
