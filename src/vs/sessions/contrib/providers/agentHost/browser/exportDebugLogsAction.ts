/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { DEFAULT_CHAT_ID } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { exportAgentHostDebugLogs, IActiveAgentHostSessionForExport } from '../../../../../workbench/contrib/chat/browser/actions/exportAgentHostDebugLogsAction.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';

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
				ContextKeyExpr.or(IsSessionsWindowContext, AGENT_HOST_ENABLED_CONTEXT_KEY),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);

		const activeSession = sessionsService.activeSession.get();
		const provider = activeSession ? sessionsProvidersService.getProvider(activeSession.providerId) : undefined;
		const activeProvider = provider && isAgentHostProvider(provider) ? provider : undefined;
		const activeChat = activeSession?.activeChat.get();
		const activeSessionContext: IActiveAgentHostSessionForExport | undefined = activeSession && activeProvider
			? {
				resource: activeSession.resource,
				sessionTitle: activeSession.title.get(),
				chatTitle: activeChat?.title.get(),
				isLocal: activeSession.resource.scheme.startsWith('agent-host-'),
				chatId: activeChat?.resource.fragment || DEFAULT_CHAT_ID,
				backendChatResource: activeChat ? activeProvider.getBackendChatResource(activeChat.resource) : undefined,
			}
			: undefined;

		await exportAgentHostDebugLogs(accessor, activeSessionContext);
	}
}

registerAction2(ExportAgentHostDebugLogsAction);
