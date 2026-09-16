/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { PREPARE_MODEL_PICKER_TRYOUT_COMMAND_ID } from '../../../../workbench/contrib/chat/common/onboarding/modelPickerTryout.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

registerAction2(class PrepareModelPickerTryoutAction extends Action2 {
	constructor() {
		super({
			id: PREPARE_MODEL_PICKER_TRYOUT_COMMAND_ID,
			title: localize2('prepareModelPickerTryout', "Prepare Model Picker Feature Example"),
			precondition: ChatContextKeys.enabled,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ISessionsService).openNewSession();
	}
});
