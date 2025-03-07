/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { ChatModel, IChatModel, IChatRequestModel, IChatRequestVariableData, ISerializableChatData } from '../../common/chatModel.js';
import { IParsedChatRequest } from '../../common/chatParserTypes.js';
import { IChatCompleteResponse, IChatDetail, IChatProviderInfo, IChatSendRequestData, IChatSendRequestOptions, IChatService, IChatTransferredSessionData, IChatUserActionEvent } from '../../common/chatService.js';

export class MockChatService implements IChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;
	onDidSubmitRequest: Event<{ chatSessionId: string }> = Event.None;

	private sessions = new Map<string, IChatModel>();

	isEnabled(location: ChatAgentLocation): boolean {
		throw new Error('Method not implemented.');
	}
	hasSessions(): boolean {
		throw new Error('Method not implemented.');
	}
	getProviderInfos(): IChatProviderInfo[] {
		throw new Error('Method not implemented.');
	}
	startSession(location: ChatAgentLocation, token: CancellationToken): ChatModel {
		throw new Error('Method not implemented.');
	}
	addSession(session: IChatModel): void {
		this.sessions.set(session.sessionId, session);
	}
	getSession(sessionId: string): IChatModel | undefined {
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return this.sessions.get(sessionId) ?? {} as IChatModel;
	}
	getOrRestoreSession(sessionId: string): IChatModel | undefined {
		throw new Error('Method not implemented.');
	}
	loadSessionFromContent(data: ISerializableChatData): IChatModel | undefined {
		throw new Error('Method not implemented.');
	}
	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionId: string, message: string): Promise<IChatSendRequestData | undefined> {
		throw new Error('Method not implemented.');
	}
	resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}
	adoptRequest(sessionId: string, request: IChatRequestModel): Promise<void> {
		throw new Error('Method not implemented.');
	}
	removeRequest(sessionid: string, requestId: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelCurrentRequestForSession(sessionId: string): void {
		throw new Error('Method not implemented.');
	}
	clearSession(sessionId: string): void {
		throw new Error('Method not implemented.');
	}
	addCompleteRequest(sessionId: string, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void {
		throw new Error('Method not implemented.');
	}
	getHistory(): IChatDetail[] {
		throw new Error('Method not implemented.');
	}
	clearAllHistoryEntries(): void {
		throw new Error('Method not implemented.');
	}
	removeHistoryEntry(sessionId: string): void {
		throw new Error('Method not implemented.');
	}

	onDidPerformUserAction: Event<IChatUserActionEvent> = undefined!;
	notifyUserAction(event: IChatUserActionEvent): void {
		throw new Error('Method not implemented.');
	}
	onDidDisposeSession: Event<{ sessionId: string; reason: 'initializationFailed' | 'cleared' }> = undefined!;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void {
		throw new Error('Method not implemented.');
	}

	setChatSessionTitle(sessionId: string, title: string): void {
		throw new Error('Method not implemented.');
	}
}
