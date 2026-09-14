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
import { IMenu, IMenuService, isIMenuItem, MenuItemAction, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ISessionGroup, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import type { SessionView } from '../../../../browser/parts/sessionView.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createSession } from './sessionsListTestUtils.js';
import '../../browser/sessionsActions.js';

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
		const renameInputs: string[] = [];
		const openedToSide: IChat[] = [];
		const harness = createListHarness(disposables, [session], instantiationService => {
			instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
				override async input(options?: { value?: string }): Promise<string | undefined> {
					renameInputs.push(options?.value ?? '');
					return ' Renamed Peer ';
				}
			});
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable(undefined);
				override readonly visibleSessions = constObservable([]);
				override async canOpenSession(): Promise<boolean> { return true; }
				override showSession(): void { }
				override async openChatToSide(_session: ISession, chatResource: URI): Promise<void> {
					const chat = session.chats.get().find(candidate => candidate.resource.toString() === chatResource.toString());
					if (chat) {
						openedToSide.push(chat);
					}
				}
			});
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override getSessionView(): SessionView {
					return upcastPartial<SessionView>({
						openChatToSide: async (resource: URI) => {
							const chat = session.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
							if (chat) {
								openedToSide.push(chat);
							}
						},
					});
				}
			});
		});
		const coreActionIds = new Set(['sessions.list.renameChat', 'sessions.list.openChatToSide', 'sessions.list.deleteChat']);
		const menuItems = MenuRegistry.getMenuItems(Menus.SessionChatItemContext)
			.filter(isIMenuItem)
			.filter(item => coreActionIds.has(item.command.id));
		assert.deepStrictEqual(menuItems.map(item => ({
			id: item.command.id,
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			group: item.group,
			order: item.order,
			when: item.when?.serialize(),
		})), [
			{ id: 'sessions.list.renameChat', title: 'Rename...', group: '1_chat', order: 1, when: 'sessionChatItem.canRename && !sessionChatItem.isUntitled' },
			{ id: 'sessions.list.openChatToSide', title: 'Open to the Side', group: '1_chat', order: 2, when: undefined },
			{ id: 'sessions.list.deleteChat', title: 'Delete...', group: '2_delete', order: 1, when: 'sessionChatItem.canDelete' },
		]);
		const chatContext = { session, chat: peer };
		for (const actionId of ['sessions.list.renameChat', 'sessions.list.openChatToSide', 'sessions.list.deleteChat']) {
			await harness.instantiationService.invokeFunction(CommandsRegistry.getCommand(actionId)!.handler, chatContext);
		}
		const readOnlyContext = { session, chat: nonDeletable };
		await harness.instantiationService.invokeFunction(CommandsRegistry.getCommand('sessions.list.renameChat')!.handler, readOnlyContext);
		await harness.instantiationService.invokeFunction(CommandsRegistry.getCommand('sessions.list.deleteChat')!.handler, readOnlyContext);

		assert.deepStrictEqual({
			renameInputs,
			renamedChats: harness.managementService.renamedChats,
			openedToSide,
			deletedChats: harness.managementService.deletedChats,
			deleteChatOptions: harness.managementService.deleteChatOptions,
		}, {
			renameInputs: ['Peer'],
			renamedChats: [{ session, chatResource: peer.resource, title: 'Renamed Peer' }],
			openedToSide: [peer],
			deletedChats: [{ session, chatResource: peer.resource }],
			deleteChatOptions: [undefined],
		});
	});
});
