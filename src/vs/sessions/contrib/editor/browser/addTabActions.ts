/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyFileEditor.contribution.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { openNewSearchEditor } from '../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { EditorsOrder } from '../../../../workbench/common/editor.js';
import { EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { IsQuickChatSessionContext, DesktopChangesTabAvailableContext, DesktopChangesTabMissingContext, DesktopFilesTabAvailableContext, DesktopFilesTabMissingContext } from '../../../common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';

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

export class NewFileTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_FILE_TAB_COMMAND_ID,
			title: localize2('newFileTab', "Files"),
			category: SessionsCategories.Sessions,
			// Same icon as the Files tab it opens.
			icon: EmptyFileEditorInput.ICON,
			f1: true,
			precondition: filesTabActionWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: filesTabActionWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE,
			},
			menu: [{
				id: Menus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 1,
				when: filesAddTabWhen
			}, {
				id: Menus.SessionsEmptyEditorGroupAddTab,
				group: 'navigation',
				order: 1,
				when: filesAddTabWhen
			}, {
				id: Menus.SessionActivityBar,
				group: SessionActivityBarGroup.Tabs,
				order: 1,
				when: filesTabActionWhen
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);
		const sessionsService = accessor.get(ISessionsService);
		const group = editorGroupsService.mainPart.activeGroup;
		const workspace = sessionsService.activeSession.get()?.activeChat.get().workspace.get();

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
			precondition: addTabActionWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: addTabActionWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB,
			},
			menu: [{
				id: Menus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 2,
				when: addTabLayoutWhen
			}, {
				id: Menus.SessionsEmptyEditorGroupAddTab,
				group: 'navigation',
				order: 2,
				when: addTabLayoutWhen
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const editorService = accessor.get(IEditorService);
		const browserInput = browserViewWorkbenchService.getOrCreateLazy({ id: generateUuid() });

		await editorService.openEditor(browserInput, { pinned: true });
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
			precondition: addTabActionWhen,
			menu: {
				id: Menus.SessionActivityBar,
				group: SessionActivityBarGroup.Tabs,
				order: 2,
				when: addTabActionWhen
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
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
			precondition: searchTabActionWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: searchTabActionWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
			},
			menu: {
				id: Menus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 3,
				// Only offered from the Add Tab dropdown.
				when: ContextKeyExpr.and(addTabLayoutWhen, IsQuickChatSessionContext.negate())
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
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
			precondition: changesTabActionWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: changesTabActionWhen,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG },
			},
			menu: [{
				id: Menus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 0,
				when: changesAddTabWhen
			}, {
				id: Menus.SessionsEmptyEditorGroupAddTab,
				group: 'navigation',
				order: 0,
				when: changesAddTabWhen
			}, {
				id: Menus.SessionActivityBar,
				group: SessionActivityBarGroup.Tabs,
				order: 0,
				// Offered whenever the tab is available; an open tab is activated in place.
				when: changesTabActionWhen
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionChangesService = accessor.get(ISessionChangesService);

		const session = sessionsService.activeSession.get();
		if (session) {
			const group = editorGroupsService.mainPart.activeGroup;
			// An existing Changes tab is activated in place rather than moved to the end.
			const index = group.findEditors(sessionChangesService.getChangesEditorResource(session.resource)).length > 0 ? undefined : group.count;
			await sessionChangesService.openChangesEditor(session.resource, { index }, group);
		}
	}
}
