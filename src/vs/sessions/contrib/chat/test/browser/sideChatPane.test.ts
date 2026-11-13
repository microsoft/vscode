/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { EditorCloseContext, IEditorCloseEvent, IEditorIdentifier } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISideChatPlacementService } from '../../../../../workbench/contrib/sessions/browser/sideChatPlacement.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../../workbench/services/sessions/browser/chatHostOpener.js';
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

	async openEditor(input: EditorInput, options?: { readonly inactive?: boolean }): Promise<undefined> {
		if (!this.opened.includes(input)) {
			this.opened.push(input);
		}
		if (!options?.inactive) {
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
		const sideRead = observableValue('sideRead', true);
		const side: IChat = { ...chat('side', { kind: ChatOriginKind.SideChat, parentChat: source.resource }), isRead: sideRead };
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			title: constObservable('Session'),
			chats: constObservable([main, source, side]),
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
		let editorVisible = true;
		const onDidChangePartVisibility = store.add(new Emitter<IPartVisibilityChangeEvent>());
		const setEditorVisible = (visible: boolean) => {
			editorVisible = visible;
			onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible });
		};
		const reads: string[] = [];

		instantiationService.stub(ISideChatPlacementService, { _serviceBrand: undefined, inSidePane });
		instantiationService.stub(IChatHostOpenerService, chatHostOpenerService);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => {
				const found = session.chats.get().find(candidate => isEqual(candidate.resource, resource));
				return found ? { session, chat: found } : undefined;
			},
			onDidChangeSessions: onDidChangeSessions.event,
			markChatRead: async (_session, read) => { reads.push(read.title.get()); return true; },
		}));
		instantiationService.stub(ISessionEditorWorkingSetService, workingSets);
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ isVisible: () => editorVisible, onDidChangePartVisibility: onDidChangePartVisibility.event }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>(editors as unknown as Partial<IEditorService>));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			whenReady: Promise.resolve(),
			mainPart: upcastPartial<IEditorGroupsService['mainPart']>({
				get activeGroup() { return upcastPartial<IEditorGroupsService['mainPart']['activeGroup']>({ id: 1, get activeEditor() { return editors.active ?? null; } }); },
				groups: [upcastPartial<IEditorGroupsService['mainPart']['activeGroup']>({ id: 1 })],
			}),
		}));
		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({ getStatusIcon: () => ({ id: 'circle' }) }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({}));
		const panes = observableValue<readonly ISessionGridPane[]>('panes', []);
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ panes }));

		const ownerOf = (chat: IChat): ISessionEditorWorkingSetOwner => ({ sessionResource: session.resource, chatResource: chat.resource });
		workingSets.setCurrentOwner(ownerOf(source));
		store.add(instantiationService.createInstance(SideChatPaneContribution));

		const tabs = () => editors.opened.map(editor => editor.getName());
		return { store, instantiationService, main, source, side, sideRead, inSidePane, editors, chatHostOpenerService, panes, tabs, setEditorVisible, reads };
	}

	test('opens claimed side chats as tabs of the side pane until closed, and only while side chats show there', async () => {
		const { source, side, inSidePane, editors, chatHostOpenerService, tabs } = setup();
		const claims = { side: !!chatHostOpenerService.getOpenerFor(side.resource), source: !!chatHostOpenerService.getOpenerFor(source.resource) };

		await chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);
		const opened = { tabs: tabs(), shown: !!chatHostOpenerService.getOpenerOf(side.resource) };
		await editors.closeEditors(editors.findEditors(side.resource));
		const closedByUser = { tabs: tabs(), shown: !!chatHostOpenerService.getOpenerOf(side.resource) };
		await chatHostOpenerService.getOpenerFor(side.resource)!.reveal(side.resource);
		inSidePane.set(false, undefined);
		const settingOff = { tabs: tabs(), claims: !!chatHostOpenerService.getOpenerFor(side.resource) };

		assert.deepStrictEqual({ claims, opened, closedByUser, settingOff }, {
			claims: { side: true, source: false },
			opened: { tabs: ['side'], shown: true },
			closedByUser: { tabs: [], shown: false },
			settingOff: { tabs: [], claims: false },
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
});
