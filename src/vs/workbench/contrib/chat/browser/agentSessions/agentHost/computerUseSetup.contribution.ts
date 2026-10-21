/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { AgentHostComputerUseEnabledSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IsMacNativeContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ComputerUseSetupService, IComputerUseSetupService } from './computerUseSetup.js';

registerSingleton(IComputerUseSetupService, ComputerUseSetupService, InstantiationType.Delayed);

/** Opens the Computer Use permission setup modal; the chat's setup card passes its setup id. */
export const SetUpComputerUseActionId = 'workbench.action.chat.setUpComputerUse';

registerAction2(class SetUpComputerUseAction extends Action2 {
	constructor() {
		super({
			id: SetUpComputerUseActionId,
			title: localize2('chat.computerUse.setUp', "Set Up Computer Use"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsMacNativeContext, ContextKeyExpr.equals(`config.${AgentHostComputerUseEnabledSettingId}`, true)),
		});
	}

	run(accessor: ServicesAccessor, setupId?: unknown): void {
		accessor.get(IComputerUseSetupService).open(typeof setupId === 'string' ? setupId : undefined);
	}
});
