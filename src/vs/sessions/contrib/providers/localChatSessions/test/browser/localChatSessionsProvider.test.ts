/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { ChatAgentLocation } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatModelReference, IChatService, IChatSessionStartOptions, IChatSessionTiming } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IGitService } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { LocalChatSessionsProvider, LocalSessionType, LOCAL_SESSION_ENABLED_SETTING } from '../../browser/localChatSessionsProvider.js';

// ---- Mock chat service ----------------------------------------------------

function createMockModel(sessionResource: URI, opts?: { title?: string; requestInProgress?: IObservable<boolean>; timing?: IChatSessionTiming }): IChatModel {
	let workingDirectory: URI | undefined;
	const requestInProgress = opts?.requestInProgress ?? observableValue<boolean>('requestInProgress', false);
	const timing: IChatSessionTiming = opts?.timing ?? { created: 1_000, lastRequestStarted: undefined, lastRequestEnded: undefined };
	return new class extends mock<IChatModel>() {
		override readonly sessionResource = sessionResource;
		override readonly title = opts?.title ?? 'Test Session';
		override readonly timing = timing;
		override readonly requestInProgress = requestInProgress;
		override get workingDirectory() { return workingDirectory; }
		override setWorkingDirectory(uri: URI | undefined): void { workingDirectory = uri; }
	}();
}

class MockChatService extends Disposable {
	private readonly _models = new Map<string, IChatModel>();
	private _counter = 0;

	readonly sendRequestCalls: { resource: URI; query: string }[] = [];

	/** When a query matches an entry here, sendRequest reports a rejection. */
	readonly rejectQueries = new Set<string>();

	private readonly _onDidDisposeSession = this._register(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>());
	readonly onDidDisposeSession = this._onDidDisposeSession.event;

	private readonly _onDidSubmitRequest = this._register(new Emitter<{ readonly chatSessionResource: URI }>());
	readonly onDidSubmitRequest = this._onDidSubmitRequest.event;

	startNewLocalSession(_location: ChatAgentLocation, _options?: IChatSessionStartOptions): IChatModelReference {
		const resource = URI.parse(`vscode-local-chat://chat/${++this._counter}`);
		const model = createMockModel(resource);
		this._models.set(resource.toString(), model);
		return { object: model, dispose: () => { } };
	}

	getSession(resource: URI): IChatModel | undefined {
		return this._models.get(resource.toString());
	}

	registerModel(model: IChatModel): void {
		this._models.set(model.sessionResource.toString(), model);
	}

	async acquireOrLoadSession(): Promise<IChatModelReference | undefined> {
		return undefined;
	}

	async sendRequest(resource: URI, query: string) {
		this.sendRequestCalls.push({ resource, query });
		if (this.rejectQueries.has(query)) {
			return { kind: 'rejected', reason: 'test-rejected' };
		}
		return { kind: 'sent', data: { responseCompletePromise: Promise.resolve(), responseCreatedPromise: Promise.resolve({}) } };
	}

	async getLocalSessionHistory() { return []; }
	async removeHistoryEntry(_resource: URI): Promise<void> { }
	setSessionTitle(_resource: URI, _title: string): void { }

	fireSubmitRequest(resource: URI): void {
		this._onDidSubmitRequest.fire({ chatSessionResource: resource });
	}
}

// ---- Test fixture ----------------------------------------------------------

interface ITestFixture {
	instantiationService: TestInstantiationService;
	chatService: MockChatService;
	storage: TestStorageService;
	config: TestConfigurationService;
	dialog: { confirmResult: boolean; confirmCount: number };
}

function createFixture(store: DisposableStore): ITestFixture {
	const instantiationService = store.add(new TestInstantiationService());
	const chatService = store.add(new MockChatService());
	const storage = store.add(new TestStorageService());
	const config = new TestConfigurationService();
	config.setUserConfiguration(LOCAL_SESSION_ENABLED_SETTING, true);

	const dialog = { confirmResult: true, confirmCount: 0 };

	instantiationService.stub(IChatService, chatService as unknown as IChatService);
	instantiationService.stub(IStorageService, storage);
	instantiationService.stub(IConfigurationService, config);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
		override async confirm() { dialog.confirmCount++; return { confirmed: dialog.confirmResult }; }
	}());
	instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
		override getUriLabel(uri: URI): string { return uri.fsPath; }
	}());
	instantiationService.stub(ILanguageModelsService, new class extends mock<ILanguageModelsService>() { }());
	instantiationService.stub(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() { }());
	instantiationService.stub(IGitService, new class extends mock<IGitService>() {
		override async openRepository() { return undefined; }
	}());
	instantiationService.stub(IFileService, new class extends mock<IFileService>() { }());
	instantiationService.stub(IInstantiationService, instantiationService);
	return { instantiationService, chatService, storage, config, dialog };
}

const TEST_FOLDER = URI.file('/test/folder');

/** Storage key used by the provider to persist the session list. */
const STORAGE_KEY_SESSIONS = 'sessions.localChat.sessions';

interface IReadStoredSession {
	readonly uri: UriComponents;
	readonly parentUri?: UriComponents;
}

function readStoredSessions(storage: TestStorageService): IReadStoredSession[] {
	const raw = storage.get(STORAGE_KEY_SESSIONS, StorageScope.PROFILE);
	return raw ? JSON.parse(raw) as IReadStoredSession[] : [];
}

async function commitNewSession(provider: LocalChatSessionsProvider): Promise<ISession> {
	const newSession = provider.createNewSession(TEST_FOLDER, LocalSessionType.id);
	const chat = await provider.createNewChat(newSession.sessionId);
	await provider.sendRequest(newSession.sessionId, chat.resource, { query: 'hello' });
	return newSession;
}

/** Adds and sends a subsequent chat to an already-committed multi-chat session. */
async function addChat(provider: LocalChatSessionsProvider, session: ISession, query = 'second'): Promise<URI> {
	const chat = await provider.createNewChat(session.sessionId);
	await provider.sendRequest(session.sessionId, chat.resource, { query });
	return chat.resource;
}

// ---- Suite ----------------------------------------------------------------

suite('LocalChatSessionsProvider', () => {
	const leaks = ensureNoDisposablesAreLeakedInTestSuite();

	test('declares Local session type', () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		assert.deepStrictEqual(provider.sessionTypes.map(t => t.id), [LocalSessionType.id]);
	});

	test('resolveWorkspace handles only file uris', () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		assert.strictEqual(provider.resolveWorkspace(URI.parse('http://example.com')), undefined);

		const ws = provider.resolveWorkspace(TEST_FOLDER);
		assert.ok(ws);
		assert.strictEqual(ws!.folders[0].root.toString(), TEST_FOLDER.toString());
	});

	test('createNewSession returns a session but does not show in getSessions until first send', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const newSession = provider.createNewSession(TEST_FOLDER, LocalSessionType.id);
		assert.strictEqual(newSession.providerId, provider.id);
		assert.strictEqual(provider.getSessions().length, 0);

		const chat = await provider.createNewChat(newSession.sessionId);
		await provider.sendRequest(newSession.sessionId, chat.resource, { query: 'hi' });
		assert.strictEqual(provider.getSessions().length, 1);
	});

	test('createNewSession rejects unknown session types', () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		assert.throws(() => provider.createNewSession(TEST_FOLDER, 'bogus'));
	});

	test('persists committed sessions and restores them on next provider instance', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		const session = await commitNewSession(provider);

		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		await Event.toPromise(provider2.onDidChangeSessions);
		const restored = provider2.getSessions();
		assert.strictEqual(restored.length, 1);
		assert.strictEqual(restored[0].resource.toString(), session.resource.toString());
	});

	test('deleteSession removes session from cache and storage', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		const session = await commitNewSession(provider);

		await provider.deleteSession(session.sessionId);
		assert.strictEqual(provider.getSessions().length, 0);

		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		// Wait one microtask tick for the async migration/load to complete (no event fires when empty)
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(provider2.getSessions().length, 0);
	});

	test('archiveSession and unarchiveSession toggle isArchived and persist', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		const session = await commitNewSession(provider);

		await provider.archiveSession(session.sessionId);
		assert.strictEqual(provider.getSessions()[0].isArchived.get(), true);

		await provider.unarchiveSession(session.sessionId);
		assert.strictEqual(provider.getSessions()[0].isArchived.get(), false);

		await provider.archiveSession(session.sessionId);
		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		await Event.toPromise(provider2.onDidChangeSessions);
		assert.strictEqual(provider2.getSessions()[0].isArchived.get(), true);
	});

	test('renameChat updates session title and persists it', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		const session = await commitNewSession(provider);

		await provider.renameChat(session.sessionId, session.resource, 'Custom Title');
		assert.strictEqual(provider.getSessions()[0].title.get(), 'Custom Title');

		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		await Event.toPromise(provider2.onDidChangeSessions);
		assert.strictEqual(provider2.getSessions()[0].title.get(), 'Custom Title');
	});

	test('status follows model.requestInProgress after a submit event', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, chatService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		const session = await commitNewSession(provider);

		// Replace the registered model with a controllable one for tracking
		const inProgress = observableValue<boolean>('inProgress', false);
		chatService.registerModel(createMockModel(session.resource, { requestInProgress: inProgress }));

		chatService.fireSubmitRequest(session.resource);
		assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed);

		inProgress.set(true, undefined);
		assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.InProgress);

		inProgress.set(false, undefined);
		assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed);
	});

	test('Event.None and exports remain stable', () => {
		assert.strictEqual(LocalSessionType.id, 'local');
		assert.strictEqual(LOCAL_SESSION_ENABLED_SETTING, 'sessions.chat.localAgent.enabled');
		assert.ok(Event.None);
	});

	// ---- Multi-chat ---------------------------------------------------------

	test('committed sessions advertise supportsMultipleChats', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		assert.strictEqual(session.capabilities.supportsMultipleChats, true);
		assert.strictEqual(session.chats.get().length, 1);
	});

	test('createNewChat adds a second chat to an existing session', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		await addChat(provider, session);

		// Still one session (the group), now with two chats.
		assert.strictEqual(provider.getSessions().length, 1);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
	});

	test('persists the chat hierarchy and restores it grouped', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);

		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		const session = await commitNewSession(provider);
		await addChat(provider, session);

		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		await Event.toPromise(provider2.onDidChangeSessions);

		const restored = provider2.getSessions();
		assert.strictEqual(restored.length, 1);
		assert.strictEqual(restored[0].resource.toString(), session.resource.toString());
		assert.strictEqual(restored[0].chats.get().length, 2);
	});

	test('deleteChat removes a child chat but keeps the session after confirmation', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, dialog } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);

		await provider.deleteChat(session.sessionId, childResource);
		assert.strictEqual(dialog.confirmCount, 1);
		assert.strictEqual(provider.getSessions().length, 1);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 1);
	});

	test('deleteChat keeps the child chat when the confirmation is cancelled', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, dialog } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);

		dialog.confirmResult = false;
		await provider.deleteChat(session.sessionId, childResource);
		assert.strictEqual(dialog.confirmCount, 1);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
	});

	test('deleteChat with skipConfirmation deletes without showing the dialog', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, dialog } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);

		const deleted = await provider.deleteChat(session.sessionId, childResource, { skipConfirmation: true });
		assert.strictEqual(deleted, true);
		assert.strictEqual(dialog.confirmCount, 0);
		assert.strictEqual(provider.getSessions().length, 1);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 1);
	});

	test('deleteChat returns false when the confirmation is cancelled', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, dialog } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);

		dialog.confirmResult = false;
		const deleted = await provider.deleteChat(session.sessionId, childResource);
		assert.strictEqual(deleted, false);
	});

	test('deleteChat with an unknown chat URI is a no-op', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		await addChat(provider, session);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);

		// A stale/incorrect chat URI must not wipe the whole session.
		await provider.deleteChat(session.sessionId, URI.parse('vscode-local-chat://chat/does-not-exist'));
		assert.strictEqual(provider.getSessions().length, 1);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
	});

	test('deleteSession removes the primary chat and all children', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		await addChat(provider, session);

		await provider.deleteSession(session.sessionId);
		assert.strictEqual(provider.getSessions().length, 0);

		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(provider2.getSessions().length, 0);
	});

	test('a rejected subsequent chat send is rolled back', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, chatService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		chatService.rejectQueries.add('boom');

		const chat = await provider.createNewChat(session.sessionId);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);

		await assert.rejects(provider.sendRequest(session.sessionId, chat.resource, { query: 'boom' }));

		// The unsent child is rolled back, leaving a single chat.
		assert.strictEqual(provider.getSessions().length, 1);
		assert.strictEqual(provider.getSessions()[0].chats.get().length, 1);
	});

	test('persists the parent link in the child chat metadata', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, storage } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);

		const stored = readStoredSessions(storage);
		const primaryEntry = stored.find(s => URI.revive(s.uri).toString() === session.resource.toString());
		const childEntry = stored.find(s => URI.revive(s.uri).toString() === childResource.toString());

		assert.strictEqual(primaryEntry?.parentUri, undefined);
		assert.ok(childEntry?.parentUri);
		assert.strictEqual(URI.revive(childEntry.parentUri!).toString(), session.resource.toString());
	});

	test('promotes an orphaned child to a primary when its parent is missing', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, storage } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);

		// Simulate corrupted/partial storage where the primary entry is gone.
		const withoutPrimary = readStoredSessions(storage).filter(s => URI.revive(s.uri).toString() !== session.resource.toString());
		storage.store(STORAGE_KEY_SESSIONS, JSON.stringify(withoutPrimary), StorageScope.PROFILE, StorageTarget.MACHINE);

		const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
		await Event.toPromise(provider2.onDidChangeSessions);

		// The orphan surfaces as its own single-chat primary session rather than disappearing.
		const sessions = provider2.getSessions();
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].resource.toString(), childResource.toString());
		assert.strictEqual(sessions[0].chats.get().length, 1);
	});

	test('deleteChat on the primary chat deletes the whole session', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		await addChat(provider, session);

		await provider.deleteChat(session.sessionId, session.resource);
		assert.strictEqual(provider.getSessions().length, 0);
	});

	test('group status aggregates across child chats', async () => {
		const store = leaks.add(new DisposableStore());
		const { instantiationService, chatService } = createFixture(store);
		const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));

		const session = await commitNewSession(provider);
		const childResource = await addChat(provider, session);

		// Drive the child chat's request state; the group must reflect it.
		const childInProgress = observableValue<boolean>('childInProgress', false);
		chatService.registerModel(createMockModel(childResource, { requestInProgress: childInProgress }));
		chatService.fireSubmitRequest(childResource);

		const group = provider.getSessions()[0];
		assert.strictEqual(group.status.get(), SessionStatus.Completed);

		childInProgress.set(true, undefined);
		assert.strictEqual(group.status.get(), SessionStatus.InProgress);

		childInProgress.set(false, undefined);
		assert.strictEqual(group.status.get(), SessionStatus.Completed);
	});
});
