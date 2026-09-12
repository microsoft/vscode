/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ForkConversationAction, IForkConversationOptions } from '../../../../../workbench/contrib/chat/browser/actions/chatForkActions.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionRequestHistoryItem } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { isAgentHostProviderId } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

registerAction2(class extends ForkConversationAction {
	protected override async _tryForkAsChat(instantiationService: IInstantiationService, sourceSessionResource: URI, request: IChatSessionRequestHistoryItem | undefined, options?: IForkConversationOptions): Promise<boolean> {
		return instantiationService.invokeFunction(async accessor => {
			const sessionsManagementService = accessor.get(ISessionsManagementService);
			const sessionsService = accessor.get(ISessionsService);
			const chatService = accessor.get(IChatService);
			const logService = accessor.get(ILogService);

			const session = sessionsManagementService.getSession(sourceSessionResource)
				?? sessionsManagementService.getSessionForChatResource(sourceSessionResource)?.session;
			if (!session?.capabilities.get().supportsMultipleChats || !isAgentHostProviderId(session.providerId)) {
				return false;
			}

			const requests = chatService.getSession(sourceSessionResource)?.getRequests();
			let turnId: string | undefined;
			if (request) {
				const requestIdx = requests?.findIndex(r => r.id === request.id) ?? -1;
				if (requestIdx <= 0) {
					return false;
				}
				turnId = requests![requestIdx - 1].id;
			} else {
				turnId = requests?.at(-1)?.id;
			}
			if (!turnId) {
				return false;
			}

			const newChat = await sessionsManagementService.forkChatInSession(session, sourceSessionResource, turnId);
			if (options?.toSide) {
				await sessionsService.openChatToSide(session, newChat.resource, { referenceChatResource: sourceSessionResource });
			} else {
				await sessionsService.openChat(session, newChat.resource);
			}
			logService.trace(`[AgentHostSessions] Forked conversation into new chat ${newChat.resource.toString()} in session ${session.sessionId}`);
			return true;
		});
	}

	protected override _openForkedSession(instantiationService: IInstantiationService, parentSessionResource: URI, forkedSessionResource: URI, options?: IForkConversationOptions): Promise<void> {
		return instantiationService.invokeFunction(async accessor => {
			const sessionsManagementService = accessor.get(ISessionsManagementService);
			const sessionsService = accessor.get(ISessionsService);
			const logService = accessor.get(ILogService);

			const parentSession = sessionsManagementService.getSession(parentSessionResource)
				?? sessionsManagementService.getSessionForChatResource(parentSessionResource)?.session;
			if (!parentSession) {
				logService.error(`Parent session ${parentSessionResource.toString()} not found when forking conversation`);
				return super._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);
			}

			if (!sessionsManagementService.getSession(forkedSessionResource)) {
				let listener: IDisposable | undefined;
				const appeared = await raceTimeout(new Promise<boolean>(resolve => {
					listener = sessionsManagementService.onDidChangeSessions(() => {
						if (sessionsManagementService.getSession(forkedSessionResource)) {
							resolve(true);
						}
					});
				}), 30_000);
				listener?.dispose();

				if (!appeared) {
					logService.error(`Forked session ${forkedSessionResource.toString()} did not appear within timeout`);
					return;
				}
			}
			if (options?.toSide) {
				const forkedSession = sessionsManagementService.getSession(forkedSessionResource);
				if (!forkedSession) {
					throw new Error(`Forked session ${forkedSessionResource.toString()} is no longer available`);
				}
				await sessionsService.openSessionToSide(forkedSession, { source: 'fork', referenceSessionId: parentSession.sessionId });
			} else {
				await sessionsService.openSession(forkedSessionResource, { source: 'fork' });
			}
		});
	}
});
