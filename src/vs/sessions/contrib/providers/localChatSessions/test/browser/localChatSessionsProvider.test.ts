/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
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
}

function createFixture(store: DisposableStore): ITestFixture {
	const instantiationService = store.add(new TestInstantiationService());
	const chatService = store.add(new MockChatService());
	const storage = store.add(new TestStorageService());
	const config = new TestConfigurationService();
	config.setUserConfiguration(LOCAL_SESSION_ENABLED_SETTING, true);

	instantiationService.stub(IChatService, chatService as unknown as IChatService);
	instantiationService.stub(IStorageService, storage);
	instantiationService.stub(IConfigurationService, config);
	instantiationService.stub(ILogService, new NullLogService());
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
	return { instantiationService, chatService, storage, config };
}

const TEST_FOLDER = URI.file('/test/folder');

async function commitNewSession(provider: LocalChatSessionsProvider): Promise<ISession> {
	const newSession = provider.createNewSession(TEST_FOLDER, LocalSessionType.id);
	const chat = await provider.createNewChat(newSession.sessionId);
	await provider.sendRequest(newSession.sessionId, chat.resource, { query: 'hello' });
	return newSession;
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
});
