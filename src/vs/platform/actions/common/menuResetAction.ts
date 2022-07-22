/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action2, IMenuService } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export class MenuHiddenStatesReset extends Action2 {

	constructor() {
		super({
			id: 'menu.resetHiddenStates',
			title: {
				value: localize('title', 'Reset Hidden Menus'),
				original: 'Reset Hidden Menus'
			},
			category: localize('cat', 'View'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IMenuService).resetHiddenStates();
		accessor.get(ILogService).info('did RESET all menu hidden states');
	}
}
