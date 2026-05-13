/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { openCopilotCliStateFile } from '../../../../workbench/contrib/chat/browser/actions/openCopilotCliStateFileAction.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IsAgentHostSession } from './agentHostSkillButtons.js';

/**
 * Sessions-app variant of "Open Copilot CLI State File". Uses the Agents
 * window's `ISessionsManagementService.activeSession` to find the active
 * Copilot CLI session, then defers to the shared workbench helper for
 * the actual resolution and editor opening.
 *
 * The vscode workbench registers a separate action class
 * (`OpenCopilotCliStateFileAction` in
 * `workbench/contrib/chat/browser/actions/openCopilotCliStateFileAction.ts`)
 * that resolves the session resource via `IChatWidgetService` instead.
 */
export class OpenSessionEventsFileAction extends Action2 {

	static readonly ID = 'agentHost.openSessionEventsFile';

	constructor() {
		super({
			id: OpenSessionEventsFileAction.ID,
			title: localize2('openSessionEventsFile', "Open Copilot CLI State File"),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsAgentHostSession),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionResource = sessionsManagementService.activeSession.get()?.resource;
		await openCopilotCliStateFile(accessor, sessionResource);
	}
}
