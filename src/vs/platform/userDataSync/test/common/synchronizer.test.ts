/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUserDataSyncStoreService, SyncResource, SyncStatus, IUserDataSyncResourceEnablementService, IRemoteUserData, Change, USER_DATA_SYNC_SCHEME, IUserDataManifest, MergeState, IResourcePreview as IBaseResourcePreview } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { AbstractSynchroniser, IAcceptResult, IMergeResult, IResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { Barrier } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { isEqual } from 'vs/base/common/resources';

const resource = URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local', path: `/testResource.json` });

interface ITestResourcePreview extends IResourcePreview {
	ref: string;
}

class TestSynchroniser extends AbstractSynchroniser {

	syncBarrier: Barrier = new Barrier();
	syncResult: { hasConflicts: boolean, hasError: boolean } = { hasConflicts: false, hasError: false };
	onDoSyncCall: Emitter<void> = this._register(new Emitter<void>());
	failWhenGettingLatestRemoteUserData: boolean = false;

	readonly resource: SyncResource = SyncResource.Settings;
	protected readonly version: number = 1;

	private cancelled: boolean = false;

	protected getLatestRemoteUserData(manifest: IUserDataManifest | null, lastSyncUserData: IRemoteUserData | null): Promise<IRemoteUserData> {
		if (this.failWhenGettingLatestRemoteUserData) {
			throw new Error();
		}
		return super.getLatestRemoteUserData(manifest, lastSyncUserData);
	}

	protected async doSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, apply: boolean): Promise<SyncStatus> {
		this.cancelled = false;
		this.onDoSyncCall.fire();
		await this.syncBarrier.wait();

		if (this.cancelled) {
			return SyncStatus.Idle;
		}

		return super.doSync(remoteUserData, lastSyncUserData, apply);
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<ITestResourcePreview[]> {
		if (this.syncResult.hasError) {
			throw new Error('failed');
		}

		let fileContent = null;
		try {
			fileContent = await this.fileService.readFile(resource);
		} catch (error) { }

		return [{
			localResource: resource,
			localContent: fileContent ? fileContent.value.toString() : null,
			remoteResource: resource.with(({ authority: 'remote' })),
			remoteContent: remoteUserData.syncData ? remoteUserData.syncData.content : null,
			previewResource: resource.with(({ authority: 'preview' })),
			ref: remoteUserData.ref,
			localChange: Change.Modified,
			remoteChange: Change.Modified,
		}];
	}

	protected async getMergeResult(resourcePreview: ITestResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return {
			content: resourcePreview.ref,
			localChange: Change.Modified,
			remoteChange: Change.Modified,
			hasConflicts: this.syncResult.hasConflicts,
		};
	}

	protected async getAcceptResult(resourcePreview: ITestResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IAcceptResult> {

		if (isEqual(resource, resourcePreview.localResource)) {
			return {
				content: resourcePreview.localContent,
				localChange: Change.None,
				remoteChange: resourcePreview.localContent === null ? Change.Deleted : Change.Modified,
			};
		}

		if (isEqual(resource, resourcePreview.remoteResource)) {
			return {
				content: resourcePreview.remoteContent,
				localChange: resourcePreview.remoteContent === null ? Change.Deleted : Change.Modified,
				remoteChange: Change.None,
			};
		}

		if (isEqual(resource, resourcePreview.previewResource)) {
			if (content === undefined) {
				return {
					content: resourcePreview.ref,
					localChange: Change.Modified,
					remoteChange: Change.Modified,
				};
			} else {
				return {
					content,
					localChange: content === null ? Change.Deleted : Change.Modified,
					remoteChange: content === null ? Change.Deleted : Change.Modified,
				};
			}
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [IResourcePreview, IAcceptResult][], force: boolean): Promise<void> {
		if (resourcePreviews[0][1].localChange === Change.Deleted) {
			await this.fileService.del(resource);
		}

		if (resourcePreviews[0][1].localChange === Change.Added || resourcePreviews[0][1].localChange === Change.Modified) {
			await this.fileService.writeFile(resource, VSBuffer.fromString(resourcePreviews[0][1].content!));
		}

		if (resourcePreviews[0][1].remoteChange === Change.Deleted) {
			await this.applyRef(null, remoteUserData.ref);
		}

		if (resourcePreviews[0][1].remoteChange === Change.Added || resourcePreviews[0][1].remoteChange === Change.Modified) {
			await this.applyRef(resourcePreviews[0][1].content, remoteUserData.ref);
		}
	}

	async applyRef(content: string | null, ref: string): Promise<void> {
		const remoteUserData = await this.updateRemoteUserData(content === null ? '' : content, ref);
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
		client.instantiationService.get(IFileService).registerProvider(USER_DATA_SYNC_SCHEME, new InMemoryFileSystemProvider());
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

	test('status is set to hasConflicts when asked to sync if there are conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		await testObject.sync(await client.manifest());

		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
		assertConflicts(testObject.conflicts, [resource]);
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

		await testObject.stop();
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
			await testObject.applyRef(ref, ref);
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

	test('status is reset when getting latest remote data fails', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.failWhenGettingLatestRemoteUserData = true;

		try {
			await testObject.sync(await client.manifest());
			assert.fail('Should throw an error');
		} catch (error) {
		}

		assert.equal(testObject.status, SyncStatus.Idle);
	});

	test('preview: status is set to syncing when asked for preview if there are no conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: false, hasError: false };
		testObject.syncBarrier.open();

		const preview = await testObject.preview(await client.manifest());

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is syncing after merging if there are no conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: false, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assert.equal(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is set to idle after merging and applying if there are no conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: false, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.apply(false);

		assert.deepEqual(testObject.status, SyncStatus.Idle);
		assert.equal(preview, null);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: discarding the merge', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: false, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assert.equal(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is syncing after accepting when there are no conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: false, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is set to idle and sync is applied after accepting when there are no conflicts before merging', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: false, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.apply(false);

		assert.deepEqual(testObject.status, SyncStatus.Idle);
		assert.equal(preview, null);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is set to syncing when asked for preview if there are conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		const preview = await testObject.preview(await client.manifest());

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is set to hasConflicts after merging', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);

		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assert.equal(preview!.resourcePreviews[0].mergeState, MergeState.Conflict);
		assertConflicts(testObject.conflicts, [preview!.resourcePreviews[0].localResource]);
	});

	test('preview: discarding the conflict', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		const preview = await testObject.preview(await client.manifest());
		await testObject.merge(preview!.resourcePreviews[0].previewResource);
		await testObject.discard(preview!.resourcePreviews[0].previewResource);

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assert.equal(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is syncing after accepting when there are conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		await testObject.merge(preview!.resourcePreviews[0].previewResource);
		const content = await testObject.resolveContent(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, content);

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assert.deepEqual(testObject.conflicts, []);
	});

	test('preview: status is set to idle and sync is applied after accepting when there are conflicts', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		await testObject.merge(preview!.resourcePreviews[0].previewResource);
		const content = await testObject.resolveContent(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, content);
		preview = await testObject.apply(false);

		assert.deepEqual(testObject.status, SyncStatus.Idle);
		assert.equal(preview, null);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is set to syncing after accepting when there are conflicts before merging', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		const content = await testObject.resolveContent(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, content);

		assert.deepEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews, [resource]);
		assertConflicts(testObject.conflicts, []);
	});

	test('preview: status is set to idle and sync is applied after accepting when there are conflicts before merging', async () => {
		const testObject: TestSynchroniser = client.instantiationService.createInstance(TestSynchroniser, SyncResource.Settings);
		testObject.syncResult = { hasConflicts: true, hasError: false };
		testObject.syncBarrier.open();

		let preview = await testObject.preview(await client.manifest());
		const content = await testObject.resolveContent(preview!.resourcePreviews[0].previewResource);
		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, content);
		preview = await testObject.apply(false);

		assert.deepEqual(testObject.status, SyncStatus.Idle);
		assert.equal(preview, null);
		assertConflicts(testObject.conflicts, []);
	});

	function assertConflicts(actual: IBaseResourcePreview[], expected: URI[]) {
		assert.deepEqual(actual.map(({ localResource }) => localResource.toString()), expected.map(uri => uri.toString()));
	}

	function assertPreviews(actual: IBaseResourcePreview[], expected: URI[]) {
		assert.deepEqual(actual.map(({ localResource }) => localResource.toString()), expected.map(uri => uri.toString()));
	}

});
