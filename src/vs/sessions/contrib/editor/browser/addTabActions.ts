/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyFileEditor.contribution.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { openNewSearchEditor } from '../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { SinglePaneChangesTabMissingContext, SinglePaneFilesTabMissingContext } from '../../../common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

export const NEW_FILE_TAB_COMMAND_ID = 'workbench.action.agentSessions.newFileTab';
export const NEW_BROWSER_TAB_COMMAND_ID = 'workbench.action.agentSessions.newBrowserTab';
export const NEW_SEARCH_TAB_COMMAND_ID = 'workbench.action.agentSessions.newSearchTab';
export const NEW_CHANGES_TAB_COMMAND_ID = 'workbench.action.agentSessions.newChangesTab';

// The add-tab actions are only registered in the single-pane layout, so the
// `when` clauses don't need to gate on the setting.
const addTabActionWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated());

const addTabLayoutWhen = ContextKeyExpr.and(
	addTabActionWhen,
	IsTopRightEditorGroupContext,
	MainEditorAreaVisibleContext);

export class NewFileTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_FILE_TAB_COMMAND_ID,
			title: localize2('newFileTab', "Files"),
			category: SessionsCategories.Sessions,
			icon: Codicon.newFile,
			f1: true,
			precondition: addTabActionWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: addTabActionWhen,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyB),
			},
			menu: {
				id: MenuId.EditorTabsBarAddTab,
				group: 'navigation',
				order: 1,
				// Only offer when the Files tab is not already shown.
				when: ContextKeyExpr.and(addTabLayoutWhen, SinglePaneFilesTabMissingContext)
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);
		const group = editorGroupsService.mainPart.activeGroup;

		await editorService.openEditor(instantiationService.createInstance(EmptyFileEditorInput), { pinned: true, index: group.count }, group);
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
				primary: KeyChord(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK, KeyCode.KeyB),
			},
			menu: {
				id: MenuId.EditorTabsBarAddTab,
				group: 'navigation',
				order: 2,
				when: addTabLayoutWhen
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
		const editorService = accessor.get(IEditorService);
		const browserInput = browserViewWorkbenchService.getOrCreateLazy(generateUuid(), {});

		await editorService.openEditor(browserInput);
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
			precondition: addTabActionWhen,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: addTabActionWhen,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS),
			},
			menu: {
				id: MenuId.EditorTabsBarAddTab,
				group: 'navigation',
				order: 3,
				when: addTabLayoutWhen
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
			icon: Codicon.gitCompare,
			f1: false,
			precondition: addTabActionWhen,
			menu: {
				id: MenuId.EditorTabsBarAddTab,
				group: 'navigation',
				order: 0,
				// Only offer when the session has a Changes editor but its tab is closed.
				when: ContextKeyExpr.and(addTabLayoutWhen, SinglePaneChangesTabMissingContext)
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionChangesService = accessor.get(ISessionChangesService);

		const sessionResource = sessionsService.activeSession.get()?.resource;
		if (sessionResource) {
			const group = editorGroupsService.mainPart.activeGroup;
			await sessionChangesService.openChangesEditor(sessionResource, { index: group.count }, group);
		}
	}
}
