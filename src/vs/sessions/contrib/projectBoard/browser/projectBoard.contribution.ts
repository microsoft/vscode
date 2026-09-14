/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { IProjectBoardService } from './projectBoardService.js';

registerAction2(class OpenProjectBoardAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openAgentProjectBoard',
			title: localize2('openAgentProjectBoard', "Agents: Open Project Board"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IProjectBoardService).open();
	}
});
