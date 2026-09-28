/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer, VSBufferReadable } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileDeleteOptions, IFileService, IFileStatWithMetadata, IWriteFileOptions } from '../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace, Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfileService.js';
import { IDidEnterWorkspaceEvent, IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { InMemoryTestFileService, TestContextService, TestLifecycleService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatModel, ISerializableChatData3 } from '../../../common/model/chatModel.js';
import { ChatSessionStore, IChatTransfer } from '../../../common/model/chatSessionStore.js';
import { ChatSessionOperationLog } from '../../../common/model/chatSessionOperationLog.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatModel } from './mockChatModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';

function createMockChatModel(sessionResource: URI, options?: { customTitle?: string }): ChatModel {
	const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
	if (!sessionId) {
		throw new Error('createMockChatModel requires a local session URI');
	}
	const model = new MockChatModel(sessionResource);
	model.sessionId = sessionId;
	if (options?.customTitle) {
		model.customTitle = options.customTitle;
	}
	// Cast to ChatModel - the mock implements enough of the interface for testing
	return model as unknown as ChatModel;
}

class TestChatSessionFileService extends InMemoryTestFileService {
	readonly deleteOperations: URI[] = [];
	beforeWrite: (() => Promise<void>) | undefined;

	override async writeFile(resource: URI, bufferOrReadable: VSBuffer | VSBufferReadable, options?: IWriteFileOptions): Promise<IFileStatWithMetadata> {
		await this.beforeWrite?.();
		return super.writeFile(resource, bufferOrReadable, options);
	}

	override async del(resource: URI, options?: IFileDeleteOptions): Promise<void> {
		this.deleteOperations.push(resource);
		await super.del(resource, options);
	}

	override async copy(source: URI, target: URI): Promise<IFileStatWithMetadata> {
		return this.writeFile(target, (await this.readFile(source)).value);
	}
}

suite('ChatSessionStore', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let fileService: TestChatSessionFileService;

	function createChatSessionStore(isEmptyWindow: boolean = false, workspaceOverride?: Workspace): ChatSessionStore {
		const workspace = workspaceOverride ?? (isEmptyWindow ? new Workspace('empty-window-id', []) : TestWorkspace);
		instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
		return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection()));
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		fileService = testDisposables.add(new TestChatSessionFileService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file('/test/workspaceStorage') });
		instantiationService.stub(ILifecycleService, testDisposables.add(new TestLifecycleService()));
		const profile = toUserDataProfile('default', 'Default', URI.file('/test/userdata'), URI.file('/test/cache'));
		instantiationService.stub(IUserDataProfilesService, { defaultProfile: profile });
		instantiationService.stub(IUserDataProfileService, testDisposables.add(new UserDataProfileService(profile)));
		instantiationService.stub(IWorkspaceEditingService, { onDidEnterWorkspace: Event.None });
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
	});

	test('hasSessions returns false when no sessions exist', () => {
		const store = createChatSessionStore();

		assert.strictEqual(store.hasSessions(), false);
	});

	test('getIndex returns empty index initially', async () => {
		const store = createChatSessionStore();

		const index = await store.getIndex();
		assert.deepStrictEqual(index, {});
	});

	test('getChatStorageFolder returns correct path for workspace', () => {
		const store = createChatSessionStore(false);

		const storageFolder = store.getChatStorageFolder();
		assert.ok(storageFolder.path.endsWith('/globalStorage/chatSessions/test-workspace'));
	});

	test('getChatStorageFolder returns correct path for empty window', () => {
		const store = createChatSessionStore(true);

		const storageFolder = store.getChatStorageFolder();
		assert.ok(storageFolder.path.endsWith('/globalStorage/chatSessions/empty-window-id'));
	});

	test('updates profile-owned storage when the active profile changes', async () => {
		const previous = toUserDataProfile('previous', 'Previous', URI.file('/test/previous'), URI.file('/test/cache'));
		const profile = toUserDataProfile('next', 'Next', URI.file('/test/next'), URI.file('/test/cache'));
		const profileService = testDisposables.add(new UserDataProfileService(previous));
		instantiationService.stub(IUserDataProfileService, profileService);
		const store = createChatSessionStore();

		await profileService.updateCurrentProfile(profile);

		assert.ok(store.getChatStorageFolder().path.endsWith('/test/next/globalStorage/chatSessions/test-workspace'));
	});

	test('drains pending session writes before changing profile storage', async () => {
		const profileService = instantiationService.get(IUserDataProfileService);
		const previous = profileService.currentProfile;
		const profile = toUserDataProfile('next', 'Next', URI.file('/test/next'), URI.file('/test/cache'));
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('pending-session')));
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		fileService.beforeWrite = async () => {
			await writeStarted.complete();
			await finishWrite.p;
		};
		const save = store.storeSessions([model]);
		await writeStarted.p;
		const change = profileService.updateCurrentProfile(profile);
		await Promise.resolve();
		assert.strictEqual(profileService.currentProfile, previous);

		await finishWrite.complete();
		await Promise.all([save, change]);
		assert.deepStrictEqual(fileService.writeOperations.map(operation => operation.resource.path), [
			'/test/userdata/globalStorage/chatSessions/test-workspace/pending-session.jsonl',
		]);
	});

	test('keeps sessions available when profiles share the same storage', async () => {
		const profileService = instantiationService.get(IUserDataProfileService);
		const profile = toUserDataProfile('shared', 'Shared', URI.file('/test/shared'), URI.file('/test/cache'), { useDefaultFlags: { globalState: true } }, profileService.currentProfile);
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('shared-session')));
		await store.storeSessions([model]);
		testDisposables.add(profileService.onDidChangeCurrentProfile(e => e.join(store.setSessionTitle('shared-session', 'Still available'))));

		await profileService.updateCurrentProfile(profile);
		assert.deepStrictEqual({ title: (await store.getIndex())['shared-session'].title, root: store.getChatStorageFolder().path }, {
			title: 'Still available',
			root: '/test/userdata/globalStorage/chatSessions/test-workspace',
		});
	});

	test('does not import already migrated workspace history into another profile', async () => {
		const profileService = instantiationService.get(IUserDataProfileService);
		const profile = toUserDataProfile('next', 'Next', URI.file('/test/next'), URI.file('/test/cache'));
		const storageService = instantiationService.get(IStorageService);
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('legacy-session')));
		let migrationReads = 0;
		await store.migrateDataIfNeeded(() => {
			migrationReads++;
			return { [model.sessionId]: model.toJSON() };
		});
		testDisposables.add(profileService.onDidChangeCurrentProfile(() => {
			for (const key of storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
				storageService.remove(key, StorageScope.PROFILE);
			}
		}));

		await profileService.updateCurrentProfile(profile);
		assert.deepStrictEqual({ migrationReads, sessions: Object.keys(await store.getIndex()) }, { migrationReads: 1, sessions: [] });
	});

	test('preserves an existing profile-scoped serialized migration marker', async () => {
		const storageService = instantiationService.get(IStorageService);
		const migrationKey = 'chat.ChatSessionStore.index.serializedMigration.' + TestWorkspace.id;
		storageService.store(migrationKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		const store = createChatSessionStore();

		await store.migrateDataIfNeeded(() => { throw new Error('Completed migration must not be read again'); });
		assert.strictEqual(storageService.getBoolean(migrationKey, StorageScope.WORKSPACE), true);
	});

	test('suppresses incoming profile deletions and rejects mutations until storage has switched', async () => {
		const profileService = instantiationService.get(IUserDataProfileService);
		const profile = toUserDataProfile('next', 'Next', URI.file('/test/next'), URI.file('/test/cache'));
		const storageService = instantiationService.get(IStorageService);
		const store = createChatSessionStore();
		const oldRoot = store.getChatStorageFolder();
		const deleted: string[] = [];
		testDisposables.add(store.onDidDeleteSession(id => deleted.push(id)));
		const storageChanging = new DeferredPromise<void>();
		const finishSwitch = new DeferredPromise<void>();
		testDisposables.add(profileService.onDidChangeCurrentProfile(e => {
			storageService.store('chat.ChatSessionStore.index.entry.old-session', '{"deleted":true}', StorageScope.PROFILE, StorageTarget.MACHINE);
			e.join(finishSwitch.p);
			void storageChanging.complete();
		}));

		const change = profileService.updateCurrentProfile(profile);
		await storageChanging.p;
		await assert.rejects(store.deleteSession('old-session'), { name: 'Canceled' });
		await assert.rejects(store.setSessionPinned('old-session', true), { name: 'Canceled' });
		assert.deepStrictEqual({ deleted, index: await store.getIndex(), root: store.getChatStorageFolder() }, { deleted: [], index: {}, root: oldRoot });

		await finishSwitch.complete();
		await change;
		assert.ok(store.getChatStorageFolder().path.startsWith('/test/next/'));
	});

	test('failed outgoing session save aborts the profile switch and restores store access', async () => {
		const profileService = instantiationService.get(IUserDataProfileService);
		const previous = profileService.currentProfile;
		const profile = toUserDataProfile('next', 'Next', URI.file('/test/next'), URI.file('/test/cache'));
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('unsaved-session')));
		testDisposables.add(profileService.onWillChangeCurrentProfile(e => e.join(store.saveSessionsBeforeProfileChange([model], []))));
		fileService.writeShouldThrowError = new Error('Disk write failed');

		await assert.rejects(profileService.updateCurrentProfile(profile), /Disk write failed/);
		fileService.writeShouldThrowError = undefined;
		await store.storeSessions([model]);
		assert.deepStrictEqual({ profile: profileService.currentProfile.id, sessions: Object.keys(await store.getIndex()) }, {
			profile: previous.id,
			sessions: ['unsaved-session'],
		});
	});

	test('outgoing session save reports metadata errors', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(new MockChatModel(URI.parse('test-provider:/external-session')));
		Object.defineProperty(model, 'requests', { get: () => { throw new Error('Metadata failed'); } });

		await assert.rejects(store.saveSessionsBeforeProfileChange([], [model as unknown as ChatModel]), /Metadata failed/);
	});

	test('outgoing session save reports index errors and retries pending metadata', async () => {
		const storageService = testDisposables.add(new class extends TestStorageService {
			failWrites = true;
			override storeAll(entries: IStorageEntry[], external: boolean): void {
				if (this.failWrites) {
					throw new Error('Index write failed');
				}
				super.storeAll(entries, external);
			}
		}());
		instantiationService.stub(IStorageService, storageService);
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('unsaved-session')));

		await assert.rejects(store.saveSessionsBeforeProfileChange([model], []), /Index write failed/);
		storageService.failWrites = false;
		await store.saveSessionsBeforeProfileChange([model], []);
		assert.ok(storageService.get('chat.ChatSessionStore.index.entry.unsaved-session', StorageScope.PROFILE));
	});

	test('outgoing session save reports storage flush failures', async () => {
		instantiationService.stub(IStorageService, testDisposables.add(new class extends TestStorageService {
			override async flush(): Promise<void> { throw new Error('Storage flush failed'); }
		}()));
		const store = createChatSessionStore();
		await assert.rejects(store.saveSessionsBeforeProfileChange([], []), /Storage flush failed/);
	});

	test('retains legacy workspace index until migrated metadata is stored', async () => {
		const storageService = testDisposables.add(new class extends TestStorageService {
			failWrites = true;
			override storeAll(entries: IStorageEntry[], external: boolean): void {
				if (this.failWrites) {
					throw new Error('Index write failed');
				}
				super.storeAll(entries, external);
			}
		}());
		instantiationService.stub(IStorageService, storageService);
		const legacyIndex = { version: 1, entries: { legacy: { sessionId: 'legacy', title: 'Legacy chat', lastMessageDate: 1, isExternal: true } } };
		storageService.store('chat.ChatSessionStore.index', legacyIndex, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const store = createChatSessionStore();

		await store.migrateDataIfNeeded(() => undefined);
		assert.deepStrictEqual(storageService.getObject('chat.ChatSessionStore.index', StorageScope.WORKSPACE), legacyIndex);

		storageService.failWrites = false;
		await store.migrateDataIfNeeded(() => undefined);
		assert.deepStrictEqual({
			legacyIndex: storageService.get('chat.ChatSessionStore.index', StorageScope.WORKSPACE),
			sessions: Object.keys(await store.getIndex()),
		}, { legacyIndex: undefined, sessions: ['legacy'] });
	});

	test('does not mark serialized migration complete before metadata is stored', async () => {
		const storageService = testDisposables.add(new class extends TestStorageService {
			override storeAll(): void { throw new Error('Index write failed'); }
		}());
		instantiationService.stub(IStorageService, storageService);
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('legacy-session')));

		await store.migrateDataIfNeeded(() => ({ [model.sessionId]: model.toJSON() }));
		assert.strictEqual(storageService.getBoolean('chat.ChatSessionStore.index.serializedMigration.' + TestWorkspace.id, StorageScope.WORKSPACE, false), false);
	});

	test('updates profile-owned storage when the window enters a workspace', async () => {
		const contextService = new TestContextService(new Workspace('empty-window-id', []));
		const onDidEnterWorkspace = testDisposables.add(new Emitter<IDidEnterWorkspaceEvent>());
		instantiationService.stub(IWorkspaceContextService, contextService);
		instantiationService.stub(IWorkspaceEditingService, { onDidEnterWorkspace: onDidEnterWorkspace.event });
		const store = testDisposables.add(instantiationService.createInstance(ChatSessionStore));
		const joiners: Promise<void>[] = [];
		const workspace = new Workspace('next-workspace', [new WorkspaceFolder({ uri: URI.file('/test/folder'), index: 0, name: 'folder' })]);

		contextService.setWorkspace(workspace);
		onDidEnterWorkspace.fire({
			oldWorkspace: { id: 'empty-window-id' },
			newWorkspace: { id: workspace.id, uri: URI.file('/test/folder') },
			join: promise => joiners.push(promise),
		});
		await Promise.all(joiners);

		assert.ok(store.getChatStorageFolder().path.endsWith('/globalStorage/chatSessions/next-workspace'));
	});

	test('isSessionEmpty returns true for non-existent session', () => {
		const store = createChatSessionStore();

		assert.strictEqual(store.isSessionEmpty('non-existent-session'), true);
	});

	test('readSession returns undefined for non-existent session', async () => {
		const store = createChatSessionStore();

		const session = await store.readSession('non-existent-session');
		assert.strictEqual(session, undefined);
	});

	test('deleteSession handles non-existent session gracefully', async () => {
		const store = createChatSessionStore();

		// Should not throw
		await store.deleteSession('non-existent-session');

		assert.strictEqual(store.hasSessions(), false);
	});

	test('storeSessions persists session to index', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.storeSessions([model]);

		assert.strictEqual(store.hasSessions(), true);
		const index = await store.getIndex();
		assert.ok(index['session-1']);
		assert.strictEqual(index['session-1'].sessionId, 'session-1');
	});

	test('storeSessions rejects session IDs that escape the storage root', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('../../../outside')));

		await store.storeSessions([model]);

		assert.deepStrictEqual({
			hasSessions: store.hasSessions(),
			writtenResources: fileService.writeOperations.map(operation => operation.resource.toString()),
		}, {
			hasSessions: false,
			writtenResources: [],
		});
	});

	test('storeSessions persists custom title', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1'), { customTitle: 'My Custom Title' }));

		await store.storeSessions([model]);

		const index = await store.getIndex();
		assert.strictEqual(index['session-1'].title, 'My Custom Title');
	});

	test('readSession returns stored session data', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.storeSessions([model]);
		const session = await store.readSession('session-1');

		assert.ok(session);
		assert.strictEqual((session.value as ISerializableChatData3).sessionId, 'session-1');
	});

	test('readSession ignores and removes a legacy invalid session ID', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		await store.storeSessions([model]);
		const index = await store.getIndex();
		instantiationService.get(IStorageService).store('chat.ChatSessionStore.index', {
			version: 1,
			entries: { '../../../outside': { ...index['session-1'], sessionId: '../../../outside' } },
		}, StorageScope.PROFILE, StorageTarget.MACHINE);

		const session = await store.readSession('../../../outside');

		assert.deepStrictEqual({
			session,
			indexKeys: Object.keys(await store.getIndex()),
			readOperations: fileService.readOperations,
		}, {
			session: undefined,
			indexKeys: ['session-1'],
			readOperations: [],
		});
	});

	test('deleteSession removes session from index', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.storeSessions([model]);
		assert.strictEqual(store.hasSessions(), true);

		await store.deleteSession('session-1');

		assert.strictEqual(store.hasSessions(), false);
		const index = await store.getIndex();
		assert.strictEqual(index['session-1'], undefined);
	});

	test('deleteSession removes a legacy invalid session ID without deleting files', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		await store.storeSessions([model]);
		const index = await store.getIndex();
		instantiationService.get(IStorageService).store('chat.ChatSessionStore.index', {
			version: 1,
			entries: { '../../../outside': { ...index['session-1'], sessionId: '../../../outside' } },
		}, StorageScope.PROFILE, StorageTarget.MACHINE);

		await store.deleteSession('../../../outside');

		assert.deepStrictEqual({
			indexKeys: Object.keys(await store.getIndex()),
			deleteOperations: fileService.deleteOperations,
		}, {
			indexKeys: ['session-1'],
			deleteOperations: [],
		});
	});

	test('clearAllSessions only removes sessions from the current workspace', async () => {
		const store = createChatSessionStore();
		const model1 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		const model2 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-2')));

		await store.storeSessions([model1, model2]);
		const index = await store.getIndex();
		index['../../../outside'] = { ...index['session-1'], sessionId: '../../../outside' };
		index['session-2'].workspaceId = 'other-workspace-id';
		assert.strictEqual(Object.keys(index).length, 3);

		await store.clearAllSessions();

		assert.deepStrictEqual(Object.keys(index), ['session-2']);
		assert.strictEqual(index['session-2'].workspaceId, 'other-workspace-id');
	});

	test('setSessionTitle updates existing session title', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1'), { customTitle: 'Original Title' }));

		await store.storeSessions([model]);
		await store.setSessionTitle('session-1', 'New Title');

		const index = await store.getIndex();
		assert.strictEqual(index['session-1'].title, 'New Title');
	});

	test('setSessionTitle does nothing for non-existent session', async () => {
		const store = createChatSessionStore();

		// Should not throw
		await store.setSessionTitle('non-existent', 'Title');

		const index = await store.getIndex();
		assert.strictEqual(index['non-existent'], undefined);
	});

	test('stores from different workspaces keep separate session storage', async () => {
		const store1 = createChatSessionStore(false);
		const store2 = createChatSessionStore(true);

		const folder1 = store1.getChatStorageFolder();
		const folder2 = store2.getChatStorageFolder();

		assert.notStrictEqual(folder1.toString(), folder2.toString());
	});

	test('reads a catalogued session from its originating workspace', async () => {
		const originalStore = createChatSessionStore(false);
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		await originalStore.storeSessions([model]);

		const otherStore = createChatSessionStore(true);
		const restored = await otherStore.readSession('session-1');

		assert.ok(restored);
		assert.strictEqual((await otherStore.getIndex())['session-1'].workspaceId, TestWorkspace.id);
	});

	test('reports a session deleted by another window', async () => {
		const firstStore = createChatSessionStore();
		const secondStore = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		await firstStore.storeSessions([model]);
		await secondStore.getIndex();
		const deleted: string[] = [];
		testDisposables.add(secondStore.onDidDeleteSession(sessionId => deleted.push(sessionId)));
		instantiationService.get(IStorageService).remove('chat.ChatSessionStore.index.entry.session-1', StorageScope.PROFILE);
		assert.deepStrictEqual(deleted, []);
		await firstStore.storeSessions([model]);

		await firstStore.deleteSession('session-1');

		assert.deepStrictEqual(deleted, ['session-1']);
		await secondStore.storeSessions([model]);
		assert.strictEqual((await secondStore.getIndex())['session-1'], undefined);
	});

	test('migrates serialized history once for each workspace', async () => {
		const firstStore = createChatSessionStore(false);
		const firstModel = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('existing-session')));
		await firstStore.storeSessions([firstModel]);

		const secondStore = createChatSessionStore(true);
		const serializedSession = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('legacy-session'))).toJSON();
		let migrationReads = 0;
		await secondStore.migrateDataIfNeeded(() => {
			migrationReads++;
			return { [serializedSession.sessionId]: serializedSession };
		});
		await secondStore.migrateDataIfNeeded(() => {
			migrationReads++;
			return undefined;
		});

		const index = await secondStore.getIndex();
		assert.deepStrictEqual({
			migrationReads,
			workspaces: Object.fromEntries(Object.entries(index).map(([id, metadata]) => [id, metadata.workspaceId])),
		}, {
			migrationReads: 1,
			workspaces: {
				'existing-session': TestWorkspace.id,
				'legacy-session': 'empty-window-id',
			},
		});
	});

	test('migrates application-scoped serialized history only once across empty windows', async () => {
		const serializedSession = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('legacy-session'))).toJSON();
		let migrationReads = 0;
		const migrate = () => {
			migrationReads++;
			return { [serializedSession.sessionId]: serializedSession };
		};

		const firstStore = createChatSessionStore(true, new Workspace('empty-window-1', []));
		await firstStore.migrateDataIfNeeded(migrate);
		const secondStore = createChatSessionStore(true, new Workspace('empty-window-2', []));
		await secondStore.migrateDataIfNeeded(migrate);

		assert.deepStrictEqual({
			migrationReads,
			sessionIds: Object.keys(await secondStore.getIndex()),
		}, {
			migrationReads: 1,
			sessionIds: ['legacy-session'],
		});
	});

	test('merges profile index updates from different windows', async () => {
		const store1 = createChatSessionStore(false);
		const store2 = createChatSessionStore(true);
		const model1 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		const model2 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-2')));

		await store1.getIndex();
		await store2.getIndex();
		await store1.storeSessions([model1]);
		await store2.storeSessions([model2]);

		assert.deepStrictEqual(Object.keys(await store1.getIndex()).sort(), ['session-1', 'session-2']);
		const storageService = instantiationService.get(IStorageService);
		assert.strictEqual(storageService.get('chat.ChatSessionStore.index', StorageScope.PROFILE), undefined);
		assert.ok(storageService.get('chat.ChatSessionStore.index.entry.session-1', StorageScope.PROFILE));
		assert.ok(storageService.get('chat.ChatSessionStore.index.entry.session-2', StorageScope.PROFILE));
	});

	test('migrates the current workspace index and payloads to profile storage', async () => {
		const storageService = instantiationService.get(IStorageService);
		storageService.store('chat.ChatSessionStore.index', JSON.stringify({
			version: 1,
			entries: {
				'session-1': {
					sessionId: 'session-1',
					title: 'Legacy session',
					lastMessageDate: 1,
					timing: { created: 1 },
					lastResponseState: 1,
				}
			}
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		await fileService.writeFile(URI.joinPath(URI.file('/test/workspaceStorage'), TestWorkspace.id, 'chatSessions', 'session-1.json'), VSBuffer.fromString('{}'));

		const store = createChatSessionStore();
		await store.migrateDataIfNeeded(() => undefined);

		const index = await store.getIndex();
		assert.deepStrictEqual({
			title: index['session-1'].title,
			workspaceId: index['session-1'].workspaceId,
			fileExists: await fileService.exists(URI.joinPath(store.getChatStorageFolder(), 'session-1.json')),
		}, {
			title: 'Legacy session',
			workspaceId: TestWorkspace.id,
			fileExists: true,
		});
	});

	test('migrates external metadata when the legacy session directory is absent', async () => {
		instantiationService.get(IStorageService).store('chat.ChatSessionStore.index', JSON.stringify({
			version: 1,
			entries: {
				'external:/session-1': {
					sessionId: 'session-1',
					title: 'External session',
					lastMessageDate: 1,
					timing: { created: 1 },
					lastResponseState: 1,
					isExternal: true,
				}
			}
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const store = createChatSessionStore();
		await store.migrateDataIfNeeded(() => undefined);

		assert.deepStrictEqual((await store.getIndex())['external:/session-1'], {
			sessionId: 'session-1',
			title: 'External session',
			lastMessageDate: 1,
			timing: { created: 1 },
			lastResponseState: 1,
			isExternal: true,
			workspaceId: TestWorkspace.id,
			workspaceLabel: 'testWorkspace',
			isEmptyWindow: false,
		});
	});

	test('migrates legacy session files when profile metadata already exists', async () => {
		const storageService = instantiationService.get(IStorageService);
		const metadata = {
			sessionId: 'session-1',
			title: 'Legacy session',
			lastMessageDate: 1,
			timing: { created: 1 },
			lastResponseState: 1,
		};
		storageService.store('chat.ChatSessionStore.index', JSON.stringify({
			version: 1,
			entries: { 'session-1': metadata },
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('chat.ChatSessionStore.index', JSON.stringify({
			version: 1,
			entries: { 'session-1': { ...metadata, workspaceId: 'original-workspace' } },
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		await fileService.writeFile(URI.joinPath(URI.file('/test/workspaceStorage'), TestWorkspace.id, 'chatSessions', 'session-1.json'), VSBuffer.fromString('{}'));

		const store = createChatSessionStore();
		await store.migrateDataIfNeeded(() => undefined);

		assert.deepStrictEqual({
			workspaceId: (await store.getIndex())['session-1'].workspaceId,
			fileExists: await fileService.exists(URI.joinPath(store.getChatStorageFolder(), 'session-1.json')),
		}, {
			workspaceId: 'original-workspace',
			fileExists: true,
		});
	});

	test('rekeys colliding legacy sessions from different workspaces', async () => {
		const storageService = instantiationService.get(IStorageService);
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1'), { customTitle: 'Colliding session' }));
		const metadata = {
			sessionId: 'session-1',
			title: 'Colliding session',
			lastMessageDate: 2,
			timing: { created: 2 },
			lastResponseState: 1,
		};
		storageService.store('chat.ChatSessionStore.index', JSON.stringify({
			version: 1,
			entries: { 'session-1': metadata },
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('chat.ChatSessionStore.index', JSON.stringify({
			version: 1,
			entries: { 'session-1': { ...metadata, title: 'Existing session', workspaceId: 'other-workspace' } },
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		await fileService.writeFile(
			URI.joinPath(URI.file('/test/workspaceStorage'), TestWorkspace.id, 'chatSessions', 'session-1.jsonl'),
			new ChatSessionOperationLog().createInitialFromSerialized(model.toJSON()),
		);

		const store = createChatSessionStore();
		assert.strictEqual((await store.getIndex())['session-1'].workspaceId, 'other-workspace');
		await store.migrateDataIfNeeded(() => undefined);

		const index = await store.getIndex();
		const migratedId = Object.keys(index).find(id => id !== 'session-1');
		assert.ok(migratedId);
		const storedSession = await store.readSession(migratedId);
		assert.ok(storedSession);
		assert.deepStrictEqual({
			existingTitle: index['session-1'].title,
			migratedTitle: index[migratedId].title,
			migratedWorkspace: index[migratedId].workspaceId,
			legacySessionId: index[migratedId].legacySessionId,
			storedSessionId: (storedSession.value as ISerializableChatData3).sessionId,
		}, {
			existingTitle: 'Existing session',
			migratedTitle: 'Colliding session',
			migratedWorkspace: TestWorkspace.id,
			legacySessionId: 'session-1',
			storedSessionId: migratedId,
		});
	});

	test('preserves the original workspace when a restored session is saved elsewhere', async () => {
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		const originalStore = createChatSessionStore();
		await originalStore.storeSessions([model]);
		const otherStore = createChatSessionStore(true);

		await otherStore.storeSessions([model]);
		otherStore.updateAndFlushIndexSync([model], []);

		assert.deepStrictEqual({
			workspaceId: (await otherStore.getIndex())['session-1'].workspaceId,
			workspaceLabel: (await otherStore.getIndex())['session-1'].workspaceLabel,
		}, {
			workspaceId: TestWorkspace.id,
			workspaceLabel: 'testWorkspace',
		});
	});

	test('persists pinning requested before a new session is first saved', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.setSessionPinned('session-1', true);
		await store.storeSessions([model]);

		assert.strictEqual((await store.getIndex())['session-1'].isPinned, true);
	});

	test('does not overwrite a concurrent pin change with session metadata', async () => {
		const firstStore = createChatSessionStore();
		const secondStore = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		await firstStore.storeSessions([model]);
		await secondStore.getIndex();

		await firstStore.setSessionPinned('session-1', true);
		secondStore.updateAndFlushIndexSync([model], []);

		assert.strictEqual((await createChatSessionStore().getIndex())['session-1'].isPinned, true);
	});

	test('does not trim pinned sessions', async () => {
		const entries = Object.fromEntries(Array.from({ length: 401 }, (_, index) => {
			const sessionId = `session-${index}`;
			return [sessionId, {
				sessionId,
				title: sessionId,
				lastMessageDate: index,
				timing: { created: index },
				lastResponseState: 1,
				workspaceId: TestWorkspace.id,
				isPinned: index === 0,
			}];
		}));
		instantiationService.get(IStorageService).store('chat.ChatSessionStore.index', JSON.stringify({ version: 1, entries }), StorageScope.PROFILE, StorageTarget.MACHINE);
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('new-session')));

		await store.storeSessions([model]);

		const index = await store.getIndex();
		assert.deepStrictEqual({
			count: Object.keys(index).length,
			pinned: !!index['session-0'],
			oldestUnpinned: !!index['session-1'],
		}, {
			count: 401,
			pinned: true,
			oldestUnpinned: false,
		});
	});

	suite('transferred sessions', () => {
		function createSingleFolderWorkspace(folderUri: URI): Workspace {
			const folder = new WorkspaceFolder({ uri: folderUri, index: 0, name: 'test' });
			return new Workspace('single-folder-id', [folder]);
		}

		function createChatSessionStoreWithSingleFolder(folderUri: URI): ChatSessionStore {
			instantiationService.stub(IWorkspaceContextService, new TestContextService(createSingleFolderWorkspace(folderUri)));
			return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
		}

		function createTransferData(toWorkspace: URI, sessionResource: URI, timestampInMilliseconds?: number): IChatTransfer {
			return {
				toWorkspace,
				sessionResource,
				timestampInMilliseconds: timestampInMilliseconds ?? Date.now(),
			};
		}

		test('getTransferredSessionData returns undefined for empty window', () => {
			const store = createChatSessionStore(true); // empty window

			const result = store.getTransferredSessionData();

			assert.strictEqual(result, undefined);
		});

		test('getTransferredSessionData returns undefined when no transfer exists', () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);

			const result = store.getTransferredSessionData();

			assert.strictEqual(result, undefined);
		});

		test('storeTransferSession stores and retrieves transfer data', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			const transferData = createTransferData(folderUri, sessionResource);
			await store.storeTransferSession(transferData, model);

			const result = store.getTransferredSessionData();
			assert.ok(result);
			assert.strictEqual(result.toString(), sessionResource.toString());
		});

		test('readTransferredSession returns session data', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			const transferData = createTransferData(folderUri, sessionResource);
			await store.storeTransferSession(transferData, model);

			const sessionData = await store.readTransferredSession(sessionResource);
			assert.ok(sessionData);
			assert.strictEqual((sessionData.value as ISerializableChatData3).sessionId, 'transfer-session');
		});

		test('readTransferredSession cleans up after reading', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			const transferData = createTransferData(folderUri, sessionResource);
			await store.storeTransferSession(transferData, model);

			// Read the session
			await store.readTransferredSession(sessionResource);

			// Transfer should be cleaned up
			const result = store.getTransferredSessionData();
			assert.strictEqual(result, undefined);
		});

		test('getTransferredSessionData returns undefined for expired transfer', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			// Create transfer with timestamp 10 minutes in the past (expired)
			const expiredTimestamp = Date.now() - (10 * 60 * 1000);
			const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
			await store.storeTransferSession(transferData, model);

			const result = store.getTransferredSessionData();
			assert.strictEqual(result, undefined);
		});

		test('expired transfer cleans up index and file', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			// Create transfer with timestamp 100 minutes in the past (expired)
			const expiredTimestamp = Date.now() - (100 * 60 * 1000);
			const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
			await store.storeTransferSession(transferData, model);

			// Assert cleaned up
			const data = store.getTransferredSessionData();
			assert.strictEqual(data, undefined);
		});

		test('readTransferredSession returns undefined for invalid session resource', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);

			// Use a non-local session URI
			const invalidResource = URI.parse('file:///invalid/session');

			const result = await store.readTransferredSession(invalidResource);
			assert.strictEqual(result, undefined);
		});

		test('storeTransferSession deletes preexisting transferred session file', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const fileService = instantiationService.get(IFileService);

			// Store first session
			const session1Resource = LocalChatSessionUri.forSession('transfer-session-1');
			const model1 = testDisposables.add(createMockChatModel(session1Resource));
			const transferData1 = createTransferData(folderUri, session1Resource);
			await store.storeTransferSession(transferData1, model1);

			// Verify first session file exists
			const userDataProfile = instantiationService.get(IUserDataProfilesService).defaultProfile;
			const storageLocation1 = URI.joinPath(
				userDataProfile.globalStorageHome,
				'transferredChatSessions',
				'transfer-session-1.json'
			);
			const exists1 = await fileService.exists(storageLocation1);
			assert.strictEqual(exists1, true, 'First session file should exist');

			// Store second session for the same workspace
			const session2Resource = LocalChatSessionUri.forSession('transfer-session-2');
			const model2 = testDisposables.add(createMockChatModel(session2Resource));
			const transferData2 = createTransferData(folderUri, session2Resource);
			await store.storeTransferSession(transferData2, model2);

			// Verify first session file is deleted
			const exists1After = await fileService.exists(storageLocation1);
			assert.strictEqual(exists1After, false, 'First session file should be deleted');

			// Verify second session file exists
			const storageLocation2 = URI.joinPath(
				userDataProfile.globalStorageHome,
				'transferredChatSessions',
				'transfer-session-2.json'
			);
			const exists2 = await fileService.exists(storageLocation2);
			assert.strictEqual(exists2, true, 'Second session file should exist');

			// Verify only the second session is retrievable
			const result = store.getTransferredSessionData();
			assert.ok(result);
			assert.strictEqual(result.toString(), session2Resource.toString());
		});
	});

});
