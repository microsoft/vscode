/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { MenuItemAction, registerAction2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { CHANGES_HEADER_ACTIONS_ID, ChangesActionsBarActionViewItem, SetChangesListViewModeAction, SetChangesTreeViewModeAction, VersionsPickerAction, ChangesDiffStatsAction, RevealCIChecksAction } from '../../../../workbench/contrib/sessionChanges/browser/changesView.js';
// The changeset picker of the Changes editor's header, which the editor window registers too
import { ChangesPickerActionViewItemContribution } from '../../../../workbench/contrib/sessionChanges/browser/changesPicker.js';
import { localize2 } from '../../../../nls.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { EmptyFileEditorInput } from '../../../../workbench/contrib/sessions/browser/emptyFileEditorInput.js';
import { OpenEditorCommandId } from '../../../../workbench/contrib/searchEditor/browser/constants.js';
import { searchViewIcon } from '../../../../workbench/contrib/search/browser/searchIcons.js';

/** Registers the custom Changes actions bar of the session title bar. */
class ChangesActionViewItemsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesEditorHeader';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		const onDidRegister = this._register(new Emitter<void>());

		this._register(actionViewItemService.register(AgentsWindowMenus.TitleBarSessionMenu, CHANGES_HEADER_ACTIONS_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChangesActionsBarActionViewItem, action, options);
		}, onDidRegister.event));

		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(ChangesActionViewItemsContribution.ID, ChangesActionViewItemsContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChangesPickerActionViewItemContribution.ID, ChangesPickerActionViewItemContribution, WorkbenchPhase.BlockRestore);
registerAction2(VersionsPickerAction);
registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);
registerAction2(ChangesDiffStatsAction);
registerAction2(RevealCIChecksAction);

MenuRegistry.appendMenuItems([
	{
		id: Menus.EmptyChangesActions,
		item: {
			command: { id: NEW_FILE_TAB_COMMAND_ID, title: localize2('changes.openFiles', "Open Files"), icon: EmptyFileEditorInput.ICON },
			group: 'navigation',
			order: 1,
		},
	},
	{
		id: Menus.EmptyChangesActions,
		item: {
			command: { id: OpenEditorCommandId, title: localize2('changes.searchFiles', "Search in Files"), icon: searchViewIcon },
			group: 'navigation',
			order: 2,
		},
	},
]);
