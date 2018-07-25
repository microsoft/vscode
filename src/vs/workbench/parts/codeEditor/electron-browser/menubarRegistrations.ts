/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

selectionMenuRegistration();

function selectionMenuRegistration() {

	MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
		group: '3_multi',
		command: {
			id: 'workbench.action.toggleMultiCursorModifier',
			title: nls.localize('miMultiCursorAlt', "Switch to Alt+Click for Multi-Cursor")
		},
		order: 1
	});

}
