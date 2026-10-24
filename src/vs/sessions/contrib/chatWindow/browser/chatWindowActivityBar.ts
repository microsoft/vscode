/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getActiveWindow, onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorsOrder } from '../../../../workbench/common/editor.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, ChatWindowEditorAreaEditorContext, ChatWindowHasEditorAreaContext, ChatWindowLayout, ChatWindowLayoutContext, ChatWindowSessionHasWorkspaceContext, ChatWindowTerminalShownContext, IChatWindow, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { SessionChangesEditorInput } from '../../changes/browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../changes/common/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';

// The Session Activity Bar of a chat window with an editor area: as in the main window, its entries open the tabs of the
// session in the editor area beside the chat, and the terminal in the row across the bottom of the window.

/** The entries that open a tab of the editor area of a chat window, checked while it shows the tab. */
interface IChatWindowTabEntry {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	readonly editorId: string;
	readonly order: number;
	/** When the session has the tab: changes and files need a workspace. */
	readonly when?: ContextKeyExpression;
	open(accessor: ServicesAccessor, window: IChatWindow): Promise<void>;
}

const chatWindowTabEntries: readonly IChatWindowTabEntry[] = [{
	id: 'sessions.chatWindow.openChanges',
	title: localize2('chatWindowChanges', "Changes"),
	icon: Codicon.diffMultiple,
	editorId: SessionChangesEditorInput.EDITOR_ID,
	order: 1,
	when: ChatWindowSessionHasWorkspaceContext,
	async open(accessor, window) {
		const session = window.session.get();
		const group = window.editorGroup;
		if (session && group) {
			const sessionChangesService = accessor.get(ISessionChangesService);
			// An existing Changes tab is activated in place rather than moved to the end.
			const index = group.findEditors(sessionChangesService.getChangesEditorResource(session.resource)).length > 0 ? undefined : group.count;
			await sessionChangesService.openChangesEditor(session.resource, { index }, group);
		}
	},
}, {
	id: 'sessions.chatWindow.openFiles',
	title: localize2('chatWindowFiles', "Files"),
	icon: EmptyFileEditorInput.ICON,
	editorId: EmptyFileEditorInput.EDITOR_ID,
	order: 2,
	when: ChatWindowSessionHasWorkspaceContext,
	async open(accessor, window) {
		const group = window.editorGroup;
		if (group) {
			const workspace = window.session.get()?.activeChat.get().workspace.get();
			const index = group.editors.some(editor => editor instanceof EmptyFileEditorInput) ? undefined : group.count;
			await accessor.get(IEditorService).openEditor(accessor.get(IInstantiationService).createInstance(EmptyFileEditorInput, workspace), { pinned: true, index }, group);
		}
	},
}, {
	id: 'sessions.chatWindow.openBrowser',
	title: localize2('chatWindowBrowser', "Browser"),
	icon: Codicon.globe,
	editorId: BrowserEditorInput.EDITOR_ID,
	order: 3,
	async open(accessor, window) {
		const group = window.editorGroup;
		if (group) {
			const commandService = accessor.get(ICommandService);
			// An existing browser tab is activated in place; otherwise a new one opens, with its URL input focused.
			const existing = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(editor => editor instanceof BrowserEditorInput);
			const browserInput = existing ?? accessor.get(IBrowserViewWorkbenchService).getOrCreateLazy({ id: generateUuid() });
			const editorPane = await accessor.get(IEditorService).openEditor(browserInput, undefined, group);
			if (editorPane && !browserInput.url) {
				await commandService.executeCommand(BrowserViewCommandId.FocusUrlInput, editorPane);
			}
		}
	},
}];

/** The argument of the Add Tab actions: the group that they were invoked from. */
interface IChatWindowGroupContext {
	readonly groupId?: number;
}

/** The chat window that owns the group, or the active chat window when the action is not invoked from a group. */
function getChatWindowForGroup(chatWindowService: IChatWindowService, context: IChatWindowGroupContext | undefined): IChatWindow | undefined {
	if (typeof context?.groupId === 'number') {
		const window = chatWindowService.windows.get().find(w => w.editorGroup?.id === context.groupId);
		if (window) {
			return window;
		}
	}
	return chatWindowService.getActiveWindow();
}

for (const entry of chatWindowTabEntries) {
	// Checked while the editor area shows its tab; clicking it then hides the editor area.
	const shown = ContextKeyExpr.and(ChatWindowEditorAreaEditorContext.isEqualTo(entry.editorId), ChatWindowLayoutContext.notEqualsTo(ChatWindowLayout.ChatOnly));
	const when = ContextKeyExpr.and(ChatWindowHasEditorAreaContext, ChatContextKeys.enabled, entry.when);
	// The same entries as the Add Tab actions of the main window, in its menus, for the empty editor area of a chat window.
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
				menu: {
					id: Menus.SessionActivityBar,
					group: SessionActivityBarGroup.SidePanel,
					order: entry.order,
					when,
				},
			});
		}

		override async run(accessor: ServicesAccessor, context?: IChatWindowGroupContext): Promise<void> {
			const window = getChatWindowForGroup(accessor.get(IChatWindowService), context);
			if (!window?.editorGroup) {
				return;
			}
			// Checked, the Session Activity Bar hides the editor area instead; see `ChatViewSessionActivityBar`.
			window.showEditor();
			await entry.open(accessor, window);
		}
	});
}

/**
 * Whether the terminal keys, which toggle the panel of the main window, act on the terminal row of the chat window instead:
 * the focused window is a chat window of its own with an editor area. A docked one is part of the main window, whose panel
 * they keep toggling. It follows the focused window, not the focused element, so it also holds with focus in the title bar.
 */
export function isChatWindowTerminalKeysWindow(windows: readonly { readonly docked: boolean; readonly windowId: number; readonly hasEditorArea: boolean }[], focusedWindowId: number): boolean {
	return windows.some(window => !window.docked && window.hasEditorArea && window.windowId === focusedWindowId);
}

export const ChatWindowTerminalKeysContext = new RawContextKey<boolean>('sessions.chatWindowTerminalKeys', false, localize('chatWindowTerminalKeys', "Whether the focused window is a chat window of its own with an editor area, where the keys of the panel toggle its terminal and the key of the side panel its editor area."));

class ChatWindowTerminalKeysContribution extends Disposable {

	static readonly ID = 'sessions.chatWindowTerminalKeys';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWindowService chatWindowService: IChatWindowService,
		@IHostService hostService: IHostService,
	) {
		super();
		const key = ChatWindowTerminalKeysContext.bindTo(contextKeyService);
		const update = () => key.set(isChatWindowTerminalKeysWindow(chatWindowService.windows.get().map(window => ({ docked: window.docked, windowId: window.windowId, hasEditorArea: !!window.editorGroup && !!window.content.get().editorArea })), getActiveWindow().vscodeWindowId));
		this._register(autorun(reader => {
			for (const window of chatWindowService.windows.read(reader)) {
				window.content.read(reader);
			}
			update();
		}));
		this._register(hostService.onDidChangeActiveWindow(update));
		this._register(hostService.onDidChangeFocus(update));
		// Focus moving between windows is also seen in the window itself, where the host may not tell.
		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(addDisposableListener(window, EventType.FOCUS, update, true));
		}, { window: mainWindow, disposables: this._store }));
	}
}

registerWorkbenchContribution2(ChatWindowTerminalKeysContribution.ID, ChatWindowTerminalKeysContribution, WorkbenchPhase.AfterRestored);

// Distinct from the Show Editor action of the Layout menu, which needs the window's own context and carries no key.
export const CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID = 'sessions.chatWindow.toggleEditorByKey';

// The key of the side panel, which toggles the editor area of the main window, toggles the editor area of the chat window.
registerAction2(class ToggleChatWindowEditorAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID,
			title: localize2('chatWindowToggleEditorByKey', "Toggle Editor in Chat Window"),
			category: SessionsCategories.Sessions,
			f1: false,
			precondition: ContextKeyExpr.or(ChatWindowHasEditorAreaContext, ChatWindowTerminalKeysContext),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB,
				weight: KeybindingWeight.SessionsContrib + 10,
				when: ChatWindowTerminalKeysContext,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const window = accessor.get(IChatWindowService).getActiveWindow();
		if (window?.editorGroup) {
			// Hiding the editor leaves the chat, so the window is never empty; showing it brings back the layout it had.
			if (window.layout.get() === ChatWindowLayout.ChatOnly) {
				window.showEditor();
			} else {
				window.setLayout(ChatWindowLayout.ChatOnly);
			}
		}
	}
});

// The terminal: shown in the row across the bottom of the window, as the panel of the main window shows it.
registerAction2(class ToggleChatWindowTerminalAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID,
			title: localize2('chatWindowToggleTerminal', "Toggle Terminal in Chat Window"),
			category: SessionsCategories.Sessions,
			icon: Codicon.terminal,
			f1: true,
			// Outside the container of the window, such as in its title bar, only the key of the focused window tells it has the area.
			precondition: ContextKeyExpr.or(ChatWindowHasEditorAreaContext, ChatWindowTerminalKeysContext),
			toggled: ChatWindowTerminalShownContext,
			// The keys of the panel and of the terminal, above the rules of the workbench for them.
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyCode.KeyJ,
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ChatWindowTerminalKeysContext,
			}, {
				primary: KeyMod.CtrlCmd | KeyCode.Backquote,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote },
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ChatWindowTerminalKeysContext,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const window = accessor.get(IChatWindowService).getActiveWindow();
		if (window) {
			const shown = window.terminalShown.get();
			await window.setTerminalShown(!shown, { focus: !shown });
		}
	}
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
	command: {
		id: CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID,
		title: localize2('chatWindowTerminal', "Terminal"),
		icon: Codicon.terminal,
		toggled: ChatWindowTerminalShownContext,
	},
	group: SessionActivityBarGroup.Panel,
	order: 0,
	when: ChatWindowHasEditorAreaContext,
});

const CHAT_WINDOW_ADD_TERMINAL_COMMAND_ID = 'sessions.chatWindow.addTerminal';

// The Add Tab entry for a terminal: it shows in the terminal row, which holds terminals only, and not in the editor area.
registerAction2(class AddChatWindowTerminalAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_ADD_TERMINAL_COMMAND_ID,
			title: localize2('chatWindowAddTerminal', "Terminal"),
			icon: Codicon.terminal,
			precondition: ContextKeyExpr.and(ChatWindowHasEditorAreaContext, ChatContextKeys.enabled),
			menu: [Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab].map(id => ({
				id,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.and(ChatWindowHasEditorAreaContext, ChatContextKeys.enabled),
			})),
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatWindowGroupContext): Promise<void> {
		const window = getChatWindowForGroup(accessor.get(IChatWindowService), context);
		if (!window) {
			return;
		}
		const row = window.terminalGroup.get();
		if (row && !row.isEmpty) {
			await accessor.get(ICommandService).executeCommand('sessions.chatWindow.newTerminal', { groupId: row.id });
		} else {
			await window.setTerminalShown(true, { focus: true });
		}
	}
});
