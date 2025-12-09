/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatModel, IChatRequestModel, IChatRequestVariableData, ISerializableChatData } from '../../common/chatModel.js';
import { IParsedChatRequest } from '../../common/chatParserTypes.js';
import { IChatCompleteResponse, IChatDetail, IChatModelReference, IChatProgress, IChatProviderInfo, IChatSendRequestData, IChatSendRequestOptions, IChatService, IChatSessionContext, IChatSessionStartOptions, IChatTransferredSessionData, IChatUserActionEvent } from '../../common/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';

export class MockChatService implements IChatService {
	chatModels: IObservable<Iterable<IChatModel>> = observableValue('chatModels', []);
	requestInProgressObs = observableValue('name', false);
	edits2Enabled: boolean = false;
	_serviceBrand: undefined;
	editingSessions = [];
	transferredSessionData: IChatTransferredSessionData | undefined;
	readonly onDidSubmitRequest: Event<{ readonly chatSessionResource: URI }> = Event.None;

	private sessions = new ResourceMap<IChatModel>();

	setSaveModelsEnabled(enabled: boolean): void {

	}
	isEnabled(location: ChatAgentLocation): boolean {
		throw new Error('Method not implemented.');
	}
	hasSessions(): boolean {
		throw new Error('Method not implemented.');
	}
	getProviderInfos(): IChatProviderInfo[] {
		throw new Error('Method not implemented.');
	}
	startSession(location: ChatAgentLocation, options?: IChatSessionStartOptions): IChatModelReference {
		throw new Error('Method not implemented.');
	}
	addSession(session: IChatModel): void {
		this.sessions.set(session.sessionResource, session);
	}
	getSession(sessionResource: URI): IChatModel | undefined {
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return this.sessions.get(sessionResource) ?? {} as IChatModel;
	}
	async getOrRestoreSession(sessionResource: URI): Promise<IChatModelReference | undefined> {
		throw new Error('Method not implemented.');
	}
	getPersistedSessionTitle(sessionResource: URI): string | undefined {
		throw new Error('Method not implemented.');
	}
	loadSessionFromContent(data: ISerializableChatData): IChatModelReference | undefined {
		throw new Error('Method not implemented.');
	}
	loadSessionForResource(resource: URI, position: ChatAgentLocation, token: CancellationToken): Promise<IChatModelReference | undefined> {
		throw new Error('Method not implemented.');
	}
	getActiveSessionReference(sessionResource: URI): IChatModelReference | undefined {
		return undefined;
	}
	setTitle(sessionResource: URI, title: string): void {
		throw new Error('Method not implemented.');
	}
	appendProgress(request: IChatRequestModel, progress: IChatProgress): void {

	}
	/**
	 * Returns whether the request was accepted.
	 */
	sendRequest(sessionResource: URI, message: string): Promise<IChatSendRequestData | undefined> {
		throw new Error('Method not implemented.');
	}
	resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}
	adoptRequest(sessionResource: URI, request: IChatRequestModel): Promise<void> {
		throw new Error('Method not implemented.');
	}
	removeRequest(sessionResource: URI, requestId: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelCurrentRequestForSession(sessionResource: URI): void {
		throw new Error('Method not implemented.');
	}
	addCompleteRequest(sessionResource: URI, message: IParsedChatRequest | string, variableData: IChatRequestVariableData | undefined, attempt: number | undefined, response: IChatCompleteResponse): void {
		throw new Error('Method not implemented.');
	}
	async getLocalSessionHistory(): Promise<IChatDetail[]> {
		throw new Error('Method not implemented.');
	}
	async clearAllHistoryEntries() {
		throw new Error('Method not implemented.');
	}
	async removeHistoryEntry(resource: URI) {
		throw new Error('Method not implemented.');
	}

	readonly onDidPerformUserAction: Event<IChatUserActionEvent> = undefined!;
	notifyUserAction(event: IChatUserActionEvent): void {
		throw new Error('Method not implemented.');
	}
	readonly onDidDisposeSession: Event<{ sessionResource: URI; reason: 'cleared' }> = undefined!;

	transferChatSession(transferredSessionData: IChatTransferredSessionData, toWorkspace: URI): void {
		throw new Error('Method not implemented.');
	}

	setChatSessionTitle(sessionResource: URI, title: string): void {
		throw new Error('Method not implemented.');
	}

	isEditingLocation(location: ChatAgentLocation): boolean {
		throw new Error('Method not implemented.');
	}

	getChatStorageFolder(): URI {
		throw new Error('Method not implemented.');
	}

	logChatIndex(): void {
		throw new Error('Method not implemented.');
	}

	isPersistedSessionEmpty(sessionResource: URI): boolean {
		throw new Error('Method not implemented.');
	}

	activateDefaultAgent(location: ChatAgentLocation): Promise<void> {
		throw new Error('Method not implemented.');
	}

	getChatSessionFromInternalUri(sessionResource: URI): IChatSessionContext | undefined {
		throw new Error('Method not implemented.');
	}

	async getLiveSessionItems(): Promise<IChatDetail[]> {
		throw new Error('Method not implemented.');
	}
	getHistorySessionItems(): Promise<IChatDetail[]> {
		throw new Error('Method not implemented.');
	}

	waitForModelDisposals(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getMetadataForSession(sessionResource: URI): Promise<IChatDetail | undefined> {
		throw new Error('Method not implemented.');
	}
}
