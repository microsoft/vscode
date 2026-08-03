/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSideChatProvider, IChatSideChatSelection, IChatSideChatService } from '../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { createAndSendSideChat } from './sideChatOrchestration.js';

/**
 * Backs the workbench's "Ask in Side Chat" affordance with the Agents window's
 * side chat implementation. The workbench owns the action and its presentation;
 * this provider owns branching a chat from a session turn, which only this layer
 * can do today.
 */
export class SessionsSideChatProviderContribution extends Disposable implements IWorkbenchContribution, IChatSideChatProvider {

	static readonly ID = 'sessions.contrib.sideChatProvider';

	constructor(
		@IChatSideChatService sideChatService: IChatSideChatService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IChatService private readonly chatService: IChatService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		if (!environmentService.isSessionsWindow) {
			return;
		}

		this._register(sideChatService.registerProvider(this));
	}

	canAskInSideChat(sessionResource: URI): boolean {
		return !!this._resolveSource(sessionResource);
	}

	async askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection): Promise<void> {
		const source = this._resolveSource(sessionResource);
		if (!source) {
			throw new Error(`Side chats are not supported for ${sessionResource.toString()}`);
		}
		const { session, chatResource, turnId } = source;
		await createAndSendSideChat(this.sessionsManagementService, this.sessionsService, session, chatResource, turnId, query, selection);
	}

	/**
	 * Resolves the session, chat and turn a side chat would branch from, or
	 * `undefined` when this conversation cannot produce one — it is untitled,
	 * archived, its provider lacks side chat support, or nothing has been sent
	 * yet so there is no turn to anchor to.
	 */
	private _resolveSource(sessionResource: URI) {
		const found = this.sessionsManagementService.getSessionForChatResource(sessionResource);
		if (!found) {
			return undefined;
		}
		const { session, chat } = found;
		if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
			return undefined;
		}
		const sourceTurn = this.chatService.getSession(chat.resource)?.getRequests().at(-1);
		if (!sourceTurn) {
			return undefined;
		}
		return { session, chatResource: chat.resource, turnId: sourceTurn.id };
	}
}

registerWorkbenchContribution2(SessionsSideChatProviderContribution.ID, SessionsSideChatProviderContribution, WorkbenchPhase.BlockRestore);
