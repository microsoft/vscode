/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { IProjectBoardService } from './projectBoardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { OPEN_AGENT_PROJECT_BOARD_COMMAND_ID } from '../../../../platform/window/common/window.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';

registerAction2(class OpenProjectBoardAction extends Action2 {
	constructor() {
		super({
			id: OPEN_AGENT_PROJECT_BOARD_COMMAND_ID,
			title: localize2('openAgentProjectBoard', "Agents: Open Project Board"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const lifecycleService = accessor.get(ILifecycleService);
		const projectBoardService = accessor.get(IProjectBoardService);
		await lifecycleService.when(LifecyclePhase.Restored);
		await projectBoardService.open();
	}
});
