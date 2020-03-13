/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ICommand } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export const QUICK_ACCESS_COMMAND_ID = 'workbench.action.openQuickAccess';

export const quickAccessCommand: ICommand = {
	id: QUICK_ACCESS_COMMAND_ID,
	handler: async function (accessor: ServicesAccessor, prefix: string | null = null) {
		const quickInputService = accessor.get(IQuickInputService);

		quickInputService.quickAccess.show(typeof prefix === 'string' ? prefix : undefined);
	},
	description: {
		description: `Quick access`,
		args: [{
			name: 'prefix',
			schema: {
				'type': 'string'
			}
		}]
	}
};
