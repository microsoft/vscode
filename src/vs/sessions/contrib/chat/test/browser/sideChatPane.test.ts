/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, IEditorCloseEvent, IEditorIdentifier } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISideChatPlacementService } from '../../../../../workbench/contrib/sessions/browser/sideChatPlacement.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { ISessionsHostLayoutService } from '../../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionEditorWorkingSetOwner, ISessionEditorWorkingSetService, SessionEditorWorkingSetService } from '../../../layout/common/sessionEditorWorkingSet.js';
import { SideChatPaneContribution, SideChatTab } from '../../browser/sideChatPane.contribution.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ChatEditorContent } from '../../../../../workbench/contrib/sessions/browser/chatEditor/chatEditorContent.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../../../workbench/services/sessions/browser/sessionGridPane.js';

/** The main window's one editor group, as far as the side pane opens and closes its editors there. */
class TestEditors extends Disposable {
	readonly opened: EditorInput[] = [];
	active: EditorInput | undefined;

	private readonly _onDidCloseEditor = this._register(new Emitter<IEditorCloseEvent>());
	readonly onDidCloseEditor = this._onDidCloseEditor.event;
	private readonly _onDidActiveEditorChange = this._register(new Emitter<void>());
	readonly onDidActiveEditorChange = this._onDidActiveEditorChange.event;

	/** Opens `input` at `index`, else beside the active editor, as editors open by default; the first one becomes active. */
	async openEditor(input: EditorInput, options?: { readonly inactive?: boolean; readonly index?: number }): Promise<undefined> {
		const wasEmpty = !this.opened.length;
		if (!this.opened.includes(input)) {
			const index = options?.index ?? (this.active ? this.opened.indexOf(this.active) + 1 : this.opened.length);
			this.opened.splice(index, 0, input);
		}
		if (!options?.inactive || wasEmpty) {
			this.active = input;
			this._onDidActiveEditorChange.fire();
		}
		return undefined;
	}

	findEditors(resource: URI): IEditorIdentifier[] {
		return this.opened.filter(editor => isEqual(editor.resource, resource)).map(editor => ({ editor, groupId: 1 }));
	}

	async closeEditors(editors: readonly IEditorIdentifier[]): Promise<void> {
		for (const { editor } of editors) {
			this.close(editor as EditorInput);
		}
	}

	/** Closes every editor, as applying another working set does. */
	closeAll(): void {
		for (const editor of [...this.opened]) {
			this.close(editor);
		}
	}

	private close(editor: EditorInput): void {
		const index = this.opened.indexOf(editor);
		if (index < 0) {
			return;
		}
		this.opened.splice(index, 1);
		if (this.active === editor) {
			this.active = undefined;
		}
		this._onDidCloseEditor.fire({ editor, groupId: 1, context: EditorCloseContext.UNKNOWN, index, sticky: false });
	}
}

suite('SideChatPaneContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function chat(id: string, origin?: IChat['origin']): IChat {
		return upcastPartial<IChat>({
			resource: URI.parse(`test:///chat/${id}`),
			title: constObservable(id),
			status: constObservable(SessionStatus.Completed),
			isRead: constObservable(true),
			isArchived: constObservable(false),
			interactivity: constObservable(ChatInteractivity.Full),
			workspace: constObservable(undefined),
			updatedAt: constObservable(new Date(0)),
			origin,
		});
	}

	function setup() {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const main = chat('main');
		const source = chat('source');
		const sideStatus = observableValue('sideStatus', SessionStatus.Completed);
		const sideRead = observableValue('sideRead', true);
		const side: IChat = { ...chat('side', { kind: ChatOriginKind.SideChat, parentChat: source.resource }), status: sideStatus, isRead: sideRead };
		// The session's chats, which load after the session, such as after a reload.
		const chats = observableValue<readonly IChat[]>('chats', [main, source, side]);
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			title: constObservable('Session'),
			chats,
			mainChat: constObservable(main),
			loading: constObservable(false),
			isArchived: constObservable(false),
			isQuickChat: constObservable(false),
			workspace: constObservable(undefined),
		});
		const inSidePane = observableValue('sideChatsInSidePane', true);
		const editors = store.add(new TestEditors());
		const workingSets = new SessionEditorWorkingSetService();
		const chatHostOpenerService = new ChatHostOpenerService();
		const onDidChangeSessions = store.add(new Emitter<never>());
		const storage = store.add(new InMemoryStorageService());
		let editorVisible = true;
		const onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());
		const setEditorVisible = (visible: boolean) => {
			editorVisible = visible;
			onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible });
		};
		let reveals = 0;
		const reads: string[] = [];

		instantiationService.stub(ISideChatPlacementService, { _serviceBrand: undefined, inSidePane });
		instantiationService.stub(IChatHostOpenerService, chatHostOpenerService);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => {
				const found = session.chats.get().find(candidate => isEqual(candidate.resource, resource));
				return found ? { session, chat: found } : undefined;
			},
			getSession: resource => isEqual(resource, session.resource) ? session : undefined,
			onDidChangeSessions: onDidChangeSessions.event,
			markChatRead: async (_session, read) => { reads.push(read.title.get()); return true; },
		}));
		instantiationService.stub(ISessionEditorWorkingSetService, workingSets);
		instantiationService.stub(ISessionsHostLayoutService, upcastPartial<ISessionsHostLayoutService>({ suppressEditorPartAutoVisibility: () => Disposable.None, revealEditorPartExplicitly: () => reveals++ }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ isVisible: () => editorVisible, onDidChangePartVisibility: onDidChangePartVisibility.event }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>(editors as unknown as Partial<IEditorService>));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			whenReady: Promise.resolve(),
			mainPart: upcastPartial<IEditorGroupsService['mainPart']>({
				get activeGroup() {
					return upcastPartial<IEditorGroupsService['mainPart']['activeGroup']>({
						id: 1,
						get activeEditor() { return editors.active ?? null; },
						get count() { return editors.opened.length; },
						contains: (editor: EditorInput) => editors.opened.includes(editor),
						getIndexOfEditor: (editor: EditorInput) => editors.opened.indexOf(editor),
					});
				},
				groups: [upcastPartial<IEditorGroupsService['mainPart']['activeGroup']>({ id: 1 })],
			}),
		}));
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({ getStatusIcon: () => ({ id: 'circle' }) }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({}));
		const panes = observableValue<readonly ISessionGridPane[]>('panes', []);
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ panes }));

		const ownerOf = (chat: IChat): ISessionEditorWorkingSetOwner => ({ sessionResource: session.resource, chatResource: chat.resource });
		workingSets.setCurrentOwner(ownerOf(source));
		let contribution = store.add(instantiationService.createInstance(SideChatPaneContribution));
		/** Saves the side pane's state and starts the window again, without the editors the side pane cannot restore. */
		const reload = async (beforeStart?: () => void) => {
			await storage.flush();
			store.delete(contribution);
			editors.closeAll();
			beforeStart?.();
			contribution = store.add(instantiationService.createInstance(SideChatPaneContribution));
			await timeout(0);
		};

		/** Shows the working set of `owner`, which closes every editor, as the layout's restore does. */
		const showOwner = async (owner: IChat) => {
			const restore = workingSets.beginRestore(ownerOf(owner));
			editors.closeAll();
			restore.dispose();
			await timeout(0);
		};
		const tabs = () => editors.opened.map(editor => editor.getName());
		const active = () => editors.active?.getName();
		return { store, instantiationService, workingSets, ownerOf, main, source, side, chats, sideStatus, sideRead, inSidePane, editors, chatHostOpenerService, panes, showOwner, reload, tabs, active, setEditorVisible, reveals: () => reveals, reads };
	}

	test('opens claimed side chats as tabs of the side pane, each owner of the working set with its own, until closed', async () => {
		const { main, source, side, inSidePane, editors, chatHostOpenerService, showOwner, tabs } = setup();
		const claims = { side: !!chatHostOpenerService.getOpenerFor(side.resource), source: !!chatHostOpenerService.getOpenerFor(source.resource) };

		await chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);
		const opened = { tabs: tabs(), shown: !!chatHostOpenerService.getOpenerOf(side.resource) };
		await showOwner(main);
		const otherOwner = tabs();
		await showOwner(source);
		const ownerAgain = tabs();
		inSidePane.set(false, undefined);
		const settingOff = { tabs: tabs(), claims: !!chatHostOpenerService.getOpenerFor(side.resource) };
		inSidePane.set(true, undefined);
		await timeout(0);
		const settingOn = tabs();
		await editors.closeEditors(editors.findEditors(side.resource));
		await showOwner(main);
		await showOwner(source);

		assert.deepStrictEqual({ claims, opened, otherOwner, ownerAgain, settingOff, settingOn, closedByUser: tabs() }, {
			claims: { side: true, source: false },
			opened: { tabs: ['side'], shown: true },
			otherOwner: [],
			ownerAgain: ['side'],
			settingOff: { tabs: [], claims: false },
			settingOn: ['side'],
			closedByUser: [],
		});
	});

	test('a side chat opened while the grid moves to another chat shows for the chat it was opened for', async () => {
		const { workingSets, ownerOf, main, source, side, editors, chatHostOpenerService, showOwner, tabs } = setup();
		const toMain = workingSets.beginRestore(ownerOf(main));
		const opening = chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);
		const toSource = workingSets.beginRestore(ownerOf(source));
		editors.closeAll();
		toMain.dispose();
		toSource.dispose();
		await opening;
		await timeout(0);
		const movedOn = tabs();
		await showOwner(main);

		assert.deepStrictEqual({ movedOn, openedFor: tabs() }, { movedOn: [], openedFor: ['side'] });
	});

	test('after a reload, the side chat a chat showed opens as its chat loads, revealing the side pane only if it showed it', async () => {
		const { main, source, side, chats, chatHostOpenerService, showOwner, reload, tabs, active, setEditorVisible, reveals } = setup();
		await chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);

		const reloadWithChatsLoadingLater = async () => {
			await reload(() => chats.set([main, source], undefined));
			const beforeChatsLoad = tabs();
			const revealsBefore = reveals();
			chats.set([main, source, side], undefined);
			await timeout(0);
			return { beforeChatsLoad, tabs: tabs(), active: active(), revealed: reveals() > revealsBefore };
		};
		const shown = await reloadWithChatsLoadingLater();
		setEditorVisible(false);
		const hidden = await reloadWithChatsLoadingLater();
		setEditorVisible(true);
		await showOwner(main);
		const otherOwnerReveals = reveals();
		await showOwner(source);

		assert.deepStrictEqual({ shown, hidden, ownerAgainRevealed: reveals() > otherOwnerReveals }, {
			shown: { beforeChatsLoad: [], tabs: ['side'], active: 'side', revealed: true },
			hidden: { beforeChatsLoad: [], tabs: ['side'], active: 'side', revealed: false },
			ownerAgainRevealed: true,
		});
	});

	test('a chat\'s side chat tabs show again in their order, also after the user moved one', async () => {
		const { main, source, side, chats, editors, chatHostOpenerService, showOwner, tabs, active } = setup();
		const second = chat('second', { kind: ChatOriginKind.SideChat, parentChat: source.resource });
		const third = chat('third', { kind: ChatOriginKind.SideChat, parentChat: source.resource });
		chats.set([main, source, side, second, third], undefined);
		for (const sideChat of [side, second, third, second]) {
			await chatHostOpenerService.getOpenerFor(sideChat.resource)!.reveal(sideChat.resource);
		}
		const opened = { tabs: tabs(), active: active() };

		await showOwner(main);
		await showOwner(source);
		const shownAgain = { tabs: tabs(), active: active() };
		// The user moves the last tab first.
		editors.opened.unshift(editors.opened.pop()!);
		await showOwner(main);
		await showOwner(source);

		assert.deepStrictEqual({ opened, shownAgain, moved: { tabs: tabs(), active: active() } }, {
			opened: { tabs: ['side', 'second', 'third'], active: 'second' },
			shownAgain: { tabs: ['side', 'second', 'third'], active: 'second' },
			moved: { tabs: ['third', 'side', 'second'], active: 'second' },
		});
	});

	test('a side chat that a detached pane of the grid shows stays there', () => {
		const { side, panes, chatHostOpenerService } = setup();
		const claimedBefore = !!chatHostOpenerService.getOpenerFor(side.resource);
		panes.set([upcastPartial<ISessionGridPane>({ kind: SessionGridPaneKind.Detached, chat: constObservable(side) })], undefined);

		assert.deepStrictEqual({ claimedBefore, claimedWhileDetached: !!chatHostOpenerService.getOpenerFor(side.resource) }, { claimedBefore: true, claimedWhileDetached: false });
	});

	test('only side chats open beside a side chat tab', async () => {
		const { main, side, chatHostOpenerService } = setup();
		await chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);
		const opener = chatHostOpenerService.getOpenerOf(side.resource)!;

		assert.deepStrictEqual({ sideChat: opener.opensBeside?.(side.resource), other: opener.opensBeside?.(main.resource) }, { sideChat: true, other: false });
	});

	test('a side chat is read once its tab shows while the editor area does', () => {
		const { store, instantiationService, side, sideRead, setEditorVisible, reads } = setup();
		const tab = store.add(instantiationService.createInstance(SideChatTab, side.resource, () => { }));
		store.add(tab.attach(upcastPartial<ChatEditorContent>({ visible: constObservable(true) })));

		setEditorVisible(false);
		sideRead.set(false, undefined);
		const whileHidden = [...reads];
		setEditorVisible(true);

		assert.deepStrictEqual({ whileHidden, shown: reads }, { whileHidden: [], shown: ['side'] });
	});

	test('a side chat tab shows the side chat icon, and its status while it works, waits, failed, or is unread', async () => {
		const { side, sideStatus, sideRead, editors, chatHostOpenerService } = setup();
		await chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);
		const icon = () => {
			const shown = editors.opened[0].getIcon();
			return ThemeIcon.isThemeIcon(shown) ? shown.id : undefined;
		};

		const icons = [icon()];
		for (const status of [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Error, SessionStatus.Completed]) {
			sideStatus.set(status, undefined);
			icons.push(icon());
		}
		sideRead.set(false, undefined);
		icons.push(icon());

		assert.deepStrictEqual(icons, ['comment-discussion', 'loading~spin', 'circle', 'circle', 'comment-discussion', 'circle']);
	});

});
