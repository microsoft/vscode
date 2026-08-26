/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { IAction, SubmenuAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { isDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ISessionGroup, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createSession } from './sessionsListTestUtils.js';

class TestContextMenuService extends mock<IContextMenuService>() {
	override readonly onDidShowContextMenu = Event.None;
	override readonly onDidHideContextMenu = Event.None;
	delegate: IContextMenuDelegate | undefined;

	override showContextMenu(delegate: IContextMenuDelegate): void {
		this.delegate = delegate;
	}
}

class TestSessionGroupsService extends mock<ISessionGroupsService>() {
	override readonly onDidChange = Event.None;

	constructor(
		private readonly groups: readonly ISessionGroup[],
		private readonly membership: ReadonlyMap<string, string>,
	) {
		super();
	}

	override getGroups(): ISessionGroup[] {
		return [...this.groups];
	}

	override getGroup(groupId: string): ISessionGroup | undefined {
		return this.groups.find(group => group.id === groupId);
	}

	override getGroupOfSession(sessionId: string): string | undefined {
		return this.membership.get(sessionId);
	}

	override getSessionIdsInGroup(groupId: string): string[] {
		return [...this.membership].filter(([, id]) => id === groupId).map(([sessionId]) => sessionId);
	}
}

function dispatchContextMenu(target: HTMLElement): void {
	target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
}

function snapshotActions(actions: readonly IAction[]): { ids: string[]; disposableIds: string[] } {
	const allActions = actions.flatMap(action => action instanceof SubmenuAction ? [action, ...action.actions] : [action]);
	return {
		ids: allActions.map(action => action.id),
		disposableIds: allActions.filter(isDisposable).map(action => action.id),
	};
}

suite('Sessions list context menus', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const group: ISessionGroup = { id: 'group', name: 'Group', createdAt: 1 };
	const targetGroup: ISessionGroup = { id: 'target', name: 'Target', createdAt: 2 };

	function createList(grouped: boolean, includeExtensionAction: boolean) {
		const { session } = createSession('Session');
		const contextMenuService = new TestContextMenuService();
		let menuDisposed = false;
		const harness = createListHarness(disposables, [session], instantiationService => {
			const contextKeyService = instantiationService.get(IContextKeyService);
			const commandService = instantiationService.get(ICommandService);
			instantiationService.stub(IContextMenuService, contextMenuService);
			instantiationService.stub(ISessionGroupsService, new TestSessionGroupsService(
				[group, targetGroup],
				grouped ? new Map([[session.sessionId, group.id]]) : new Map(),
			));
			instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
				override createMenu(): IMenu {
					const disposable = toDisposable(() => menuDisposed = true);
					const extensionAction = new MenuItemAction({
						id: 'extension.action',
						title: 'Extension Action',
						source: { id: 'test.extension', title: 'Test Extension' },
					}, undefined, undefined, undefined, undefined, contextKeyService, commandService);
					return {
						onDidChange: Event.None,
						getActions: () => includeExtensionAction ? [['extension', [extensionAction]]] : [],
						dispose: () => disposable.dispose(),
					};
				}
			});
		});
		const container = harness.createContainer();
		const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
			grouping: () => SessionsGrouping.Date,
			sorting: () => SessionsSorting.Created,
			onSessionOpen: () => { },
		}));
		list.layout(300, 400);
		return { container, contextMenuService, menuDisposed: () => menuDisposed };
	}

	test('empty area actions are transient non-disposable values', () => {
		const { container, contextMenuService } = createList(false, false);
		const listRows = container.querySelector<HTMLElement>('.monaco-list-rows');
		assert.ok(listRows);

		dispatchContextMenu(listRows);

		assert.deepStrictEqual(snapshotActions(contextMenuService.delegate!.getActions()), {
			ids: ['sessions.createGroup'],
			disposableIds: [],
		});
	});

	test('session actions and extension wrappers are transient and menu-scoped', () => {
		for (const grouped of [false, true]) {
			const { container, contextMenuService, menuDisposed } = createList(grouped, true);
			const sessionRow = container.querySelector<HTMLElement>('.session-item');
			assert.ok(sessionRow);

			dispatchContextMenu(sessionRow);
			const snapshot = snapshotActions(contextMenuService.delegate!.getActions());
			contextMenuService.delegate!.onHide?.(false);

			assert.deepStrictEqual({
				grouped,
				...snapshot,
				menuDisposed: menuDisposed(),
			}, {
				grouped,
				ids: grouped
					? ['extension.action', 'vs.actions.separator', 'sessions.createGroup', 'sessions.addToGroupSubmenu', 'sessions.addToGroup.target', 'sessions.removeFromGroup']
					: ['extension.action', 'vs.actions.separator', 'sessions.createGroup', 'sessions.addToGroupSubmenu', 'sessions.addToGroup.target', 'sessions.addToGroup.group'],
				disposableIds: [],
				menuDisposed: true,
			});
		}
	});

	test('group header actions are transient non-disposable values', () => {
		const { container, contextMenuService } = createList(true, false);
		const groupHeader = container.querySelector<HTMLElement>('.session-group');
		assert.ok(groupHeader);

		dispatchContextMenu(groupHeader);

		assert.deepStrictEqual(snapshotActions(contextMenuService.delegate!.getActions()), {
			ids: ['sessions.createGroup', 'vs.actions.separator', 'sessions.renameGroupAction', 'sessions.deleteGroupAction'],
			disposableIds: [],
		});
	});

	test('chat rows expose capability-gated rename, side-open, and deletion', async () => {
		const createChat = (title: string, canRename: boolean, canDelete: boolean): IChat => upcastPartial<IChat>({
			resource: URI.parse(`test-chat:/${title}`),
			title: constObservable(title),
			updatedAt: constObservable(new Date()),
			status: constObservable(SessionStatus.Completed),
			interactivity: constObservable(ChatInteractivity.Full),
			capabilities: constObservable({ canRename, canDelete }),
		});
		const main = createChat('Session', true, true);
		const peer = createChat('Peer', true, true);
		const nonDeletable = createChat('Read Only', false, false);
		const { session: baseSession } = createSession('Session');
		const session: ISession = {
			...baseSession,
			chats: constObservable([main, peer, nonDeletable]),
			mainChat: constObservable(main),
		};
		const contextMenuService = new TestContextMenuService();
		const renameInputs: string[] = [];
		const harness = createListHarness(disposables, [session], instantiationService => {
			instantiationService.stub(IContextMenuService, contextMenuService);
			instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
				override async input(options?: { value?: string }): Promise<string | undefined> {
					renameInputs.push(options?.value ?? '');
					return ' Renamed Peer ';
				}
			});
		});
		const opened: { chat: IChat; preserveFocus: boolean; sideBySide: boolean }[] = [];
		const openedToSide: IChat[] = [];
		const container = harness.createContainer();
		const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
			grouping: () => SessionsGrouping.Date,
			sorting: () => SessionsSorting.Created,
			onSessionOpen: () => { },
			onChatOpen: (_session, chat, preserveFocus, sideBySide) => opened.push({ chat, preserveFocus, sideBySide }),
			onChatOpenToSide: (_session, chat) => openedToSide.push(chat),
		}));
		list.layout(300, 400);
		const chatRows = [...container.querySelectorAll<HTMLElement>('.session-chat-item')];

		dispatchContextMenu(chatRows.find(row => row.textContent === 'Peer')!);
		const peerActions = contextMenuService.delegate!.getActions();
		await peerActions[0].run();
		await peerActions[1].run();
		await peerActions[3].run();

		dispatchContextMenu(chatRows.find(row => row.textContent === 'Read Only')!);
		const readOnlyActions = contextMenuService.delegate!.getActions();

		assert.deepStrictEqual({
			peerActionIds: peerActions.map(action => action.id),
			readOnlyActionIds: readOnlyActions.map(action => action.id),
			renameInputs,
			renamedChats: harness.managementService.renamedChats,
			opened,
			openedToSide,
			deletedChats: harness.managementService.deletedChats,
		}, {
			peerActionIds: ['sessions.list.renameChat', 'sessions.list.openChatToSide', 'vs.actions.separator', 'sessions.list.deleteChat'],
			readOnlyActionIds: ['sessions.list.openChatToSide'],
			renameInputs: ['Peer'],
			renamedChats: [{ session, chatResource: peer.resource, title: 'Renamed Peer' }],
			opened: [],
			openedToSide: [peer],
			deletedChats: [{ session, chatResource: peer.resource }],
		});
	});
});
