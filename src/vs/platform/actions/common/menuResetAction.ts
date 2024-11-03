/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../nls.js';
import { Categories } from '../../action/common/actionCommonCategories.js';
import { Action2, IMenuService } from './actions.js';
import { ServicesAccessor } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export class MenuHiddenStatesReset extends Action2 {

	constructor() {
		super({
			id: 'menu.resetHiddenStates',
			title: localize2('title', "Reset All Menus"),
			category: Categories.View,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IMenuService).resetHiddenStates();
		accessor.get(ILogService).info('did RESET all menu hidden states');
	}
}
