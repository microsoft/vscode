/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyFileEditor.contribution.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { combinedDisposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { isWindowCommandContext, IWindowCommandContext } from '../../../../workbench/common/windowCommandContext.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { openNewSearchEditor } from '../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { EditorsOrder, isEditorCommandsContext } from '../../../../workbench/common/editor.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { IsQuickChatSessionContext, SessionWithWorkspaceContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { DesktopChangesTabAvailableContext, DesktopChangesTabMissingContext, DesktopFilesTabAvailableContext, DesktopFilesTabMissingContext } from '../../../common/agentsWindowContextKeys.js';
import { SessionsCategories } from '../../../../workbench/contrib/sessions/common/categories.js';
import { CHAT_WINDOW_OPEN_BROWSER_COMMAND_ID, CHAT_WINDOW_OPEN_CHANGES_COMMAND_ID, CHAT_WINDOW_OPEN_FILES_COMMAND_ID, NEW_FILE_TAB_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { ISessionChangesService } from '../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { SessionChangesEditorInput } from '../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditorInput.js';
import { getMainWindowHost, ISessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { EmptyFileEditorInput } from '../../../../workbench/contrib/sessions/browser/emptyFileEditorInput.js';
import { Menus, SessionActivityBarGroup } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { ChatWindowLayoutCommandsContext, resolveChatWindowOfContext } from '../../../../workbench/contrib/chatWindow/browser/chatWindowLayoutActions.js';
import { IChatWindow, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';

export const NEW_BROWSER_TAB_COMMAND_ID = 'workbench.action.agentSessions.newBrowserTab';
export const OPEN_BROWSER_COMMAND_ID = 'workbench.action.agentSessions.openBrowser';
export const NEW_SEARCH_TAB_COMMAND_ID = 'workbench.action.agentSessions.newSearchTab';
export const NEW_CHANGES_TAB_COMMAND_ID = 'workbench.action.agentSessions.newChangesTab';

// The add-tab actions are only registered in the desktop layout, so the
// `when` clauses don't need to gate on the setting.
const addTabActionWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated());

const addTabLayoutWhen = ContextKeyExpr.and(
	addTabActionWhen,
	IsTopRightEditorGroupContext);

const singleEditorTitleWhen = EditorTabsVisibleContext.negate();

const changesTabActionWhen = ContextKeyExpr.and(
	addTabActionWhen,
	DesktopChangesTabAvailableContext);

const filesTabActionWhen = ContextKeyExpr.and(
	addTabActionWhen,
	DesktopFilesTabAvailableContext);

const searchTabActionWhen = ContextKeyExpr.and(
	addTabActionWhen,
	IsQuickChatSessionContext.negate());

// Only offer the Changes and Files tabs when they are not already shown.
const changesAddTabWhen = ContextKeyExpr.and(
	addTabLayoutWhen,
	DesktopChangesTabAvailableContext,
	ContextKeyExpr.or(singleEditorTitleWhen, DesktopChangesTabMissingContext));

const filesAddTabWhen = ContextKeyExpr.and(
	addTabLayoutWhen,
	DesktopFilesTabAvailableContext,
	ContextKeyExpr.or(singleEditorTitleWhen, DesktopFilesTabMissingContext));

/*
 * The actions also apply in a chat window, which shows the tabs of its session in its main part: a keybinding to them, as
 * the user's own, works there too. Their menu entries stay in the main window, as a chat window offers its own entries.
 */
const changesTabCommandWhen = ContextKeyExpr.or(changesTabActionWhen, ContextKeyExpr.and(ChatWindowLayoutCommandsContext, SessionWithWorkspaceContext));
const filesTabCommandWhen = ContextKeyExpr.or(filesTabActionWhen, ContextKeyExpr.and(ChatWindowLayoutCommandsContext, SessionWithWorkspaceContext));
const browserTabCommandWhen = ContextKeyExpr.or(addTabActionWhen, ChatWindowLayoutCommandsContext);
const searchTabCommandWhen = ContextKeyExpr.or(searchTabActionWhen, ContextKeyExpr.and(ChatWindowLayoutCommandsContext, IsQuickChatSessionContext.negate()));

/**
 * The chat window an action runs in. Its menu entries name where they run, by their editor group or their window, which a
 * click in a window that does not have focus yet runs before it does: then only the chat window they name, never one in
 * the main window. Without such arguments, as from a keybinding, also one with arguments of its own, or the Command
 * Palette, the chat window that has focus.
 */
function resolveInvokingChatWindow(accessor: ServicesAccessor, args: readonly unknown[]): IChatWindow | undefined {
	return args.some(arg => isEditorCommandsContext(arg) || isWindowCommandContext(arg)) ? resolveChatWindowOfContext(accessor, args) : accessor.get(IChatWindowService).activeWindow;
}

/**
 * Runs the chat window's own command for a tab while the action runs in a chat window: it opens the tab in the main part
 * of that window, for its session. Undefined in the main window.
 */
function runInChatWindow(accessor: ServicesAccessor, args: readonly unknown[], chatWindowCommandId: string): Promise<unknown> | undefined {
	const window = resolveInvokingChatWindow(accessor, args);
	return window ? accessor.get(ICommandService).executeCommand(chatWindowCommandId, { windowId: window.windowId } satisfies IWindowCommandContext) : undefined;
}

/**
 * Shows a Session Activity Bar entry as checked while the side pane shows its editor; clicking it then hides the side pane.
 * The side pane can show just the detail panel of the active editor while the editor area is collapsed.
 */
function sessionActivityBarEntryToggled(editorId: string) {
	return ContextKeyExpr.and(ContextKeyExpr.or(MainEditorAreaVisibleContext, AuxiliaryBarVisibleContext), ActiveEditorContext.isEqualTo(editorId))!;
}

export class NewFileTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_FILE_TAB_COMMAND_ID,
			title: localize2('newFileTab', "Files"),
			category: SessionsCategories.Sessions,
			// Same icon as the Files tab it opens.
			icon: EmptyFileEditorInput.ICON,
			f1: true,
			precondition: filesTabCommandWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: filesTabCommandWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE,
			},
			menu: [{
				id: AgentsWindowMenus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 1,
				when: filesAddTabWhen
			}, {
				id: AgentsWindowMenus.SessionsEmptyEditorGroupAddTab,
				group: 'navigation',
				order: 1,
				when: filesAddTabWhen
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const inChatWindow = runInChatWindow(accessor, args, CHAT_WINDOW_OPEN_FILES_COMMAND_ID);
		if (inChatWindow) {
			await inChatWindow;
			return;
		}
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);
		const group = editorGroupsService.mainPart.activeGroup;
		// The main part shows the tabs of the session and chat of the main window.
		const mainWindowHost = getMainWindowHost(accessor.get(ISessionHostService));
		const workspace = (mainWindowHost.chat.get() ?? mainWindowHost.session.get()?.mainChat.get())?.workspace.get();

		// An existing Files tab is activated in place rather than moved to the end.
		const index = group.editors.some(editor => editor instanceof EmptyFileEditorInput) ? undefined : group.count;
		await editorService.openEditor(instantiationService.createInstance(EmptyFileEditorInput, workspace), { pinned: true, index }, group);
	}
}

export class NewBrowserTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_BROWSER_TAB_COMMAND_ID,
			title: localize2('newBrowserTab', "Browser"),
			category: SessionsCategories.Sessions,
			icon: Codicon.globe,
			f1: true,
			precondition: browserTabCommandWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: browserTabCommandWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB,
			},
			menu: [{
				id: AgentsWindowMenus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 2,
				when: addTabLayoutWhen
			}, {
				id: AgentsWindowMenus.SessionsEmptyEditorGroupAddTab,
				group: 'navigation',
				order: 2,
				when: addTabLayoutWhen
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWindow = resolveInvokingChatWindow(accessor, args);
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const editorService = accessor.get(IEditorService);
		const browserInput = browserViewWorkbenchService.getOrCreateLazy({ id: generateUuid() });

		// Always a new tab, also in a chat window, where it opens in its main part, as the window's other tabs do
		chatWindow?.showEditor();
		await editorService.openEditor(browserInput, { pinned: true }, chatWindow?.mainPart.activeGroup);
	}
}

/**
 * Session Activity Bar entry for the browser. Unlike {@link NewBrowserTabAction},
 * which explicitly adds a tab, this activates the most recent browser tab of the
 * active group, or opens a new one as a preview tab and focuses its URL input.
 */
export class OpenBrowserAction extends Action2 {

	constructor() {
		super({
			id: OPEN_BROWSER_COMMAND_ID,
			title: localize2('openBrowser', "Browser"),
			icon: Codicon.globe,
			precondition: browserTabCommandWhen,
			toggled: sessionActivityBarEntryToggled(BrowserEditorInput.EDITOR_ID),
			menu: {
				id: Menus.SessionActivityBar,
				group: SessionActivityBarGroup.SidePanel,
				order: 3,
				when: addTabActionWhen
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const inChatWindow = runInChatWindow(accessor, args, CHAT_WINDOW_OPEN_BROWSER_COMMAND_ID);
		if (inChatWindow) {
			await inChatWindow;
			return;
		}
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const commandService = accessor.get(ICommandService);
		const group = editorGroupsService.mainPart.activeGroup;

		// An existing browser tab is activated in place. Otherwise a new one opens as a
		// preview tab, which the browser editor pins once it navigates.
		const existing = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(editor => editor instanceof BrowserEditorInput);
		const browserInput = existing ?? browserViewWorkbenchService.getOrCreateLazy({ id: generateUuid() });
		const editorPane = await editorService.openEditor(browserInput, undefined, group);
		if (editorPane && !browserInput.url) {
			await commandService.executeCommand(BrowserViewCommandId.FocusUrlInput, editorPane);
		}
	}
}

export class NewSearchTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_SEARCH_TAB_COMMAND_ID,
			title: localize2('newSearchTab', "Search"),
			category: SessionsCategories.Sessions,
			icon: Codicon.search,
			f1: true,
			precondition: searchTabCommandWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: searchTabCommandWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
			},
			menu: {
				id: AgentsWindowMenus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 3,
				// Only offered from the Add Tab dropdown.
				when: ContextKeyExpr.and(addTabLayoutWhen, IsQuickChatSessionContext.negate())
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWindow = resolveInvokingChatWindow(accessor, args);
		// In a chat window, the search opens in its main part, as the window's other tabs do, not in the part that has
		// focus, such as beside its chat: by the services of the main part, whose active group is its own
		chatWindow?.showEditor();
		const instantiationService = chatWindow ? accessor.get(IEditorGroupsService).getScopedInstantiationService(chatWindow.mainPart) : accessor.get(IInstantiationService);
		await instantiationService.invokeFunction(openNewSearchEditor, { location: 'new' });
	}
}

export class NewChangesTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_CHANGES_TAB_COMMAND_ID,
			title: localize2('newChangesTab', "Changes"),
			category: SessionsCategories.Sessions,
			// Same icon as the Changes tab it opens.
			icon: Codicon.diffMultiple,
			f1: false,
			precondition: changesTabCommandWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: changesTabCommandWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG },
			},
			menu: [{
				id: AgentsWindowMenus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 0,
				when: changesAddTabWhen
			}, {
				id: AgentsWindowMenus.SessionsEmptyEditorGroupAddTab,
				group: 'navigation',
				order: 0,
				when: changesAddTabWhen
			}]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const inChatWindow = runInChatWindow(accessor, args, CHAT_WINDOW_OPEN_CHANGES_COMMAND_ID);
		if (inChatWindow) {
			await inChatWindow;
			return;
		}
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const sessionChangesService = accessor.get(ISessionChangesService);

		// The main part shows the tabs of the session of the main window.
		const session = getMainWindowHost(accessor.get(ISessionHostService)).session.get();
		if (session) {
			const group = editorGroupsService.mainPart.activeGroup;
			// An existing Changes tab is activated in place rather than moved to the end.
			const index = group.findEditors(sessionChangesService.getChangesEditorResource(session.resource)).length > 0 ? undefined : group.count;
			await sessionChangesService.openChangesEditor(session.resource, { index }, group);
		}
	}
}

/**
 * Adds the Changes and Files entries to the Session Activity Bar. They are registered apart
 * from their actions so that only these entries are checked, not the Add Tab entries.
 */
export function registerSessionActivityBarTabEntries(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
			command: {
				id: NEW_CHANGES_TAB_COMMAND_ID,
				title: localize2('newChangesTab', "Changes"),
				icon: Codicon.diffMultiple,
				precondition: changesTabActionWhen,
				toggled: sessionActivityBarEntryToggled(SessionChangesEditorInput.EDITOR_ID),
			},
			group: SessionActivityBarGroup.SidePanel,
			order: 1,
			// Offered whenever the tab is available; an open tab is activated in place.
			when: changesTabActionWhen
		}),
		MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
			command: {
				id: NEW_FILE_TAB_COMMAND_ID,
				title: localize2('newFileTab', "Files"),
				icon: EmptyFileEditorInput.ICON,
				precondition: filesTabActionWhen,
				toggled: sessionActivityBarEntryToggled(EmptyFileEditorInput.EDITOR_ID),
			},
			group: SessionActivityBarGroup.SidePanel,
			order: 2,
			when: filesTabActionWhen
		}),
	);
}
