/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupView } from '../../../../workbench/browser/parts/editor/editor.js';
import { EditorsOrder } from '../../../../workbench/common/editor.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup, IEditorGroupsService, IEmbeddedEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { EditorPartMultipleEditorGroupsContext } from '../../../../workbench/common/contextkeys.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { EmptyEditorGroupAddTab } from '../../../browser/parts/emptyEditorGroupAddTab.js';
import { SessionLayoutMode } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowEditorAreaEditorContext, ChatWindowHasEditorAreaContext, ChatWindowIdContext, ChatWindowSessionHasWorkspaceContext, ChatWindowTerminalRowContext, IChatWindow, IChatWindowService, SessionLayoutModeContext } from '../../../services/chatWindow/browser/chatWindowService.js';
import { showChatWindowLayout } from './chatWindowLayoutActions.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { registerChangesetOperations, registerResourceChangesetOperations } from '../../changes/browser/changesActions.js';
import { bindSessionScopeContextKeys } from '../../changes/browser/sessionActionsHost.js';
import { IChangesSessionScope, IChangesViewService } from '../../changes/common/changesViewService.js';
import { SessionChangesEditorInput } from '../../changes/browser/sessionChangesEditorInput.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';

/** An entry that opens a tab of the editor area of a chat window, checked while the editor area shows the tab. */
interface IChatWindowTabEntry {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	readonly editorId: string;
	readonly order: number;
	/** When the session has the tab: changes and files need a workspace. */
	readonly when?: ContextKeyExpression;
	open(accessor: ServicesAccessor, window: IChatWindow, group: IEditorGroup): Promise<void>;
}

export const chatWindowTabEntries: readonly IChatWindowTabEntry[] = [{
	id: 'sessions.chatWindow.openChanges',
	title: localize2('chatWindowChanges', "Changes"),
	icon: Codicon.diffMultiple,
	editorId: SessionChangesEditorInput.EDITOR_ID,
	order: 1,
	when: ChatWindowSessionHasWorkspaceContext,
	async open(accessor, window, group) {
		const session = window.session.get();
		if (session) {
			const sessionChangesService = accessor.get(ISessionChangesService);
			// An existing Changes tab is activated in place rather than moved to the end.
			// The window's own Changes editor, of the chat it shows, whichever chat of its session the main window shows.
			const chatResource = session.scopedChatResource;
			const index = group.findEditors(sessionChangesService.getChangesEditorResource(session.resource, chatResource)).length > 0 ? undefined : group.count;
			await sessionChangesService.openChangesEditor(session.resource, { index, chatResource }, group);
		}
	},
}, {
	id: 'sessions.chatWindow.openFiles',
	title: localize2('chatWindowFiles', "Files"),
	icon: EmptyFileEditorInput.ICON,
	editorId: EmptyFileEditorInput.EDITOR_ID,
	order: 2,
	when: ChatWindowSessionHasWorkspaceContext,
	async open(accessor, window, group) {
		const workspace = window.session.get()?.activeChat.get().workspace.get();
		const index = group.editors.some(editor => editor instanceof EmptyFileEditorInput) ? undefined : group.count;
		await accessor.get(IEditorService).openEditor(accessor.get(IInstantiationService).createInstance(EmptyFileEditorInput, workspace), { pinned: true, index }, group);
	},
}, {
	id: 'sessions.chatWindow.openBrowser',
	title: localize2('chatWindowBrowser', "Browser"),
	icon: Codicon.globe,
	editorId: BrowserEditorInput.EDITOR_ID,
	order: 3,
	async open(accessor, _window, group) {
		// An existing browser tab is activated in place; otherwise a new one opens, with its URL input focused.
		const existing = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(editor => editor instanceof BrowserEditorInput);
		const browserInput = existing ?? accessor.get(IBrowserViewWorkbenchService).getOrCreateLazy({ id: generateUuid() });
		const editorPane = await accessor.get(IEditorService).openEditor(browserInput, undefined, group);
		if (editorPane && !browserInput.url) {
			await accessor.get(ICommandService).executeCommand(BrowserViewCommandId.FocusUrlInput, editorPane);
		}
	},
}];

for (const entry of chatWindowTabEntries) {
	const when = ContextKeyExpr.and(ChatContextKeys.enabled, ChatWindowHasEditorAreaContext, entry.when);
	// Checked while the editor area shows its tab.
	const shown = ContextKeyExpr.and(ChatWindowEditorAreaEditorContext.isEqualTo(entry.editorId), SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly));
	// The same entries as the Add Tab actions of the main window, for the editor area of a chat window.
	for (const menu of [Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab]) {
		MenuRegistry.appendMenuItem(menu, {
			command: { id: entry.id, title: entry.title, icon: entry.icon },
			group: 'navigation',
			order: entry.order - 1,
			when,
		});
	}
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: entry.id,
				title: entry.title,
				icon: entry.icon,
				precondition: when,
				toggled: shown,
				menu: { id: Menus.SessionActivityBar, group: SessionActivityBarGroup.SidePanel, order: entry.order, when },
			});
		}

		override async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
			// The chat window the entry was invoked from, by its strip or its editor area, not the one that happens to be active.
			const window = accessor.get(IChatWindowService).resolveWindow(context);
			const group = window?.editorGroup;
			if (!window || !group) {
				return;
			}
			window.showEditor();
			await entry.open(accessor, window, group);
		}
	});
}

export const CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID = 'sessions.chatWindow.closeEditorArea';

/**
 * The one close button of an empty editor area of a chat window, in place of the Close Group of the group and the Close
 * Editor Area of the main window's watermark: it shows only the chat of the window. With several groups, an empty one
 * offers Close Group instead.
 */
registerAction2(class CloseChatWindowEditorAreaAction extends Action2 {
	constructor() {
		super({
			id: CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID,
			title: localize2('chatWindowCloseEditorArea', "Close Editor Area"),
			icon: Codicon.close,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatWindowHasEditorAreaContext),
			menu: {
				id: MenuId.EmptyEditorGroup,
				group: 'navigation',
				order: 20,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatWindowHasEditorAreaContext, ChatWindowTerminalRowContext.negate(), EditorPartMultipleEditorGroupsContext.negate()),
			},
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		// The empty group passes itself: the chat window whose editor area it is in.
		const window = accessor.get(IChatWindowService).resolveWindow(context);
		if (window) {
			showChatWindowLayout(window, SessionLayoutMode.ChatOnly);
		}
	}
});

/** Offers the Add Tab entries in the empty groups of the editor area of a chat window, as the main window does. */
export function addEmptyEditorAreaAddTab(part: IEmbeddedEditorPart, instantiationService: IInstantiationService): IDisposable {
	const store = new DisposableStore();
	const controls = store.add(new DisposableMap<IEditorGroup>());
	const add = (group: IEditorGroup) => controls.set(group, instantiationService.createInstance(EmptyEditorGroupAddTab, group as IEditorGroupView, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab));
	part.groups.forEach(add);
	store.add(part.onDidAddGroup(add));
	store.add(part.onDidRemoveGroup(group => controls.deleteAndDispose(group)));
	return store;
}

/**
 * The actions that the changesets of a chat window's session contribute, such as Commit and the operations on a file
 * (Keep, Undo, Discard Changes), and the menus that show them in its editor area: in every chat window, those of the
 * session it shows, evaluated against the context keys of that session, never those of the main window's session.
 */
export class ChatWindowChangesetActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.chatWindowChangesetActions';

	private readonly _windows = this._register(new DisposableMap<number>());

	constructor(
		@IChatWindowService chatWindowService: IChatWindowService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IActionViewItemService private readonly _actionViewItemService: IActionViewItemService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._register(autorun(reader => {
			const windows = chatWindowService.windows.read(reader);
			for (const windowId of Array.from(this._windows.keys())) {
				if (!windows.some(window => window.windowId === windowId)) {
					this._windows.deleteAndDispose(windowId);
				}
			}
			for (const window of windows) {
				if (!this._windows.has(window.windowId)) {
					this._windows.set(window.windowId, this._registerWindow(window));
				}
			}
		}));
	}

	private _registerWindow(window: IChatWindow): IDisposable {
		const store = new DisposableStore();
		const scope: IChangesSessionScope = { session: window.session, changes: this._changesViewService.getSessionChanges(window.session) };
		if (window.editorArea) {
			// The menus of its editor area, such as its editor titles and the toolbars of the files of its Changes editor,
			// read the keys of its session, which its context key service would otherwise inherit from the active session.
			const contextKeyService = this._editorGroupsService.getScopedInstantiationService(window.editorArea).invokeFunction(accessor => accessor.get(IContextKeyService));
			store.add(bindSessionScopeContextKeys(this._instantiationService, scope, contextKeyService));
		}
		const idSuffix = `.chatWindow${window.windowId}`;
		const when = ChatWindowIdContext.isEqualTo(window.windowId);
		store.add(registerChangesetOperations(scope.session, scope.changes, this._actionViewItemService, idSuffix, when));
		store.add(registerResourceChangesetOperations(scope.changes, idSuffix, when, false));
		return store;
	}
}

/** Names this module, which registers chat window actions, in the list of the chat window contribution; see `chatWindowContributions`. */
export const chatWindowEditorAreaContribution = 'chatWindowEditorArea';
