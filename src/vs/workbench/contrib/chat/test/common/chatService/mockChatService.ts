/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ChatRequestQueueKind, ChatSendResult, IChatDetail, IChatModelReference, IChatProgress, IChatSendRequestOptions, IChatService, IChatSessionContext, IChatSessionStartOptions, IChatUserActionEvent } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatModel, IChatRequestModel, IExportableChatData, ISerializableChatData } from '../../../common/model/chatModel.js';
import type { IChatModelReferenceDebugSnapshot } from '../../../common/model/chatModelStore.js';

export class MockChatService implements IChatService {
	private readonly _chatModels: ISettableObservable<Iterable<IChatModel>> = observableValue('chatModels', []);
	readonly chatModels = this._chatModels;
	requestInProgressObs = observableValue('name', false);
	_serviceBrand: undefined;
	editingSessions = [];
	transferredSessionResource = undefined;
	readonly onDidSubmitRequest = Event.None;

	private readonly _onDidCreateModel = new Emitter<IChatModel>();
	readonly onDidCreateModel = this._onDidCreateModel.event;

	private readonly sessions = new ResourceMap<IChatModel>();
	private liveSessionItems: IChatDetail[] = [];
	private historySessionItems: IChatDetail[] = [];

	private readonly _onDidDisposeSession = new Emitter<{ sessionResources: URI[]; reason: 'cleared' }>();
	readonly onDidDisposeSession = this._onDidDisposeSession.event;

	fireDidDisposeSession(sessionResources: URI[]): void {
		this._onDidDisposeSession.fire({ sessionResources, reason: 'cleared' });
	}

	setSaveModelsEnabled(enabled: boolean): void {

	}

	processPendingRequests(sessionResource: URI): void {

	}

	setLiveSessionItems(items: IChatDetail[]): void {
		this.liveSessionItems = items;
	}

	setHistorySessionItems(items: IChatDetail[]): void {
		this.historySessionItems = items;
	}

	addSession(session: IChatModel): void {
		this.sessions.set(session.sessionResource, session);
		// Update the chatModels observable
		this._chatModels.set([...this.sessions.values()], undefined);
		this._onDidCreateModel.fire(session);
	}

	removeSession(sessionResource: URI): void {
		this.sessions.delete(sessionResource);
		// Update the chatModels observable
		this._chatModels.set([...this.sessions.values()], undefined);
	}

	isEnabled(_location: ChatAgentLocation): boolean {
		return true;
	}

	hasSessions(): boolean {
		return this.sessions.size > 0;
	}

	getProviderInfos() {
		return [];
	}

	startNewLocalSession(_location: ChatAgentLocation, _options?: IChatSessionStartOptions): IChatModelReference {
		throw new Error('Method not implemented.');
	}

	getSession(sessionResource: URI): IChatModel | undefined {
		return this.sessions.get(sessionResource);
	}

	getLatestRequest(): IChatRequestModel | undefined {
		return undefined;
	}

	acquireOrRestoreSession(_sessionResource: URI): Promise<IChatModelReference | undefined> {
		throw new Error('Method not implemented.');
	}

	getSessionTitle(_sessionResource: URI): string | undefined {
		return undefined;
	}

	loadSessionFromData(data: IExportableChatData | ISerializableChatData, _debugOwner?: string): IChatModelReference {
		throw new Error('Method not implemented.');
	}

	getChatModelReferenceDebugInfo(): IChatModelReferenceDebugSnapshot {
		return { totalModels: 0, totalReferences: 0, models: [] };
	}

	acquireOrLoadSession(_resource: URI, _position: ChatAgentLocation, _token: CancellationToken, _debugOwner?: string): Promise<IChatModelReference | undefined> {
		throw new Error('Method not implemented.');
	}

	acquireExistingSession(_sessionResource: URI, _debugOwner?: string): IChatModelReference | undefined {
		return undefined;
	}

	setSessionTitle(_sessionResource: URI, _title: string): void { }

	appendProgress(_request: IChatRequestModel, _progress: IChatProgress): void { }

	sendRequest(_sessionResource: URI, _message: string): Promise<ChatSendResult> {
		throw new Error('Method not implemented.');
	}

	resendRequest(_request: IChatRequestModel, _options?: IChatSendRequestOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	adoptRequest(_sessionResource: URI, _request: IChatRequestModel): Promise<void> {
		throw new Error('Method not implemented.');
	}

	removeRequest(_sessionResource: URI, _requestId: string): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async cancelCurrentRequestForSession(_sessionResource: URI, _source?: string): Promise<void> { }

	migrateRequests(_originalResource: URI, _targetResource: URI): void { }

	setYieldRequested(_sessionResource: URI): void { }

	removePendingRequest(_sessionResource: URI, _requestId: string): void { }

	setPendingRequests(_sessionResource: URI, _requests: readonly { requestId: string; kind: ChatRequestQueueKind }[]): void { }

	addCompleteRequest(): void { }

	async getLocalSessionHistory(): Promise<IChatDetail[]> {
		return this.historySessionItems;
	}

	async clearAllHistoryEntries(): Promise<void> { }

	async removeHistoryEntry(_resource: URI): Promise<void> { }

	readonly onDidPerformUserAction = Event.None;

	notifyUserAction(_event: IChatUserActionEvent): void { }

	readonly onDidReceiveQuestionCarouselAnswer = Event.None;

	notifyQuestionCarouselAnswer(_requestId: string, _resolveId: string, _answers: Record<string, unknown> | undefined): void { }

	async transferChatSession(): Promise<void> { }

	setChatSessionTitle(): void { }

	isEditingLocation(_location: ChatAgentLocation): boolean {
		return false;
	}

	getChatStorageFolder(): URI {
		return URI.file('/tmp');
	}

	logChatIndex(): void { }

	activateDefaultAgent(_location: ChatAgentLocation): Promise<void> {
		return Promise.resolve();
	}

	getChatSessionFromInternalUri(_sessionResource: URI): IChatSessionContext | undefined {
		return undefined;
	}

	async getLiveSessionItems(): Promise<IChatDetail[]> {
		return this.liveSessionItems;
	}

	async getHistorySessionItems(): Promise<IChatDetail[]> {
		return this.historySessionItems;
	}

	waitForModelDisposals(): Promise<void> {
		return Promise.resolve();
	}

	getMetadataForSession(sessionResource: URI): Promise<IChatDetail | undefined> {
		throw new Error('Method not implemented.');
	}
}
