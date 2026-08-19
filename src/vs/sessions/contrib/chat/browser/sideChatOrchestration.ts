/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ChatSideChatSendResult, ChatSideChatSendResultKind } from '../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISideChatSelection } from '../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ITransientSideChatService } from './transientSideChatService.js';

export const ISideChatOrchestrationService = createDecorator<ISideChatOrchestrationService>('sideChatOrchestrationService');

export const enum SideChatPresentation {
	Full = 'full',
	Transient = 'transient',
}

export interface IPreparedSideChat {
	readonly sideChat: IChat;
	readonly presentation: SideChatPresentation;
	send(requestOptions: ISendRequestOptions): Promise<ChatSideChatSendResult>;
}

export interface ISideChatOrchestrationService {
	readonly _serviceBrand: undefined;
	prepare(session: ISession, sourceChat: IChat, sideChat: IChat, question: string): Promise<IPreparedSideChat>;
	createAndPresent(session: ISession, sourceChat: IChat, turnId: string, question: string, selection?: ISideChatSelection): Promise<IPreparedSideChat>;
}

export class SideChatOrchestrationService implements ISideChatOrchestrationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@ITransientSideChatService private readonly transientSideChatService: ITransientSideChatService,
	) { }

	async createAndPresent(session: ISession, sourceChat: IChat, turnId: string, question: string, selection?: ISideChatSelection): Promise<IPreparedSideChat> {
		const sideChat = await this.sessionsManagementService.createSideChatInSession(session, sourceChat.resource, turnId, selection);
		return this.prepare(session, sourceChat, sideChat, question);
	}

	async prepare(session: ISession, sourceChat: IChat, sideChat: IChat, question: string): Promise<IPreparedSideChat> {
		const presentation = await this.transientSideChatService.show(session, sourceChat, sideChat, question)
			? SideChatPresentation.Transient
			: SideChatPresentation.Full;
		if (presentation === SideChatPresentation.Full) {
			await this.sessionsService.openChat(session, sideChat.resource);
			const activeSession = this.sessionsService.activeSession.get();
			if (activeSession?.sessionId !== session.sessionId || !isEqual(activeSession.activeChat.get().resource, sideChat.resource)) {
				throw new Error(`Side chat '${sideChat.resource.toString()}' did not open`);
			}
			this.sessionsPartService.getSessionView(session.sessionId)?.splitChatToSide(sideChat.resource);
		}
		return {
			sideChat,
			presentation,
			send: requestOptions => this._send(session, sideChat, presentation, requestOptions),
		};
	}

	private async _send(session: ISession, sideChat: IChat, presentation: SideChatPresentation, requestOptions: ISendRequestOptions): Promise<ChatSideChatSendResult> {
		try {
			await this.sessionsManagementService.sendRequest(session, sideChat, {
				...requestOptions,
				preserveActiveChat: presentation === SideChatPresentation.Transient,
			});
			return { kind: ChatSideChatSendResultKind.Sent };
		} catch (error) {
			if (presentation === SideChatPresentation.Transient && this.transientSideChatService.markFailed(sideChat.resource)) {
				return { kind: ChatSideChatSendResultKind.FailedAndPresented, error };
			}
			throw error;
		}
	}
}
