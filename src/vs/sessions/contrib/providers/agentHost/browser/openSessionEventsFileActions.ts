/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { openCopilotCliStateFile } from '../../../../../workbench/contrib/chat/browser/actions/openCopilotCliStateFileAction.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { BaseAgentHostSessionsProvider } from './baseAgentHostSessionsProvider.js';
import { IsAgentHostSession } from './agentHostSkillButtons.js';

/**
 * Sessions-app variant of "Open Copilot CLI State File". Uses the Agents
 * window's `ISessionsService.activeSession` to find the focused chat tab
 * of the active Copilot CLI session, then defers to the shared workbench
 * helper for the actual resolution and editor opening.
 *
 * Sessions can contain multiple chats; the state file is per-chat, so we
 * resolve the focused chat's resource rather than the session's main chat.
 * A peer chat's `events.jsonl` lives under a host-private backing session id
 * that the chat resource does not encode, so we first ask the provider to map
 * the focused chat to a session-shaped resource carrying that id (falling back
 * to the chat resource for the default chat, whose path id already names its
 * logs).
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
		const sessionsService = accessor.get(ISessionsService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const activeSession = sessionsService.activeSession.get();
		const focusedChatResource = activeSession?.activeChat.get()?.resource ?? activeSession?.resource;

		let sessionResource = focusedChatResource;
		if (activeSession && focusedChatResource) {
			const provider = sessionsProvidersService.getProvider(activeSession.providerId);
			if (provider instanceof BaseAgentHostSessionsProvider) {
				sessionResource = provider.getChatSdkSessionResource(focusedChatResource) ?? focusedChatResource;
			}
		}

		await openCopilotCliStateFile(accessor, sessionResource);
	}
}
