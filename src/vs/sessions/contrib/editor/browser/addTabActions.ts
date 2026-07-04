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
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

export const NEW_FILE_TAB_COMMAND_ID = 'workbench.action.agentSessions.newFileTab';
export const NEW_BROWSER_TAB_COMMAND_ID = 'workbench.action.agentSessions.newBrowserTab';

// The add-tab actions are only registered in the single-pane layout, so the
// `when` clauses don't need to gate on the setting.
const addTabActionWhen = ContextKeyExpr.and(
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated());

const addTabLayoutWhen = ContextKeyExpr.and(
	addTabActionWhen,
	IsTopRightEditorGroupContext);

export class NewFileTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_FILE_TAB_COMMAND_ID,
			title: localize2('newFileTab', "New File"),
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
				order: 0,
				when: addTabLayoutWhen
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		await editorService.openEditor(instantiationService.createInstance(EmptyFileEditorInput));
	}
}

export class NewBrowserTabAction extends Action2 {

	constructor() {
		super({
			id: NEW_BROWSER_TAB_COMMAND_ID,
			title: localize2('newBrowserTab', "New Browser"),
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
				order: 1,
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
