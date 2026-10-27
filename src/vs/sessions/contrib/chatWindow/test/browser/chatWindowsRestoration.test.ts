/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_WINDOWS_ENABLED_SETTING, IChatWindow, IChatWindowContent, IChatWindowKind, IChatWindowService } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ChatWindowsRestoration, OPEN_CHAT_WINDOWS_STORAGE_KEY, openChatInWindow } from '../../browser/openChatInWindow.js';

class TestStorageService extends InMemoryStorageService {
	willSave(): void {
		this.emitWillSaveState(WillSaveStateReason.NONE);
	}
}

suite('ChatWindowsRestoration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const stored = JSON.stringify([{ session: 'test:/session' }]);

	function createRestoration(options: { enabled: boolean; hidden?: boolean }) {
		const storageService = disposables.add(new TestStorageService());
		storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, stored, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const configurationService = new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: options.enabled });
		const restoreComplete = observableValue('restoreComplete', false);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override windows: IObservable<readonly IChatWindow[]> = observableValue('windows', []);
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override initialRestoreComplete = restoreComplete;
		}());
		const onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidChangeSessions = onDidChangeSessions.event;
		}());
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override sentiment = { hidden: !!options.hidden } as IChatEntitlementService['sentiment'];
		}());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, configurationService);
		const restoration = disposables.add(instantiationService.createInstance(ChatWindowsRestoration));
		return { storageService, restoration, onDidChangeSessions };
	}

	test('keeps the stored chat windows while their restoration is pending', () => {
		const { storageService } = createRestoration({ enabled: true });

		storageService.willSave();

		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), stored);
	});

	test('keeps the stored chat windows when chat windows are disabled', () => {
		const { storageService } = createRestoration({ enabled: false });

		storageService.willSave();

		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), stored);
	});

	test('keeps the stored chat windows when AI features are hidden', () => {
		const { storageService } = createRestoration({ enabled: true, hidden: true });

		storageService.willSave();

		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), stored);
	});

	test('forgets the stored chat window of a removed session', () => {
		const { storageService, onDidChangeSessions } = createRestoration({ enabled: false });
		storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify([{ session: 'test:/session' }, { session: 'test:/other' }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		onDidChangeSessions.fire({ added: [], changed: [], removed: [{ resource: URI.parse('test:/session') } as ISession] });
		assert.deepStrictEqual(JSON.parse(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE)!), [{ session: 'test:/other' }]);

		onDidChangeSessions.fire({ added: [], changed: [], removed: [{ resource: URI.parse('test:/other') } as ISession] });
		assert.strictEqual(storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE), undefined);
	});
});

suite('Chat windows per chat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const mainChat = URI.parse('test:/session/main');
	const peerChat = URI.parse('test:/session/peer');
	const mainGroups = [{ id: 1 }];

	function createChat(resource: URI, title: string, archived = false): IChat {
		return { resource, title: observableValue('title', title), isArchived: observableValue('archived', archived) } as unknown as IChat;
	}

	function createSession(sessionTitle: string, chats: IChat[]) {
		return {
			sessionId: 'test:session',
			resource: URI.parse('test:/session'),
			title: observableValue('title', sessionTitle),
			loading: observableValue('loading', false),
			chats: observableValue('chats', chats),
		} as unknown as ISession;
	}

	function createEnvironment(session: ISession, mainActiveChat: URI | undefined, stored?: object[]) {
		const opened: { chat: URI | undefined; title: string; moveEditorsFrom: readonly unknown[] }[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override windows: IObservable<readonly IChatWindow[]> = observableValue('windows', []);
			override async open(_kind: IChatWindowKind, content: IChatWindowContent): Promise<IChatWindow | undefined> {
				opened.push({ chat: content.chat, title: content.title!.get(), moveEditorsFrom: content.editorArea!.moveEditorsFrom! });
				return undefined;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override initialRestoreComplete = observableValue('restoreComplete', true);
			override visibleSessions = observableValue('visible', []);
			override mainWindowActiveSession = observableValue('mainActive', mainActiveChat ? { sessionId: session.sessionId, activeChat: observableValue('activeChat', { resource: mainActiveChat }) } as never : undefined);
		}());
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override mainPart = { groups: mainGroups } as never;
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>()).event;
			override getSession(): ISession | undefined { return session; }
		}());
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override sentiment = { hidden: false } as IChatEntitlementService['sentiment'];
		}());
		const storageService = disposables.add(new TestStorageService());
		if (stored) {
			storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: true }));
		return { instantiationService, opened };
	}

	test('the editors move to a chat window only for the chat the main window shows', async () => {
		const session = createSession('Session', [createChat(mainChat, 'Main'), createChat(peerChat, 'Peer')]);
		const { instantiationService, opened } = createEnvironment(session, mainChat);

		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, mainChat));
		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, peerChat));

		assert.deepStrictEqual(opened.map(window => ({ chat: window.chat?.toString(), moves: window.moveEditorsFrom.length })), [
			{ chat: mainChat.toString(), moves: 1 },
			{ chat: peerChat.toString(), moves: 0 },
		]);
	});

	test('the title of a chat window is the title of its chat, or of its session while the chat has none', async () => {
		const session = createSession('Session', [createChat(mainChat, 'Main'), createChat(peerChat, '')]);
		const { instantiationService, opened } = createEnvironment(session, undefined);

		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, mainChat));
		await instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, peerChat));

		assert.deepStrictEqual(opened.map(window => window.title), ['Main', 'Session']);
	});

	test('a window is restored for each stored chat, and a stored window without a chat shows the session', async () => {
		const session = createSession('Session', [createChat(mainChat, 'Main'), createChat(peerChat, 'Peer')]);
		const { instantiationService, opened } = createEnvironment(session, undefined, [
			{ session: 'test:/session', chat: peerChat.toString() },
			{ session: 'test:/session' },
		]);

		const restoration = disposables.add(instantiationService.createInstance(ChatWindowsRestoration));
		await new Promise(resolve => setTimeout(resolve, 0));
		restoration.dispose();

		assert.deepStrictEqual(opened.map(window => window.chat?.toString()), [peerChat.toString(), undefined]);
	});

	test('a window is not restored for a stored chat that no longer exists or was archived', async () => {
		const session = createSession('Session', [createChat(mainChat, 'Main'), createChat(URI.parse('test:/session/archived'), 'Archived', true)]);
		const { instantiationService, opened } = createEnvironment(session, undefined, [
			{ session: 'test:/session', chat: peerChat.toString() },
			{ session: 'test:/session', chat: 'test:/session/archived' },
			{ session: 'test:/session', chat: mainChat.toString() },
		]);

		const restoration = disposables.add(instantiationService.createInstance(ChatWindowsRestoration));
		await new Promise(resolve => setTimeout(resolve, 0));
		restoration.dispose();

		assert.deepStrictEqual(opened.map(window => window.chat?.toString()), [mainChat.toString()]);
	});
});
