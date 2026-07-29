/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID, IAgentHostDelegationRequest } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

// Agent host delegation ("Continue in…") for the Agents window.
//
// Delegation to an agent host session is "just a message with an attachment",
// so a single generic handler serves every agent host session type instead of
// registering a command per type. The chat layer funnels agent host delegation
// through `CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID`; here we create the
// target session through the Agents window's own session infrastructure and
// send the (transcript-carrying) request to it.
CommandsRegistry.registerCommand(CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID, async (accessor: ServicesAccessor, request?: IAgentHostDelegationRequest): Promise<void> => {
	const logService = accessor.get(ILogService);
	if (!request?.type || !request.prompt) {
		logService.warn('[Sessions] Agent host delegation skipped: missing request payload');
		return;
	}

	const sessionsService = accessor.get(ISessionsService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);

	const sourceSession = sessionsService.activeSession.get();
	if (!sourceSession) {
		logService.warn('[Sessions] Agent host delegation skipped: no active session');
		return;
	}
	// Reuse the source (active) session's workspace folder for the new session.
	const folderUri = sourceSession.workspace.get()?.folders.at(0)?.root;
	if (!folderUri) {
		logService.warn('[Sessions] Agent host delegation skipped: no active session workspace folder');
		return;
	}

	// The chat session contribution type is `agent-host-<provider>`, whereas the
	// Agents window sessions provider advertises the bare provider id (e.g.
	// `copilotcli`) as its session type id.
	const isLocalAgentHostTarget = request.type.startsWith('agent-host-');
	const sessionTypeId = isLocalAgentHostTarget
		? request.type.slice('agent-host-'.length)
		: request.type;
	const providerId = isLocalAgentHostTarget ? LOCAL_AGENT_HOST_PROVIDER_ID : undefined;

	try {
		const session = sessionsManagementService.createNewSession(folderUri, { providerId, sessionTypeId });
		sessionsService.insertAt(session, sourceSession.sessionId, 'right', true);
		await sessionsManagementService.sendNewChatRequest(session, { query: request.prompt, attachedContext: request.attachedContext });
	} catch (e) {
		logService.error(`[Sessions] Agent host delegation to '${sessionTypeId}' failed`, e);
		throw e;
	}
});
