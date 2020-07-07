/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUserDataSyncStoreService, SyncResource, SyncStatus, IUserDataSyncResourceEnablementService, IRemoteUserData, ISyncData, Change, USER_DATA_SYNC_SCHEME } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { AbstractSynchroniser, ISyncResourcePreview, IResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { Barrier } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';

interface ITestResourcePreview extends IResourcePreview {
	ref?: string;
}

const resource = URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority: 'testResource', path: `/current.json` });

class TestSynchroniser extends AbstractSynchroniser {

	syncBarrier: Barrier = new Barrier();
	syncResult: { hasConflicts: boolean, hasError: boolean } = { hasConflicts: false, hasError: false };
	onDoSyncCall: Emitter<void> = this._register(new Emitter<void>());

	readonly resource: SyncResource = SyncResource.Settings;
	protected readonly version: number = 1;

	private cancelled: boolean = false;

	protected async doSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<SyncStatus> {
		this.cancelled = false;
		this.onDoSyncCall.fire();
		await this.syncBarrier.wait();

		if (this.cancelled) {
			return SyncStatus.Idle;
		}

		return super.doSync(remoteUserData, lastSyncUserData);
	}

	protected async generatePullPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<ITestResourcePreview[]> {
		return [{ localContent: null, localResource: resource, remoteContent: null, remoteResource: resource, previewContent: null, previewResource: resource, localChange: Change.None, remoteChange: Change.None, hasConflicts: this.syncResult.hasConflicts }];
	}

	protected async generatePushPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<ITestResourcePreview[]> {
		return [{ localContent: null, localResource: resource, remoteContent: null, remoteResource: resource, previewContent: null, previewResource: resource, localChange: Change.None, remoteChange: Change.None, hasConflicts: this.syncResult.hasConflicts }];
	}

	protected async generateReplacePreview(syncData: ISyncData, remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<ITestResourcePreview[]> {
		return [{ localContent: null, localResource: resource, remoteContent: null, remoteResource: resource, previewContent: null, previewResource: resource, localChange: Change.None, remoteChange: Change.None, hasConflicts: this.syncResult.hasConflicts }];
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<ITestResourcePreview[]> {
		if (this.syncResult.hasError) {
			throw new Error('failed');
		}
		return [{ localContent: null, localResource: resource, remoteContent: null, remoteResource: resource, previewContent: null, previewResource: resource, localChange: Change.None, remoteChange: Change.None, hasConflicts: this.syncResult.hasConflicts, ref: remoteUserData.ref }];
	}

	protected async updatePreviewWithConflict(preview: ISyncResourcePreview, conflictResource: URI, conflictContent: string): Promise<ISyncResourcePreview> {
		return preview;
	}

	protected async applyPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, preview: ITestResourcePreview[], forcePush: boolean): Promise<void> {
		if (preview[0]?.ref) {
			await this.apply(preview[0].ref);
		}
	}

	async apply(ref: string): Promise<void> {
		const remoteUserData = await this.updateRemoteUserData('', ref);
		await this.updateLastSyncUserData(remoteUserData);
	}

	async stop(): Promise<void> {
		this.cancelled = true;
		this.syncBarrier.open();
		super.stop();
	}

	async triggerLocalChange(): Promise<void> {
		super.triggerLocalChange();
	}

	onDidTriggerLocalChangeCall: Emitter<void> = this._register(new Emitter<void>());
	protected async doTriggerLocalChange(): Promise<void> {
		await super.doTriggerLocalChange();
		this.onDidTriggerLocalChangeCall.fire();
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

		testObject.sync(await client.manifest());
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
		await testObject.sync(await client.manifest());

		assert.deepEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
		assert.deepEqual(testObject.status, SyncStatus.Idle);
	});

	test('status is set correctly when sync has conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync(await client.manifest());

		assert.deepEqual(actual, [SyncStatus.Syncing, SyncStatus.HasConflicts]);
		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
	});

	test('status is set correctly when sync has errors', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasError: true, hasConflicts: false };
		testObject.syncBarrier.open();

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

		try {
			await testObject.sync(await client.manifest());
			assert.fail('Should fail');
		} catch (e) {
			assert.deepEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
			assert.deepEqual(testObject.status, SyncStatus.Idle);
		}
	});

	test('sync should not run if syncing already', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		const promise = Event.toPromise(testObject.onDoSyncCall.event);

		testObject.sync(await client.manifest());
		await promise;

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync(await client.manifest());

		assert.deepEqual(actual, []);
		assert.deepEqual(testObject.status, SyncStatus.Syncing);

		testObject.stop();
	});

	test('sync should not run if disabled', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		client.instantiationService.get(IUserDataSyncResourceEnablementService).setResourceEnablement(testObject.resource, false);

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

		await testObject.sync(await client.manifest());

		assert.deepEqual(actual, []);
		assert.deepEqual(testObject.status, SyncStatus.Idle);
	});

	test('sync should not run if there are conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();
		await testObject.sync(await client.manifest());

		const actual: SyncStatus[] = [];
		disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
		await testObject.sync(await client.manifest());

		assert.deepEqual(actual, []);
		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
	});

	test('request latest data on precondition failure', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		// Sync once
		testObject.syncBarrier.open();
		await testObject.sync(await client.manifest());
		testObject.syncBarrier = new Barrier();

		// update remote data before syncing so that 412 is thrown by server
		const disposable = testObject.onDoSyncCall.event(async () => {
			disposable.dispose();
			await testObject.apply(ref);
			server.reset();
			testObject.syncBarrier.open();
		});

		// Start sycing
		const manifest = await client.manifest();
		const ref = manifest!.latest![testObject.resource];
		await testObject.sync(await client.manifest());

		assert.deepEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': ref } },
			{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': `${parseInt(ref) + 1}` } },
		]);
	});

	test('no requests are made to server when local change is triggered', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncBarrier.open();
		await testObject.sync(await client.manifest());

		server.reset();
		const promise = Event.toPromise(testObject.onDidTriggerLocalChangeCall.event);
		await testObject.triggerLocalChange();

		await promise;
		assert.deepEqual(server.requests, []);
	});


});
