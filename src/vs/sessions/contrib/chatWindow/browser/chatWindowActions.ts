/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindowLayoutButtons.css';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { CLOSE_EDITOR_COMMAND_ID } from '../../../../workbench/browser/parts/editor/editorCommands.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ActiveEditorCannotCloseContext, ActiveEditorContext, EditorPartMultipleEditorGroupsContext, LayoutModeContext } from '../../../../workbench/common/contextkeys.js';
import { EditorsOrder } from '../../../../workbench/common/editor.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatWindow } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatShownContext, ChatWindowCategory, ChatWindowLayoutCommandsContext, chatWindowLayoutModeChoices, EditorShownContext, resolveChatWindow, showChatWindowLayout, StackedContext, TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID } from '../../../../workbench/contrib/chatWindow/browser/chatWindowLayoutActions.js';
import { ChatWindowLayoutMode } from '../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { IsQuickChatSessionContext, SessionActivityBarLayoutActionsContext, SessionHasWorkspaceContext } from '../../../common/contextkeys.js';
import { getChatWindowSession } from '../../../services/sessions/browser/sessionScope.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionChangesEditorInput } from '../../changes/browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../changes/common/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';

//#region Close

export const CLOSE_CHAT_WINDOW_COMMAND_ID = 'workbench.action.chatWindow.close';

// Closing the chat closes its window. While other editors are beside the chat in its group, as tabs, the chat cannot be
// closed as an editor, so that its tab offers no close action: the key that closes an editor closes the window then. Its
// view binds the active editor of its window's main part in its context, so the chat is recognized when the command runs.
registerAction2(class CloseChatWindowAction extends Action2 {
	constructor() {
		super({
			id: CLOSE_CHAT_WINDOW_COMMAND_ID,
			title: localize2('chatWindowClose', "Close Chat Window"),
			category: ChatWindowCategory,
			precondition: ChatWindowLayoutCommandsContext,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyW,
				win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ContextKeyExpr.and(ChatWindowLayoutCommandsContext, ActiveEditorCannotCloseContext),
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const window = resolveChatWindow(accessor, args);
		if (window && accessor.get(IEditorGroupsService).activeGroup.activeEditor === window.chatEditor) {
			window.close();
			return;
		}
		// Another editor that cannot close, such as a docked one: as the key does elsewhere
		await accessor.get(ICommandService).executeCommand(CLOSE_EDITOR_COMMAND_ID);
	}
});

//#endregion

//#region Layout menu and buttons

/** The actions of the Layout menu that also show as buttons of their own beside it, which the user shows and hides. */
export const enum ChatWindowLayoutButton {
	Chat = 'chat',
	Editor = 'editor',
	Arrangement = 'arrangement',
}

const chatWindowLayoutButtons: readonly ChatWindowLayoutButton[] = [ChatWindowLayoutButton.Chat, ChatWindowLayoutButton.Editor, ChatWindowLayoutButton.Arrangement];

const chatWindowLayoutButtonCommands: Readonly<Record<ChatWindowLayoutButton, string>> = {
	[ChatWindowLayoutButton.Chat]: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID,
	[ChatWindowLayoutButton.Editor]: TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID,
	[ChatWindowLayoutButton.Arrangement]: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID,
};

const chatWindowLayoutButtonTitles: Readonly<Record<ChatWindowLayoutButton, ILocalizedString>> = {
	[ChatWindowLayoutButton.Chat]: localize2('chatWindowLayoutButton.chat', "Show Chat"),
	[ChatWindowLayoutButton.Editor]: localize2('chatWindowLayoutButton.editor', "Show Editor"),
	[ChatWindowLayoutButton.Arrangement]: localize2('chatWindowLayoutButton.arrangement', "Stacked"),
};

/** The title of the arrangement button while stacked: what it does then, as its icon shows. */
const chatWindowLayoutArrangementSideBySideTitle = localize2('chatWindowLayoutButton.arrangement.sideBySide', "Side by Side");

/** The editor above the chat (stacked): the panel icons, upside down (see `chatWindowLayoutButtons.css`). */
const editorAboveIcon = registerIcon('session-layout-editor-above', Codicon.layoutPanel, localize('sessionLayoutEditorAboveIcon', "Icon of the editor shown above the chat."));
const editorAboveOffIcon = registerIcon('session-layout-editor-above-off', Codicon.layoutPanelOff, localize('sessionLayoutEditorAboveOffIcon', "Icon of the editor hidden above the chat."));
/** The chat hidden below the editor (stacked): the status bar icon with its band ghosted (see `chatWindowLayoutButtons.css`). */
const chatBelowOffIcon = registerIcon('session-layout-chat-below-off', Codicon.layoutStatusbar, localize('sessionLayoutChatBelowOffIcon', "Icon of the chat hidden below the editor."));

/**
 * The icon of each button by the arrangement and its state: the state shows by the icon, not by a toggled highlight. The
 * chat and the editor are shown (`on`) or hidden (`off`). The arrangement button shows what it does, the other
 * arrangement: stacked while side by side, side by side while stacked.
 */
export const chatWindowLayoutButtonIcons: Readonly<Record<ChatWindowLayoutButton, Readonly<Record<'sideBySide' | 'stacked', { readonly on: ThemeIcon; readonly off: ThemeIcon }>>>> = {
	[ChatWindowLayoutButton.Chat]: {
		sideBySide: { on: Codicon.layoutSidebarLeft, off: Codicon.layoutSidebarLeftOff },
		stacked: { on: Codicon.layoutStatusbar, off: chatBelowOffIcon },
	},
	[ChatWindowLayoutButton.Editor]: {
		sideBySide: { on: Codicon.layoutSidebarRight, off: Codicon.layoutSidebarRightOff },
		stacked: { on: editorAboveIcon, off: editorAboveOffIcon },
	},
	[ChatWindowLayoutButton.Arrangement]: {
		sideBySide: { on: Codicon.splitVertical, off: Codicon.splitVertical },
		stacked: { on: Codicon.splitHorizontal, off: Codicon.splitHorizontal },
	},
};

/** The groups of {@link Menus.WindowLayout}: the chat and the editor parts as toggles, then how both show together. */
const WindowLayoutMenuGroup = {
	panes: '1_panes',
	arrangement: '2_arrangement',
} as const;

for (const [button, group, order] of [[ChatWindowLayoutButton.Chat, WindowLayoutMenuGroup.panes, 1], [ChatWindowLayoutButton.Editor, WindowLayoutMenuGroup.panes, 2], [ChatWindowLayoutButton.Arrangement, WindowLayoutMenuGroup.arrangement, 1]] as const) {
	MenuRegistry.appendMenuItem(Menus.WindowLayout, {
		command: {
			id: chatWindowLayoutButtonCommands[button],
			title: chatWindowLayoutButtonTitles[button],
			toggled: button === ChatWindowLayoutButton.Chat ? ChatShownContext : button === ChatWindowLayoutButton.Editor ? EditorShownContext : StackedContext,
			// The part that shows alone can't be hidden, as the actions' own preconditions say.
			precondition: button === ChatWindowLayoutButton.Chat ? LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.ChatOnly) : button === ChatWindowLayoutButton.Editor ? LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.EditorOnly) : undefined,
		},
		group,
		order,
		when: ChatWindowLayoutCommandsContext,
	});
}

/** A menu that shows the Layout menu of a window and the buttons of its actions: its title bar, or its Session Activity Bar. */
interface IChatWindowLayoutButtonsMenu {
	readonly menu: MenuId;
	readonly group: string;
	/** The order of the first button; the buttons follow it, then the Layout menu. */
	readonly order: number;
	readonly when: ContextKeyExpression;
}

// One entry point to the Layout menu of a window: its title bar, or its Session Activity Bar while the strip shows the
// layout actions, as the main window's does. The Layout menu ends the layout actions, after the buttons the user shows.
export const chatWindowLayoutButtonsMenus: readonly IChatWindowLayoutButtonsMenu[] = [
	{ menu: Menus.TitleBarWindowLayout, group: 'navigation', order: 0, when: SessionActivityBarLayoutActionsContext.negate() },
	{ menu: Menus.SessionActivityBar, group: SessionActivityBarGroup.WindowLayout, order: 100, when: SessionActivityBarLayoutActionsContext },
];

const buttonStates: Readonly<Record<ChatWindowLayoutButton, ContextKeyExpression | undefined>> = {
	[ChatWindowLayoutButton.Chat]: ChatShownContext,
	[ChatWindowLayoutButton.Editor]: EditorShownContext,
	// The arrangement's state is the arrangement itself.
	[ChatWindowLayoutButton.Arrangement]: undefined,
};

for (const target of chatWindowLayoutButtonsMenus) {
	const shownIn = ContextKeyExpr.and(ChatWindowLayoutCommandsContext, target.when);
	chatWindowLayoutButtons.forEach((button, index) => {
		for (const [arrangement, arrangementWhen] of [['sideBySide', StackedContext.negate()], ['stacked', StackedContext]] as const) {
			const icons = chatWindowLayoutButtonIcons[button][arrangement];
			const state = buttonStates[button];
			for (const on of state ? [true, false] : [true]) {
				MenuRegistry.appendMenuItem(target.menu, {
					// No `toggled`: the state shows by the icon, never by a highlight.
					command: {
						id: chatWindowLayoutButtonCommands[button],
						title: button === ChatWindowLayoutButton.Arrangement && arrangement === 'stacked' ? chatWindowLayoutArrangementSideBySideTitle : chatWindowLayoutButtonTitles[button],
						icon: on ? icons.on : icons.off,
					},
					group: target.group,
					order: target.order + index,
					// Shown and hidden by the user from the toolbar's context menu; Show Editor shows until the user hides it.
					isHiddenByDefault: button !== ChatWindowLayoutButton.Editor,
					when: ContextKeyExpr.and(shownIn, arrangementWhen, state ? (on ? state : state.negate()) : undefined),
				});
			}
		}
	});
	for (const choice of chatWindowLayoutModeChoices) {
		MenuRegistry.appendMenuItem(target.menu, {
			submenu: Menus.WindowLayout,
			title: localize('chatWindowLayoutMenu', "Layout: {0}", choice.shortTitle),
			icon: Codicon.layout,
			group: target.group,
			order: target.order + chatWindowLayoutButtons.length,
			when: ContextKeyExpr.and(shownIn, LayoutModeContext.isEqualTo(choice.mode)),
		});
	}
}

//#endregion

//#region Tabs of the main part

/** Whether the session of the window has a workspace: the Changes and Files tabs need one. */
const SessionWithWorkspaceContext = ContextKeyExpr.and(SessionHasWorkspaceContext, IsQuickChatSessionContext.negate())!;

/** An entry that opens a tab of the main part of a chat window, checked while the main part shows the tab. */
interface IChatWindowTabEntry {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	readonly editorId: string;
	readonly order: number;
	readonly when?: ContextKeyExpression;
	open(accessor: ServicesAccessor, session: IActiveSession | undefined, group: IEditorGroup): Promise<void>;
}

export const chatWindowTabEntries: readonly IChatWindowTabEntry[] = [{
	id: 'sessions.chatWindow.openChanges',
	title: localize2('chatWindowChanges', "Changes"),
	icon: Codicon.diffMultiple,
	editorId: SessionChangesEditorInput.EDITOR_ID,
	order: 1,
	when: SessionWithWorkspaceContext,
	async open(accessor, session, group) {
		if (session) {
			const sessionChangesService = accessor.get(ISessionChangesService);
			// An existing Changes tab of the session is activated in place, such as one that moved in with the chat or was
			// restored, which may show the changes of the session rather than of the chat.
			const existing = group.getEditors(EditorsOrder.SEQUENTIAL).find(editor => editor.resource && isEqual(sessionChangesService.getSessionResource(editor.resource), session.resource));
			if (existing) {
				await group.openEditor(existing);
				return;
			}
			// Otherwise the window's own Changes editor, of the chat it shows, at the end.
			await sessionChangesService.openChangesEditor(session.resource, { index: group.count, chatResource: session.scopedChatResource }, group);
		}
	},
}, {
	id: 'sessions.chatWindow.openFiles',
	title: localize2('chatWindowFiles', "Files"),
	icon: EmptyFileEditorInput.ICON,
	editorId: EmptyFileEditorInput.EDITOR_ID,
	order: 2,
	when: SessionWithWorkspaceContext,
	async open(accessor, session, group) {
		const workspace = session?.activeChat.get().workspace.get();
		const index = group.editors.some(editor => editor instanceof EmptyFileEditorInput) ? undefined : group.count;
		await accessor.get(IEditorService).openEditor(accessor.get(IInstantiationService).createInstance(EmptyFileEditorInput, workspace), { pinned: true, index }, group);
	},
}, {
	id: 'sessions.chatWindow.openBrowser',
	title: localize2('chatWindowBrowser', "Browser"),
	icon: Codicon.globe,
	editorId: BrowserEditorInput.EDITOR_ID,
	order: 3,
	async open(accessor, _session, group) {
		// Services are read before the first await, after which the accessor is no longer valid.
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		// An existing browser tab is activated in place; otherwise a new one opens, with its URL input focused.
		const existing = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(editor => editor instanceof BrowserEditorInput);
		const browserInput = existing ?? accessor.get(IBrowserViewWorkbenchService).getOrCreateLazy({ id: generateUuid() });
		const editorPane = await editorService.openEditor(browserInput, undefined, group);
		if (editorPane && !browserInput.url) {
			await commandService.executeCommand(BrowserViewCommandId.FocusUrlInput, editorPane);
		}
	},
}];

/** Opens `entry` in the main part of `window`, which shows, for the session of the window. */
async function openTabEntry(accessor: ServicesAccessor, entry: IChatWindowTabEntry, window: IChatWindow): Promise<void> {
	const session = getChatWindowSession(accessor, window);
	window.showEditor();
	await entry.open(accessor, session, window.mainPart.activeGroup);
}

for (const entry of chatWindowTabEntries) {
	const when = ContextKeyExpr.and(ChatContextKeys.enabled, ChatWindowLayoutCommandsContext, entry.when);
	// Checked while the main part shows its tab, as the main window's entries are.
	const shown = ContextKeyExpr.and(ActiveEditorContext.isEqualTo(entry.editorId), EditorShownContext);
	// The same entries as the Add Tab actions of the main window, for the main part of a chat window.
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

		override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			// The chat window the entry was invoked from, which may not have focus yet.
			const window = resolveChatWindow(accessor, args);
			if (window) {
				await openTabEntry(accessor, entry, window);
			}
		}
	});
}

export const CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID = 'sessions.chatWindow.closeEditorArea';

/**
 * The one close button of an empty main part of a chat window, in place of the Close Group of the group and the Close
 * Editor Area of the main window's watermark: it shows only the chat of the window. With several groups, an empty one
 * offers Close Group instead.
 */
registerAction2(class CloseChatWindowEditorAreaAction extends Action2 {
	constructor() {
		super({
			id: CLOSE_CHAT_WINDOW_EDITOR_AREA_COMMAND_ID,
			title: localize2('chatWindowCloseEditorArea', "Close Editor Area"),
			icon: Codicon.close,
			precondition: ChatWindowLayoutCommandsContext,
			menu: {
				id: MenuId.EmptyEditorGroup,
				group: 'navigation',
				order: 20,
				when: ContextKeyExpr.and(ChatWindowLayoutCommandsContext, EditorPartMultipleEditorGroupsContext.negate()),
			},
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		// The window of the empty group the button is in.
		const window = resolveChatWindow(accessor, args);
		if (window) {
			showChatWindowLayout(window, ChatWindowLayoutMode.ChatOnly);
		}
	}
});

//#endregion
