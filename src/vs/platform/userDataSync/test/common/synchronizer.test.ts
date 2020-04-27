/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUserDataSyncStoreService, SyncResource, SyncStatus, IUserDataSyncEnablementService, ISyncPreviewResult } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { AbstractSynchroniser, IRemoteUserData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { Barrier } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';

class TestSynchroniser extends AbstractSynchroniser {

	syncBarrier: Barrier = new Barrier();
	syncResult: { status?: SyncStatus, error?: boolean } = {};
	onDoSyncCall: Emitter<void> = this._register(new Emitter<void>());

	readonly resource: SyncResource = SyncResource.Settings;
	protected readonly version: number = 1;

	private cancelled: boolean = false;

	protected async performSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<SyncStatus> {
		this.cancelled = false;
		this.onDoSyncCall.fire();
		await this.syncBarrier.wait();

		if (this.cancelled) {
			return SyncStatus.Idle;
		}

		if (this.syncResult.error) {
			throw new Error('failed');
		}

		await this.apply(remoteUserData.ref);
		return this.syncResult.status || SyncStatus.Idle;
	}

	async apply(ref: string): Promise<void> {
		ref = await this.userDataSyncStoreService.write(this.resource, '', ref);
		await this.updateLastSyncUserData({ ref, syncData: { content: '', version: this.version } });
	}

	async stop(): Promise<void> {
		this.cancelled = true;
		this.syncBarrier.open();
	}

	protected async generatePreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<ISyncPreviewResult> {
		return { hasLocalChanged: false, hasRemoteChanged: false };
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

	test('status is syncing', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

		const promise = Event.toPromise(testObject.onDoSyncCall.event);

		testObject.sync();
		await promise;

		assert.deepEqual(actual, [SyncStatus.Syncing]);
		assert.deepEqual(testObject.status, SyncStatus.Syncing);

		testObject.stop();
	});

	test('status is set correctly when sync is finished', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncBarrier.open();

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync();

		assert.deepEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
		assert.deepEqual(testObject.status, SyncStatus.Idle);
	});

	test('status is set correctly when sync has conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { status: SyncStatus.HasConflicts };
		testObject.syncBarrier.open();

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync();

		assert.deepEqual(actual, [SyncStatus.Syncing, SyncStatus.HasConflicts]);
		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
	});

	test('status is set correctly when sync has errors', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { error: true };
		testObject.syncBarrier.open();

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

		try {
			await testObject.sync();
			assert.fail('Should fail');
		} catch (e) {
			assert.deepEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
			assert.deepEqual(testObject.status, SyncStatus.Idle);
		}
	});

	test('sync should not run if syncing already', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		const promise = Event.toPromise(testObject.onDoSyncCall.event);

		testObject.sync();
		await promise;

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync();

		assert.deepEqual(actual, []);
		assert.deepEqual(testObject.status, SyncStatus.Syncing);

		testObject.stop();
	});

	test('sync should not run if disabled', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		client.instantiationService.get(IUserDataSyncEnablementService).setResourceEnablement(testObject.resource, false);

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

		await testObject.sync();

		assert.deepEqual(actual, []);
		assert.deepEqual(testObject.status, SyncStatus.Idle);
	});

	test('sync should not run if there are conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { status: SyncStatus.HasConflicts };
		testObject.syncBarrier.open();
		await testObject.sync();

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync();

		assert.deepEqual(actual, []);
		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
	});

	test('request latest data on precondition failure', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		// Sync once
		testObject.syncBarrier.open();
		await testObject.sync();
		testObject.syncBarrier = new Barrier();

		// update remote data before syncing so that 412 is thrown by server
		const disposable = testObject.onDoSyncCall.event(async () => {
			disposable.dispose();
			await testObject.apply(ref);
			server.reset();
			testObject.syncBarrier.open();
		});

		// Start sycing
		const { ref } = await userDataSyncStoreService.read(testObject.resource, null);
		await testObject.sync(ref);

		assert.deepEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': ref } },
			{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': `${parseInt(ref) + 1}` } },
		]);
	});


});
