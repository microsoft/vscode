/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SearchModalWidget } from './searchModalWidget.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

let globalSearchModalWidget: SearchModalWidget | undefined;

export class ShowSearchModalAction extends Action2 {

	static readonly ID = 'workbench.action.showSearchModal';

	constructor() {
		super({
			id: ShowSearchModalAction.ID,
			title: localize2('showSearchModal', 'Search Modal'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyT
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(ILayoutService);

		// Create widget if it doesn't exist
		if (!globalSearchModalWidget) {
			const container = layoutService.activeContainer;
			globalSearchModalWidget = instantiationService.createInstance(SearchModalWidget, container);
		}

		// Show the modal
		globalSearchModalWidget.show();
	}
}

// Register the action
registerAction2(ShowSearchModalAction);
