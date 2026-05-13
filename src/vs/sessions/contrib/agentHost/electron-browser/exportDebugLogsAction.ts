/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { AgentHostEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { exportAgentHostDebugLogs, IActiveAgentHostSessionForExport } from '../../../../workbench/contrib/chat/electron-browser/actions/exportAgentHostDebugLogsAction.js';
import { type ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { BaseAgentHostSessionsProvider } from '../browser/baseAgentHostSessionsProvider.js';

export class ExportAgentHostDebugLogsAction extends Action2 {

	static readonly ID = 'agentHost.exportDebugLogs';

	constructor() {
		super({
			id: ExportAgentHostDebugLogsAction.ID,
			title: localize2('exportAgentHostDebugLogs', "Export Agent Host Debug Logs..."),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.or(IsSessionsWindowContext, ContextKeyExpr.equals(`config.${AgentHostEnabledSettingId}`, true)),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);

		const activeSession = sessionsManagementService.activeSession.get();
		const activeAgentHostSession = isAgentHostSession(activeSession, sessionsProvidersService) ? activeSession : undefined;
		const sessionForEvents = activeAgentHostSession ?? getMostRecentAgentHostSession(sessionsManagementService.getSessions(), sessionsProvidersService);

		const activeSessionContext: IActiveAgentHostSessionForExport | undefined = sessionForEvents
			? {
				resource: sessionForEvents.resource,
				title: activeAgentHostSession?.title.get(),
				isLocal: sessionForEvents.resource.scheme.startsWith('agent-host-'),
			}
			: undefined;

		await exportAgentHostDebugLogs(accessor, activeSessionContext);
	}
}

function isAgentHostSession(session: ISession | undefined, sessionsProvidersService: ISessionsProvidersService): session is ISession {
	return !!session && sessionsProvidersService.getProvider(session.providerId) instanceof BaseAgentHostSessionsProvider;
}

function getMostRecentAgentHostSession(sessions: readonly ISession[], sessionsProvidersService: ISessionsProvidersService): ISession | undefined {
	let mostRecent: ISession | undefined;
	for (const session of sessions) {
		if (!isAgentHostSession(session, sessionsProvidersService)) {
			continue;
		}
		if (!mostRecent || session.updatedAt.get().getTime() > mostRecent.updatedAt.get().getTime()) {
			mostRecent = session;
		}
	}
	return mostRecent;
}
