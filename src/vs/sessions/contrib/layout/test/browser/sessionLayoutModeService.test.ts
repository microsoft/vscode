/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ChatLayoutMode, IChatLayoutOwner, SESSIONS_LAYOUT_SCOPE_SETTING } from '../../../../common/chatLayout.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { SessionLayoutModeService } from '../../../../services/layoutMode/browser/sessionLayoutModeService.js';
import { IRememberedLayoutMode, LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IChatDeletedEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { makeSession } from './layoutControllerTestUtils.js';

suite('Sessions - SessionLayoutModeService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const stacked: IRememberedLayoutMode = { mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: true };
	const sideBySide: IRememberedLayoutMode = { mode: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false };
	const editorOnly: IRememberedLayoutMode = { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.Stacked, inputOnly: false };

	const sessionA = URI.parse('test:/a');
	const sessionB = URI.parse('test:/b');
	const mainA: IChatLayoutOwner = { sessionResource: sessionA, chatResource: sessionA };
	const peerA: IChatLayoutOwner = { sessionResource: sessionA, chatResource: URI.parse('test:/a/peer') };
	const mainB: IChatLayoutOwner = { sessionResource: sessionB, chatResource: sessionB };

	interface IHarness {
		readonly storageService: TestStorageService;
		readonly onDidDeleteChat: Emitter<IChatDeletedEvent>;
		readonly onDidDeleteSession: Emitter<ISession>;
		readonly onDidArchiveSession: Emitter<ISession>;
		readonly onDidReplaceSession: Emitter<{ readonly from: ISession; readonly to: ISession }>;
		create(): SessionLayoutModeService;
	}

	function createHarness(scope: ChatLayoutMode, disposables: DisposableStore, storageService = disposables.add(new TestStorageService())): IHarness {
		const onDidDeleteChat = disposables.add(new Emitter<IChatDeletedEvent>());
		const onDidDeleteSession = disposables.add(new Emitter<ISession>());
		const onDidArchiveSession = disposables.add(new Emitter<ISession>());
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidDeleteChat = onDidDeleteChat.event;
			override readonly onDidDeleteSession = onDidDeleteSession.event;
			override readonly onDidArchiveSession = onDidArchiveSession.event;
			override readonly onDidReplaceSession = onDidReplaceSession.event;
		};
		const configurationService = new TestConfigurationService({ [SESSIONS_LAYOUT_SCOPE_SETTING]: scope });
		return {
			storageService, onDidDeleteChat, onDidDeleteSession, onDidArchiveSession, onDidReplaceSession,
			create: () => disposables.add(new SessionLayoutModeService(storageService, configurationService, new NullLogService(), sessionsManagementService)),
		};
	}

	test('the main window remembers modes as its layout scope scopes them; chat windows always per chat', () => {
		const results = (['chat', 'chat-shared', 'session-shared'] as const).map(scope => {
			const service = createHarness(scope, store.add(new DisposableStore())).create();
			service.setMainWindowMode(mainA, LayoutModeOwnerKind.Existing, stacked);
			service.setMainWindowMode(mainB, LayoutModeOwnerKind.Draft, editorOnly);
			service.setChatWindowMode(peerA, sideBySide);
			return {
				scope,
				mainA: service.getMainWindowMode(mainA, LayoutModeOwnerKind.Existing)?.mode,
				peerA: service.getMainWindowMode(peerA, LayoutModeOwnerKind.Existing)?.mode,
				mainBDraft: service.getMainWindowMode(mainB, LayoutModeOwnerKind.Draft)?.mode,
				mainBExisting: service.getMainWindowMode(mainB, LayoutModeOwnerKind.Existing)?.mode,
				chatWindowPeerA: service.getChatWindowMode(peerA)?.mode,
				chatWindowMainA: service.getChatWindowMode(mainA)?.mode,
			};
		});

		assert.deepStrictEqual(results, [
			{ scope: 'chat', mainA: 'stacked', peerA: undefined, mainBDraft: 'editorOnly', mainBExisting: 'editorOnly', chatWindowPeerA: 'sideBySide', chatWindowMainA: undefined },
			{ scope: 'chat-shared', mainA: 'stacked', peerA: 'stacked', mainBDraft: 'editorOnly', mainBExisting: 'stacked', chatWindowPeerA: 'sideBySide', chatWindowMainA: undefined },
			{ scope: 'session-shared', mainA: 'stacked', peerA: 'stacked', mainBDraft: 'editorOnly', mainBExisting: 'stacked', chatWindowPeerA: 'sideBySide', chatWindowMainA: undefined },
		]);
	});

	test('a chat window opens as the chat last showed in one, else as the main window shows it; the main window adopts it back only per chat', () => {
		const results = (['chat', 'chat-shared'] as const).map(scope => {
			const service = createHarness(scope, store.add(new DisposableStore())).create();
			service.setMainWindowMode(mainA, LayoutModeOwnerKind.Existing, sideBySide);
			const fromMainWindow = service.getChatWindowInitialMode(mainA, LayoutModeOwnerKind.Existing);
			service.setChatWindowMode(mainA, stacked);
			const fromChatWindow = service.getChatWindowInitialMode(mainA, LayoutModeOwnerKind.Existing);
			const returned = service.returnToMainWindow(mainA, LayoutModeOwnerKind.Existing);
			return { scope, fromMainWindow, fromChatWindow, returned, peerReturned: service.returnToMainWindow(peerA, LayoutModeOwnerKind.Existing) };
		});

		assert.deepStrictEqual(results, [
			{ scope: 'chat', fromMainWindow: sideBySide, fromChatWindow: stacked, returned: stacked, peerReturned: undefined },
			{ scope: 'chat-shared', fromMainWindow: sideBySide, fromChatWindow: stacked, returned: sideBySide, peerReturned: sideBySide },
		]);
	});

	test('persists per scope, forgets deleted and archived chats, and moves a graduated draft to its session', () => {
		const disposables = store.add(new DisposableStore());
		const harness = createHarness('chat', disposables);
		const service = harness.create();
		const draft = makeSession(URI.parse('test:/draft'));
		const committed = makeSession(URI.parse('test:/committed'));
		const draftMain: IChatLayoutOwner = { sessionResource: draft.resource, chatResource: draft.mainChat.get().resource };
		const draftPeer: IChatLayoutOwner = { sessionResource: draft.resource, chatResource: URI.parse('test:/draft/peer') };

		service.setMainWindowMode(mainA, LayoutModeOwnerKind.Existing, stacked);
		service.setMainWindowMode(peerA, LayoutModeOwnerKind.Existing, editorOnly);
		service.setChatWindowMode(peerA, editorOnly);
		service.setMainWindowMode(mainB, LayoutModeOwnerKind.Existing, sideBySide);
		service.setMainWindowMode(draftMain, LayoutModeOwnerKind.Draft, editorOnly);
		service.setChatWindowMode(draftPeer, stacked);

		harness.onDidDeleteChat.fire({ session: makeSession(sessionA), sessionResource: sessionA, chatResource: peerA.chatResource });
		harness.onDidArchiveSession.fire(makeSession(sessionB));
		harness.onDidReplaceSession.fire({ from: draft, to: committed });

		// Reloaded from storage.
		const reloaded = createHarness('chat', disposables, harness.storageService).create();
		const committedMain: IChatLayoutOwner = { sessionResource: committed.resource, chatResource: committed.mainChat.get().resource };
		const committedPeer: IChatLayoutOwner = { sessionResource: committed.resource, chatResource: draftPeer.chatResource };

		assert.deepStrictEqual({
			mainA: reloaded.getMainWindowMode(mainA, LayoutModeOwnerKind.Existing),
			peerA: reloaded.getMainWindowMode(peerA, LayoutModeOwnerKind.Existing),
			chatWindowPeerA: reloaded.getChatWindowMode(peerA),
			mainB: reloaded.getMainWindowMode(mainB, LayoutModeOwnerKind.Existing),
			draftMain: reloaded.getMainWindowMode(draftMain, LayoutModeOwnerKind.Draft),
			committedMain: reloaded.getMainWindowMode(committedMain, LayoutModeOwnerKind.Existing),
			committedPeerChatWindow: reloaded.getChatWindowMode(committedPeer),
		}, {
			mainA: stacked,
			peerA: undefined,
			chatWindowPeerA: undefined,
			mainB: undefined,
			draftMain: undefined,
			committedMain: editorOnly,
			committedPeerChatWindow: stacked,
		});
	});

	test('writes only modes that changed, and remembers the chats set most recently', () => {
		class CountingStorageService extends TestStorageService {
			writes = 0;
			override store(key: string, value: string | number | boolean | object | undefined | null, scope: StorageScope, target: StorageTarget): void {
				this.writes++;
				super.store(key, value, scope, target);
			}
		}
		const disposables = store.add(new DisposableStore());
		const storageService = disposables.add(new CountingStorageService());
		const service = createHarness('chat', disposables, storageService).create();

		service.setMainWindowMode(mainA, LayoutModeOwnerKind.Existing, stacked);
		const changed = storageService.writes;
		service.setMainWindowMode(mainA, LayoutModeOwnerKind.Existing, { ...stacked });
		const unchanged = storageService.writes;
		// Two hundred other chats after it, the most remembered.
		const others = Array.from({ length: 200 }, (_, index): IChatLayoutOwner => ({ sessionResource: URI.parse(`test:/other/${index}`), chatResource: URI.parse(`test:/other/${index}`) }));
		for (const owner of others) {
			service.setMainWindowMode(owner, LayoutModeOwnerKind.Existing, sideBySide);
		}
		const reloaded = createHarness('chat', disposables, storageService).create();

		assert.deepStrictEqual({
			changed, unchanged,
			first: service.getMainWindowMode(mainA, LayoutModeOwnerKind.Existing),
			oldestOther: service.getMainWindowMode(others[0], LayoutModeOwnerKind.Existing),
			reloadedFirst: reloaded.getMainWindowMode(mainA, LayoutModeOwnerKind.Existing),
			reloadedNewest: reloaded.getMainWindowMode(others[199], LayoutModeOwnerKind.Existing),
		}, {
			changed: 1,
			unchanged: 1,
			first: undefined,
			oldestOther: sideBySide,
			reloadedFirst: undefined,
			reloadedNewest: sideBySide,
		});
	});

	test('drops a malformed record whole instead of applying part of it', () => {
		const disposables = store.add(new DisposableStore());
		const storageService = disposables.add(new TestStorageService());
		storageService.store('sessions.chatLayout.layoutMode', JSON.stringify({ version: 1, entries: [[sessionA.toString(), sessionA.toString(), stacked], [sessionB.toString(), sessionB.toString(), { mode: 'sideways' }]] }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('sessions.chatWindow.layoutMode', JSON.stringify({ version: 2, entries: [] }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const service = createHarness('chat', disposables, storageService).create();

		assert.deepStrictEqual({
			mainA: service.getMainWindowMode(mainA, LayoutModeOwnerKind.Existing),
			mainStored: storageService.get('sessions.chatLayout.layoutMode', StorageScope.WORKSPACE),
			chatWindowStored: storageService.get('sessions.chatWindow.layoutMode', StorageScope.WORKSPACE),
		}, {
			mainA: undefined,
			mainStored: undefined,
			chatWindowStored: undefined,
		});
	});
});
