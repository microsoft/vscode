/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotebookActionContext, NOTEBOOK_ACTIONS_CATEGORY } from '../../controller/coreActions.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';

const TOGGLE_CELL_TOOLBAR_POSITION = 'notebook.toggleCellToolbarPosition';

export class ToggleCellToolbarPositionAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CELL_TOOLBAR_POSITION,
			title: localize2('notebook.toggleCellToolbarPosition', 'Toggle Cell Toolbar Position'),
			menu: [{
				id: MenuId.NotebookCellTitle,
				group: 'View',
				order: 1
			}],
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, context: any): Promise<void> {
		const editor = context && context.ui ? (context as INotebookActionContext).notebookEditor : undefined;
		if (editor && editor.hasModel()) {
			const configurationService = accessor.get(IConfigurationService);
			const toolbarPosition = configurationService.getValue<string>(NotebookSetting.cellToolbarLocation) ?? 'right';
			const newPosition = this.togglePosition(toolbarPosition);
			await configurationService.updateValue(NotebookSetting.cellToolbarLocation, newPosition);
		}
	}

	togglePosition(toolbarPosition: string): string {
		// Toggle between 'left' and 'right', ignoring 'hidden' for the toggle action
		if (toolbarPosition === 'left') {
			return 'right';
		} else if (toolbarPosition === 'right') {
			return 'left';
		} else if (toolbarPosition === 'hidden') {
			return 'right';
		} else {
			// Invalid or missing value, default to 'left' as the toggle result from 'right'
			return 'left';
		}
	}
}
registerAction2(ToggleCellToolbarPositionAction);

