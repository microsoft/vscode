/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModel, IChatModel, IChatRequestModel, IChatRequestVariableData, ISerializableChatData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatCompleteResponse, IChatDetail, IChatProviderInfo, IChatSendRequestData, IChatSendRequestOptions, IChatService, IChatTransferredSessionData, IChatUserActionEvent } from 'vs/workbench/contrib/chat/common/chatService';

export class MockChatService implements IChatService {
	_serviceBrand: undefined;
	transferredSessionData: IChatTransferredSessionData | undefined;

	isEnabled(location: ChatAgentLocation): boolean {
		throw new Error('Method not implemented.');
	}
	hasSessions(): boolean {
		throw new Error('Method not implemented.');
	}
	getProviderInfos(): IChatProviderInfo[] {
		throw new Error('Method not implemented.');
	}
	startSession(location: ChatAgentLocation, token: CancellationToken): ChatModel | undefined {
		throw new Error('Method not implemented.');
	}
	getSession(sessionId: string): IChatModel | undefined {
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return {} as IChatModel;
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
}
