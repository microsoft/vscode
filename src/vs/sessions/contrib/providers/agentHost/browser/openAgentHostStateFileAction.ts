/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { openAgentHostStateFile } from '../../../../../workbench/contrib/chat/browser/actions/openAgentHostStateFileAction.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IsAgentHostSession } from './agentHostSkillButtons.js';

/**
 * Sessions-app variant of "Open Agent Host State File". Uses the Agents
 * window's `ISessionsService.activeSession` to find the active Agent Host
 * session and chat, then defers to the shared workbench helper.
 *
 * The vscode workbench registers a separate action class
 * (`OpenAgentHostStateFileAction` in
 * `workbench/contrib/chat/browser/actions/openAgentHostStateFileAction.ts`)
 * that resolves the session resource via `IChatWidgetService` instead.
 */
export class OpenAgentHostStateFileAction extends Action2 {

	static readonly ID = 'agentHost.openSessionEventsFile';

	constructor() {
		super({
			id: OpenAgentHostStateFileAction.ID,
			title: localize2('openAgentHostStateFile', "Open Agent Host State File"),
			f1: true,
			category: Categories.Developer,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsAgentHostSession),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const activeSession = sessionsService.activeSession.get();
		const provider = activeSession ? sessionsProvidersService.getProvider(activeSession.providerId) : undefined;
		const activeChat = activeSession?.activeChat.get();
		const chatTarget = activeChat?.resource.fragment
			? { backendResource: provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(activeChat.resource) : undefined }
			: undefined;
		await openAgentHostStateFile(accessor, activeSession?.resource, chatTarget);
	}
}
