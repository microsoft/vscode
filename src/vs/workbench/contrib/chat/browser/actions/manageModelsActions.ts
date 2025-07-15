/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IBYOKService } from '../../common/byokService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { CHAT_CATEGORY } from './chatActions.js';

export class ManageModelsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.manageLanguageModels';

	constructor() {
		super({
			id: ManageModelsAction.ID,
			title: localize2('manageLanguageModels', 'Manage Language Models...'),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			f1: true
		});
	}
	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		accessor.get(IBYOKService).showBYOKQuickPick();
	}
}
