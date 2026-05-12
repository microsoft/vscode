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
import { exportAgentHostDebugLogs } from '../../../../workbench/contrib/chat/electron-browser/actions/exportAgentHostDebugLogsAction.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IsAgentHostSession } from '../browser/agentHostSkillButtons.js';

/**
 * Sessions-app variant of the "Export Agent Host Debug Logs" action. Uses
 * the Agents window's `ISessionsManagementService.activeSession` to find
 * the active Copilot CLI session, then defers to the shared workbench
 * helper for the actual log collection and zip-export work.
 *
 * The vscode workbench registers a separate action class
 * (`ExportAgentHostDebugLogsAction` in
 * `workbench/contrib/chat/electron-browser/actions/exportAgentHostDebugLogsAction.ts`)
 * that resolves the session resource via `IChatWidgetService` instead.
 */
export class ExportAgentHostDebugLogsAction extends Action2 {

	static readonly ID = 'agentHost.exportDebugLogs';

	constructor() {
		super({
			id: ExportAgentHostDebugLogsAction.ID,
			title: localize2('exportAgentHostDebugLogs', "Export Agent Host Debug Logs..."),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsAgentHostSession),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const activeSession = sessionsManagementService.activeSession.get();
		const sessionResource = activeSession?.resource;
		const sessionTitle = activeSession?.title.get();
		await exportAgentHostDebugLogs(accessor, sessionResource, sessionTitle);
	}
}
