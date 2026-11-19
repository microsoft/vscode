/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { openAgentHostStateFile } from '../../../../chat/browser/actions/openAgentHostStateFileAction.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { resolveSessionCommandTarget } from '../../../browser/sessionCommandTarget.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { IsAgentHostSession } from '../../../browser/sessionScopedContextKeys.js';

/**
 * Sessions-app variant of "Open Agent Host State File". Resolves the Agent
 * Host session and chat it acts on with `resolveSessionCommandTarget` (the
 * focused host's, without arguments), then defers to the shared workbench helper.
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

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const target = resolveSessionCommandTarget(accessor, args);
		// Arguments that name a session or chat that is gone: nothing to export or open.
		if (!target) {
			return;
		}
		const activeSession = target?.session;
		const provider = activeSession ? sessionsProvidersService.getProvider(activeSession.providerId, activeSession.sessionId) : undefined;
		const activeChat = target?.chat;
		const chatTarget = activeChat?.resource.fragment
			? { backendResource: provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(activeChat.resource) : undefined }
			: undefined;
		await openAgentHostStateFile(accessor, activeSession?.resource, chatTarget);
	}
}
