/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Barrier } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { isEqual, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { AbstractSynchroniser, IAcceptResult, IMergeResult, IResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { Change, IRemoteUserData, IResourcePreview as IBaseResourcePreview, IUserDataResourceManifest, IUserDataSyncConfiguration, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus, USER_DATA_SYNC_SCHEME } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';

interface ITestResourcePreview extends IResourcePreview {
	ref: string;
}

class TestSynchroniser extends AbstractSynchroniser {

	syncBarrier: Barrier = new Barrier();
	syncResult: { hasConflicts: boolean; hasError: boolean } = { hasConflicts: false, hasError: false };
	onDoSyncCall: Emitter<void> = this._register(new Emitter<void>());
	failWhenGettingLatestRemoteUserData: boolean = false;

	protected readonly version: number = 1;

	private cancelled: boolean = false;
	readonly localResource = joinPath(this.environmentService.userRoamingDataHome, 'testResource.json');

	getMachineId(): Promise<string> { return this.currentMachineIdPromise; }
	getLastSyncResource(): URI { return this.lastSyncResource; }

	protected override getLatestRemoteUserData(manifest: IUserDataResourceManifest | null, lastSyncUserData: IRemoteUserData | null): Promise<IRemoteUserData> {
		if (this.failWhenGettingLatestRemoteUserData) {
			throw new Error();
		}
		return super.getLatestRemoteUserData(manifest, lastSyncUserData);
	}

	protected override async doSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, apply: boolean, userDataSyncConfiguration: IUserDataSyncConfiguration): Promise<SyncStatus> {
		this.cancelled = false;
		this.onDoSyncCall.fire();
		await this.syncBarrier.wait();

		if (this.cancelled) {
			return SyncStatus.Idle;
		}

		return super.doSync(remoteUserData, lastSyncUserData, apply, userDataSyncConfiguration);
	}

	protected override async generateSyncPreview(remoteUserData: IRemoteUserData): Promise<ITestResourcePreview[]> {
		if (this.syncResult.hasError) {
			throw new Error('failed');
		}

		let fileContent = null;
		try {
			fileContent = await this.fileService.readFile(this.localResource);
		} catch (error) { }

		return [{
			baseResource: this.localResource.with(({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' })),
			baseContent: null,
			localResource: this.localResource,
			localContent: fileContent ? fileContent.value.toString() : null,
			remoteResource: this.localResource.with(({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' })),
			remoteContent: remoteUserData.syncData ? remoteUserData.syncData.content : null,
			previewResource: this.localResource.with(({ scheme: USER_DATA_SYNC_SCHEME, authority: 'preview' })),
			ref: remoteUserData.ref,
			localChange: Change.Modified,
			remoteChange: Change.Modified,
			acceptedResource: this.localResource.with(({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' })),
		}];
	}

	protected async hasRemoteChanged(lastSyncUserData: IRemoteUserData): Promise<boolean> {
		return true;
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
					localChange: content === null ? resourcePreview.localContent !== null ? Change.Deleted : Change.None : Change.Modified,
					remoteChange: content === null ? resourcePreview.remoteContent !== null ? Change.Deleted : Change.None : Change.Modified,
				};
			}
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [IResourcePreview, IAcceptResult][], force: boolean): Promise<void> {
		if (resourcePreviews[0][1].localChange === Change.Deleted) {
			await this.fileService.del(this.localResource);
		}

		if (resourcePreviews[0][1].localChange === Change.Added || resourcePreviews[0][1].localChange === Change.Modified) {
			await this.fileService.writeFile(this.localResource, VSBuffer.fromString(resourcePreviews[0][1].content!));
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

	override async stop(): Promise<void> {
		this.cancelled = true;
		this.syncBarrier.open();
		super.stop();
	}

	testTriggerLocalChange(): void {
		this.triggerLocalChange();
	}

	onDidTriggerLocalChangeCall: Emitter<void> = this._register(new Emitter<void>());
	protected override async doTriggerLocalChange(): Promise<void> {
		await super.doTriggerLocalChange();
		this.onDidTriggerLocalChangeCall.fire();
	}

	hasLocalData(): Promise<boolean> { throw new Error('not implemented'); }
	async resolveContent(uri: URI): Promise<string | null> { return null; }
}

suite('TestSynchronizer - Auto Sync', () => {

	const server = new UserDataSyncTestServer();
	let client: UserDataSyncClient;

	teardown(async () => {
		await client.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		client = disposableStore.add(new UserDataSyncClient(server));
		await client.setUp();
	});

	test('status is syncing', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));

			const actual: SyncStatus[] = [];
			disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

			const promise = Event.toPromise(testObject.onDoSyncCall.event);

			testObject.sync(await client.getResourceManifest());
			await promise;

			assert.deepStrictEqual(actual, [SyncStatus.Syncing]);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);

			testObject.stop();
		});
	});

	test('status is set correctly when sync is finished', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			const actual: SyncStatus[] = [];
			disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
			await testObject.sync(await client.getResourceManifest());

			assert.deepStrictEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		});
	});

	test('status is set correctly when sync has errors', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasError: true, hasConflicts: false };
			testObject.syncBarrier.open();

			const actual: SyncStatus[] = [];
			disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));

			try {
				await testObject.sync(await client.getResourceManifest());
				assert.fail('Should fail');
			} catch (e) {
				assert.deepStrictEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
				assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			}
		});
	});

	test('status is set to hasConflicts when asked to sync if there are conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());

			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
			assertConflicts(testObject.conflicts.conflicts, [testObject.localResource]);
		});
	});

	test('sync should not run if syncing already', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			const promise = Event.toPromise(testObject.onDoSyncCall.event);

			testObject.sync(await client.getResourceManifest());
			await promise;

			const actual: SyncStatus[] = [];
			disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
			await testObject.sync(await client.getResourceManifest());

			assert.deepStrictEqual(actual, []);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);

			await testObject.stop();
		});
	});

	test('sync should not run if there are conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const actual: SyncStatus[] = [];
			disposableStore.add(testObject.onDidChangeStatus(status => actual.push(status)));
			await testObject.sync(await client.getResourceManifest());

			assert.deepStrictEqual(actual, []);
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
		});
	});

	test('accept preview during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].previewResource);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const fileService = client.instantiationService.get(IFileService);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, (await fileService.readFile(testObject.localResource)).value.toString());
		});
	});

	test('accept remote during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());
			const fileService = client.instantiationService.get(IFileService);
			const currentRemoteContent = (await testObject.getRemoteUserData(null)).syncData?.content;
			const newLocalContent = 'conflict';
			await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));

			testObject.syncResult = { hasConflicts: true, hasError: false };
			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, currentRemoteContent);
			assert.strictEqual((await fileService.readFile(testObject.localResource)).value.toString(), currentRemoteContent);
		});
	});

	test('accept local during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());
			const fileService = client.instantiationService.get(IFileService);
			const newLocalContent = 'conflict';
			await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));

			testObject.syncResult = { hasConflicts: true, hasError: false };
			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].localResource);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, newLocalContent);
			assert.strictEqual((await fileService.readFile(testObject.localResource)).value.toString(), newLocalContent);
		});
	});

	test('accept new content during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());
			const fileService = client.instantiationService.get(IFileService);
			const newLocalContent = 'conflict';
			await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));

			testObject.syncResult = { hasConflicts: true, hasError: false };
			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			const mergeContent = 'newContent';
			await testObject.accept(testObject.conflicts.conflicts[0].previewResource, mergeContent);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, mergeContent);
			assert.strictEqual((await fileService.readFile(testObject.localResource)).value.toString(), mergeContent);
		});
	});

	test('accept delete during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());
			const fileService = client.instantiationService.get(IFileService);
			const newLocalContent = 'conflict';
			await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));

			testObject.syncResult = { hasConflicts: true, hasError: false };
			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, '');
			assert.ok(!(await fileService.exists(testObject.localResource)));
		});
	});

	test('accept deleted local during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());
			const fileService = client.instantiationService.get(IFileService);
			await fileService.del(testObject.localResource);

			testObject.syncResult = { hasConflicts: true, hasError: false };
			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].localResource);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, '');
			assert.ok(!(await fileService.exists(testObject.localResource)));
		});
	});

	test('accept deleted remote during conflicts', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			const fileService = client.instantiationService.get(IFileService);
			await fileService.writeFile(testObject.localResource, VSBuffer.fromString('some content'));
			testObject.syncResult = { hasConflicts: true, hasError: false };

			await testObject.sync(await client.getResourceManifest());
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertConflicts(testObject.conflicts.conflicts, []);

			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData, null);
			assert.ok(!(await fileService.exists(testObject.localResource)));
		});
	});

	test('request latest data on precondition failure', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			// Sync once
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());
			testObject.syncBarrier = new Barrier();

			// update remote data before syncing so that 412 is thrown by server
			const disposable = testObject.onDoSyncCall.event(async () => {
				disposable.dispose();
				await testObject.applyRef(ref, ref);
				server.reset();
				testObject.syncBarrier.open();
			});

			// Start sycing
			const manifest = await client.getResourceManifest();
			const ref = manifest![testObject.resource];
			await testObject.sync(await client.getResourceManifest());

			assert.deepStrictEqual(server.requests, [
				{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': ref } },
				{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
				{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': `${parseInt(ref) + 1}` } },
			]);
		});
	});

	test('no requests are made to server when local change is triggered', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			server.reset();
			const promise = Event.toPromise(testObject.onDidTriggerLocalChangeCall.event);
			testObject.testTriggerLocalChange();

			await promise;
			assert.deepStrictEqual(server.requests, []);
		});
	});

	test('status is reset when getting latest remote data fails', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.failWhenGettingLatestRemoteUserData = true;

			try {
				await testObject.sync(await client.getResourceManifest());
				assert.fail('Should throw an error');
			} catch (error) {
			}

			assert.strictEqual(testObject.status, SyncStatus.Idle);
		});
	});
});

suite('TestSynchronizer - Manual Sync', () => {

	const server = new UserDataSyncTestServer();
	let client: UserDataSyncClient;

	teardown(async () => {
		await client.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		client = disposableStore.add(new UserDataSyncClient(server));
		await client.setUp();
	});

	test('preview', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			const preview = await testObject.preview(await client.getResourceManifest(), {});

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preview -> merge', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preview -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preview -> merge -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].localResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preview -> merge -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const manifest = await client.getResourceManifest();
			let preview = await testObject.preview(manifest, {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);

			const expectedContent = manifest![testObject.resource];
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('preview -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const manifest = await client.getResourceManifest();
			const expectedContent = manifest![testObject.resource];
			let preview = await testObject.preview(manifest, {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);

			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('preview -> merge -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].localResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);

			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('preivew -> merge -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preivew -> merge -> discard -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preivew -> accept -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preivew -> accept -> discard -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preivew -> accept -> discard -> merge', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.merge(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preivew -> merge -> accept -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('preivew -> merge -> discard -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].localResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('preivew -> accept -> discard -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].localResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('preivew -> accept -> discard -> merge -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const manifest = await client.getResourceManifest();
			const expectedContent = manifest![testObject.resource];
			let preview = await testObject.preview(manifest, {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.merge(preview!.resourcePreviews[0].localResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);

			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('conflicts: preview', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			const preview = await testObject.preview(await client.getResourceManifest(), {});

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preview -> merge', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Conflict);
			assertConflicts(testObject.conflicts.conflicts, [preview!.resourcePreviews[0].localResource]);
		});
	});

	test('conflicts: preview -> merge -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			const preview = await testObject.preview(await client.getResourceManifest(), {});
			await testObject.merge(preview!.resourcePreviews[0].previewResource);
			await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preview -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			await testObject.merge(preview!.resourcePreviews[0].previewResource);
			const content = await testObject.resolveContent(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, content);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.deepStrictEqual(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preview -> merge -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			testObject.syncResult = { hasConflicts: true, hasError: false };
			const manifest = await client.getResourceManifest();
			const expectedContent = manifest![testObject.resource];
			let preview = await testObject.preview(manifest, {});

			await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);

			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('conflicts: preview -> accept 2', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			const content = await testObject.resolveContent(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, content);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preview -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			testObject.syncResult = { hasConflicts: true, hasError: false };
			const manifest = await client.getResourceManifest();
			const expectedContent = manifest![testObject.resource];
			let preview = await testObject.preview(manifest, {});

			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);

			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('conflicts: preivew -> merge -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preivew -> merge -> discard -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preivew -> accept -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preivew -> accept -> discard -> accept', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Accepted);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preivew -> accept -> discard -> merge', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.accept(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.merge(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Conflict);
			assertConflicts(testObject.conflicts.conflicts, [preview!.resourcePreviews[0].localResource]);
		});
	});

	test('conflicts: preivew -> merge -> discard -> merge', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: true, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.merge(preview!.resourcePreviews[0].remoteResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Conflict);
			assertConflicts(testObject.conflicts.conflicts, [preview!.resourcePreviews[0].localResource]);
		});
	});

	test('conflicts: preivew -> merge -> accept -> discard', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();

			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);

			assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
			assertPreviews(preview!.resourcePreviews, [testObject.localResource]);
			assert.strictEqual(preview!.resourcePreviews[0].mergeState, MergeState.Preview);
			assertConflicts(testObject.conflicts.conflicts, []);
		});
	});

	test('conflicts: preivew -> merge -> discard -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].localResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('conflicts: preivew -> accept -> discard -> accept -> apply', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncResult = { hasConflicts: false, hasError: false };
			testObject.syncBarrier.open();
			await testObject.sync(await client.getResourceManifest());

			const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
			let preview = await testObject.preview(await client.getResourceManifest(), {});
			preview = await testObject.merge(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].remoteResource);
			preview = await testObject.discard(preview!.resourcePreviews[0].previewResource);
			preview = await testObject.accept(preview!.resourcePreviews[0].localResource);
			preview = await testObject.apply(false);

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual(preview, null);
			assertConflicts(testObject.conflicts.conflicts, []);
			assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

	test('remote is accepted if last sync state does not exists in server', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());

			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp();
			const synchronizer2: TestSynchroniser = disposableStore.add(client2.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client2.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			synchronizer2.syncBarrier.open();
			const manifest = await client2.getResourceManifest();
			const expectedContent = manifest![testObject.resource];
			await synchronizer2.sync(manifest);

			await fileService.del(testObject.getLastSyncResource());
			await testObject.sync(await client.getResourceManifest());

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
		});
	});

});

suite('TestSynchronizer - Last Sync Data', () => {
	const server = new UserDataSyncTestServer();
	let client: UserDataSyncClient;

	teardown(async () => {
		await client.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		client = disposableStore.add(new UserDataSyncClient(server));
		await client.setUp();
	});

	test('last sync data is null when not synced before', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));

			const actual = await testObject.getLastSyncUserData();

			assert.strictEqual(actual, null);
		});
	});

	test('last sync data is set after sync', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			const machineId = await testObject.getMachineId();
			const actual = await testObject.getLastSyncUserData();

			assert.deepStrictEqual(storageService.get('settings.lastSyncUserData', StorageScope.APPLICATION), JSON.stringify({ ref: '1' }));
			assert.deepStrictEqual(JSON.parse((await fileService.readFile(testObject.getLastSyncResource())).value.toString()), { ref: '1', syncData: { version: 1, machineId, content: '0' } });
			assert.deepStrictEqual(actual, {
				ref: '1',
				syncData: {
					content: '0',
					machineId,
					version: 1
				},
			});
		});
	});

	test('last sync data is read from server after sync if last sync resource is deleted', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			const machineId = await testObject.getMachineId();
			await fileService.del(testObject.getLastSyncResource());
			const actual = await testObject.getLastSyncUserData();

			assert.deepStrictEqual(storageService.get('settings.lastSyncUserData', StorageScope.APPLICATION), JSON.stringify({ ref: '1' }));
			assert.deepStrictEqual(actual, {
				ref: '1',
				syncData: {
					content: '0',
					machineId,
					version: 1
				},
			});
		});
	});

	test('last sync data is read from server after sync and sync data is invalid', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			const machineId = await testObject.getMachineId();
			await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
				ref: '1',
				version: 1,
				content: JSON.stringify({
					content: '0',
					machineId,
					version: 1
				}),
				additionalData: {
					foo: 'bar'
				}
			})));
			server.reset();
			const actual = await testObject.getLastSyncUserData();

			assert.deepStrictEqual(storageService.get('settings.lastSyncUserData', StorageScope.APPLICATION), JSON.stringify({ ref: '1' }));
			assert.deepStrictEqual(actual, {
				ref: '1',
				syncData: {
					content: '0',
					machineId,
					version: 1
				},
			});
			assert.deepStrictEqual(server.requests, [{ headers: {}, type: 'GET', url: 'http://host:3000/v1/resource/settings/1' }]);
		});
	});

	test('last sync data is read from server after sync and stored sync data is tampered', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			const machineId = await testObject.getMachineId();
			await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
				ref: '2',
				syncData: {
					content: '0',
					machineId,
					version: 1
				}
			})));
			server.reset();
			const actual = await testObject.getLastSyncUserData();

			assert.deepStrictEqual(storageService.get('settings.lastSyncUserData', StorageScope.APPLICATION), JSON.stringify({ ref: '1' }));
			assert.deepStrictEqual(actual, {
				ref: '1',
				syncData: {
					content: '0',
					machineId,
					version: 1
				}
			});
			assert.deepStrictEqual(server.requests, [{ headers: {}, type: 'GET', url: 'http://host:3000/v1/resource/settings/1' }]);
		});
	});

	test('reading last sync data: no requests are made to server when sync data is invalid', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			const machineId = await testObject.getMachineId();
			await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
				ref: '1',
				version: 1,
				content: JSON.stringify({
					content: '0',
					machineId,
					version: 1
				}),
				additionalData: {
					foo: 'bar'
				}
			})));
			await testObject.getLastSyncUserData();
			server.reset();

			await testObject.getLastSyncUserData();
			assert.deepStrictEqual(server.requests, []);
		});
	});

	test('reading last sync data: no requests are made to server when sync data is null', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			server.reset();
			await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
				ref: '1',
				syncData: null,
			})));
			await testObject.getLastSyncUserData();

			assert.deepStrictEqual(server.requests, []);
		});
	});

	test('last sync data is null after sync if last sync state is deleted', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			storageService.remove('settings.lastSyncUserData', StorageScope.APPLICATION);
			const actual = await testObject.getLastSyncUserData();

			assert.strictEqual(actual, null);
		});
	});

	test('last sync data is null after sync if last sync content is deleted everywhere', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const fileService = client.instantiationService.get(IFileService);
			const userDataSyncStoreService = client.instantiationService.get(IUserDataSyncStoreService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			testObject.syncBarrier.open();

			await testObject.sync(await client.getResourceManifest());
			await fileService.del(testObject.getLastSyncResource());
			await userDataSyncStoreService.deleteResource(testObject.syncResource.syncResource, null);
			const actual = await testObject.getLastSyncUserData();

			assert.deepStrictEqual(storageService.get('settings.lastSyncUserData', StorageScope.APPLICATION), JSON.stringify({ ref: '1' }));
			assert.strictEqual(actual, null);
		});
	});

	test('last sync data is migrated', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const storageService = client.instantiationService.get(IStorageService);
			const fileService = client.instantiationService.get(IFileService);
			const testObject: TestSynchroniser = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, undefined));
			const machineId = await testObject.getMachineId();
			await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
				ref: '1',
				version: 1,
				content: JSON.stringify({
					content: '0',
					machineId,
					version: 1
				}),
				additionalData: {
					foo: 'bar'
				}
			})));

			const actual = await testObject.getLastSyncUserData();

			assert.deepStrictEqual(storageService.get('settings.lastSyncUserData', StorageScope.APPLICATION), JSON.stringify({
				ref: '1',
				version: 1,
				additionalData: {
					foo: 'bar'
				}
			}));
			assert.deepStrictEqual(actual, {
				ref: '1',
				version: 1,
				syncData: {
					content: '0',
					machineId,
					version: 1
				},
				additionalData: {
					foo: 'bar'
				}
			});
		});
	});
});

function assertConflicts(actual: IBaseResourcePreview[], expected: URI[]) {
	assert.deepStrictEqual(actual.map(({ localResource }) => localResource.toString()), expected.map(uri => uri.toString()));
}

function assertPreviews(actual: IBaseResourcePreview[], expected: URI[]) {
	assert.deepStrictEqual(actual.map(({ localResource }) => localResource.toString()), expected.map(uri => uri.toString()));
}
