/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { RemoteNameContext } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export class RestartLocalAgentHostAction extends Action2 {
	static readonly ID = 'workbench.action.chat.restartLocalAgentHost';

	constructor() {
		super({
			id: RestartLocalAgentHostAction.ID,
			title: localize2('restartLocalAgentHost', "Restart Local Agent Host"),
			category: Categories.Developer,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				AGENT_HOST_ENABLED_CONTEXT_KEY,
				RemoteNameContext.isEqualTo(''),
			),
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IAgentHostService).restartAgentHost();
	}
}
