/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ILogService } from 'vs/platform/log/common/log';
import { IChat, IChatFollowup, IChatProgress, IChatReplyFollowup, IChatResponse, IChatResponseErrorDetails, IChatResponseProgressFileTreeData, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';

export interface IChatRequestModel {
	readonly id: string;
	readonly providerRequestId: string | undefined;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly session: IChatModel;
	readonly message: string | IChatReplyFollowup;
	readonly response: IChatResponseModel | undefined;
}

export interface IResponse {
	readonly value: (IMarkdownString | IPlaceholderMarkdownString | IChatResponseProgressFileTreeData)[];
	onDidChangeValue: Event<void>;
	updateContent(responsePart: string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData } | { placeholder: string; resolvedContent?: Promise<string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData }> }, quiet?: boolean): void;
	asString(): string;
}

export interface IChatResponseModel {
	readonly onDidChange: Event<void>;
	readonly id: string;
	readonly providerId: string;
	readonly providerResponseId: string | undefined;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly session: IChatModel;
	readonly response: IResponse;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly vote: InteractiveSessionVoteDirection | undefined;
	readonly followups?: IChatFollowup[] | undefined;
	readonly errorDetails?: IChatResponseErrorDetails;
	setVote(vote: InteractiveSessionVoteDirection): void;
}

export function isRequest(item: unknown): item is IChatRequestModel {
	return !!item && typeof (item as IChatRequestModel).message !== 'undefined';
}

export function isResponse(item: unknown): item is IChatResponseModel {
	return !isRequest(item);
}

export class ChatRequestModel implements IChatRequestModel {
	private static nextId = 0;

	public response: ChatResponseModel | undefined;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	public get providerRequestId(): string | undefined {
		return this._providerRequestId;
	}

	public get username(): string {
		return this.session.requesterUsername;
	}

	public get avatarIconUri(): URI | undefined {
		return this.session.requesterAvatarIconUri;
	}

	constructor(
		public readonly session: ChatModel,
		public readonly message: string | IChatReplyFollowup,
		private _providerRequestId?: string) {
		this._id = 'request_' + ChatRequestModel.nextId++;
	}

	setProviderRequestId(providerRequestId: string) {
		this._providerRequestId = providerRequestId;
	}
}

export interface IPlaceholderMarkdownString extends IMarkdownString {
	isPlaceholder: boolean;
}

type ResponsePart = { string: IMarkdownString; isPlaceholder?: boolean } | { treeData: IChatResponseProgressFileTreeData; isPlaceholder?: undefined };
export class Response implements IResponse {
	private _onDidChangeValue = new Emitter<void>();
	public get onDidChangeValue() {
		return this._onDidChangeValue.event;
	}

	// responseParts internally tracks all the response parts, including strings which are currently resolving, so that they can be updated when they do resolve
	private _responseParts: ResponsePart[];
	// responseData externally presents the response parts with consolidated contiguous strings (including strings which were previously resolving)
	private _responseData: (IMarkdownString | IPlaceholderMarkdownString | IChatResponseProgressFileTreeData)[];
	// responseRepr externally presents the response parts with consolidated contiguous strings (excluding tree data)
	private _responseRepr: string;

	get value(): (IMarkdownString | IPlaceholderMarkdownString | IChatResponseProgressFileTreeData)[] {
		return this._responseData;
	}

	constructor(value: IMarkdownString | (IMarkdownString | IChatResponseProgressFileTreeData)[]) {
		this._responseData = Array.isArray(value) ? value : [value];
		this._responseParts = Array.isArray(value) ? value.map((v) => ('value' in v ? { string: v } : { treeData: v })) : [{ string: value }];
		this._responseRepr = this._responseParts.map((part) => {
			if (isCompleteInteractiveProgressTreeData(part)) {
				return '';
			}
			return part.string.value;
		}).join('\n');
	}

	asString(): string {
		return this._responseRepr;
	}

	updateContent(responsePart: string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData } | { placeholder: string; resolvedContent?: Promise<string | { treeData: IChatResponseProgressFileTreeData }> }, quiet?: boolean): void {
		if (typeof responsePart === 'string' || isMarkdownString(responsePart)) {
			const responsePartLength = this._responseParts.length - 1;
			const lastResponsePart = this._responseParts[responsePartLength];

			if (lastResponsePart.isPlaceholder === true || isCompleteInteractiveProgressTreeData(lastResponsePart)) {
				// The last part is resolving or a tree data item, start a new part
				this._responseParts.push({ string: typeof responsePart === 'string' ? new MarkdownString(responsePart) : responsePart });
			} else {
				// Combine this part with the last, non-resolving string part
				if (isMarkdownString(responsePart)) {
					this._responseParts[responsePartLength] = { string: new MarkdownString(lastResponsePart.string.value + responsePart.value, responsePart) };
				} else {
					this._responseParts[responsePartLength] = { string: new MarkdownString(lastResponsePart.string.value + responsePart, lastResponsePart.string) };
				}
			}

			this._updateRepr(quiet);
		} else if ('placeholder' in responsePart) {
			// Add a new resolving part
			const responsePosition = this._responseParts.push({ string: new MarkdownString(responsePart.placeholder), isPlaceholder: true }) - 1;
			this._updateRepr(quiet);

			responsePart.resolvedContent?.then((content) => {
				// Replace the resolving part's content with the resolved response
				if (typeof content === 'string') {
					this._responseParts[responsePosition] = { string: new MarkdownString(content), isPlaceholder: true };
					this._updateRepr(quiet);
				} else if (content.treeData) {
					this._responseParts[responsePosition] = { treeData: content.treeData };
					this._updateRepr(quiet);
				}
			});
		} else if (isCompleteInteractiveProgressTreeData(responsePart)) {
			this._responseParts.push(responsePart);
			this._updateRepr(quiet);
		}
	}

	private _updateRepr(quiet?: boolean) {
		this._responseData = this._responseParts.map(part => {
			if (isCompleteInteractiveProgressTreeData(part)) {
				return part.treeData;
			} else if (part.isPlaceholder) {
				return { ...part.string, isPlaceholder: true };
			}
			return part.string;
		});

		this._responseRepr = this._responseParts.map(part => {
			if (isCompleteInteractiveProgressTreeData(part)) {
				return '';
			}
			return part.string.value;
		}).join('\n\n');

		if (!quiet) {
			this._onDidChangeValue.fire();
		}
	}
}

export class ChatResponseModel extends Disposable implements IChatResponseModel {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private static nextId = 0;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	public get providerResponseId(): string | undefined {
		return this._providerResponseId;
	}

	public get isComplete(): boolean {
		return this._isComplete;
	}

	public get isCanceled(): boolean {
		return this._isCanceled;
	}

	public get vote(): InteractiveSessionVoteDirection | undefined {
		return this._vote;
	}

	public get followups(): IChatFollowup[] | undefined {
		return this._followups;
	}

	private _response: IResponse;
	public get response(): IResponse {
		return this._response;
	}

	public get errorDetails(): IChatResponseErrorDetails | undefined {
		return this._errorDetails;
	}

	public get providerId(): string {
		return this.session.providerId;
	}

	public get username(): string {
		return this.session.responderUsername;
	}

	public get avatarIconUri(): URI | undefined {
		return this.session.responderAvatarIconUri;
	}

	constructor(
		_response: IMarkdownString | (IMarkdownString | IChatResponseProgressFileTreeData)[],
		public readonly session: ChatModel,
		private _isComplete: boolean = false,
		private _isCanceled = false,
		private _vote?: InteractiveSessionVoteDirection,
		private _providerResponseId?: string,
		private _errorDetails?: IChatResponseErrorDetails,
		private _followups?: IChatFollowup[]
	) {
		super();
		this._response = new Response(_response);
		this._register(this._response.onDidChangeValue(() => this._onDidChange.fire()));
		this._id = 'response_' + ChatResponseModel.nextId++;
	}

	updateContent(responsePart: string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData } | { placeholder: string; resolvedContent?: Promise<string | IMarkdownString | { treeData: IChatResponseProgressFileTreeData }> }, quiet?: boolean) {
		this._response.updateContent(responsePart, quiet);
	}

	setProviderResponseId(providerResponseId: string) {
		this._providerResponseId = providerResponseId;
	}

	setErrorDetails(errorDetails?: IChatResponseErrorDetails): void {
		this._errorDetails = errorDetails;
		this._onDidChange.fire();
	}

	complete(): void {
		this._isComplete = true;
		this._onDidChange.fire();
	}

	cancel(): void {
		this._isComplete = true;
		this._isCanceled = true;
		this._onDidChange.fire();
	}

	setFollowups(followups: IChatFollowup[] | undefined): void {
		this._followups = followups;
		this._onDidChange.fire(); // Fire so that command followups get rendered on the row
	}

	setVote(vote: InteractiveSessionVoteDirection): void {
		this._vote = vote;
		this._onDidChange.fire();
	}
}

export interface IChatModel {
	readonly onDidDispose: Event<void>;
	readonly onDidChange: Event<IChatChangeEvent>;
	readonly sessionId: string;
	readonly providerId: string;
	readonly isInitialized: boolean;
	readonly title: string;
	readonly welcomeMessage: IChatWelcomeMessageModel | undefined;
	readonly requestInProgress: boolean;
	readonly inputPlaceholder?: string;
	getRequests(): IChatRequestModel[];
	toExport(): IExportableChatData;
	toJSON(): ISerializableChatData;
}

export interface ISerializableChatsData {
	[sessionId: string]: ISerializableChatData;
}

export interface ISerializableChatRequestData {
	providerRequestId: string | undefined;
	message: string;
	response: (IMarkdownString | IChatResponseProgressFileTreeData)[] | undefined;
	responseErrorDetails: IChatResponseErrorDetails | undefined;
	followups: IChatFollowup[] | undefined;
	isCanceled: boolean | undefined;
	vote: InteractiveSessionVoteDirection | undefined;
}

export interface IExportableChatData {
	providerId: string;
	welcomeMessage: (string | IChatReplyFollowup[])[] | undefined;
	requests: ISerializableChatRequestData[];
	requesterUsername: string;
	responderUsername: string;
	requesterAvatarIconUri: UriComponents | undefined;
	responderAvatarIconUri: UriComponents | undefined;
	providerState: any;
}

export interface ISerializableChatData extends IExportableChatData {
	sessionId: string;
	creationDate: number;
	isImported: boolean;
}

export function isExportableSessionData(obj: unknown): obj is IExportableChatData {
	const data = obj as IExportableChatData;
	return typeof data === 'object' &&
		typeof data.providerId === 'string' &&
		typeof data.requesterUsername === 'string' &&
		typeof data.responderUsername === 'string';
}

export function isSerializableSessionData(obj: unknown): obj is ISerializableChatData {
	const data = obj as ISerializableChatData;
	return isExportableSessionData(obj) &&
		typeof data.creationDate === 'number' &&
		typeof data.sessionId === 'string';
}

export type IChatChangeEvent = IChatAddRequestEvent | IChatAddResponseEvent | IChatInitEvent | IChatRemoveRequestEvent;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
	request: IChatRequestModel;
}

export interface IChatAddResponseEvent {
	kind: 'addResponse';
	response: IChatResponseModel;
}

export interface IChatRemoveRequestEvent {
	kind: 'removeRequest';
	requestId: string;
	responseId?: string;
}

export interface IChatInitEvent {
	kind: 'initialize';
}

export class ChatModel extends Disposable implements IChatModel {
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChange = this._register(new Emitter<IChatChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private _requests: ChatRequestModel[];
	private _isInitializedDeferred = new DeferredPromise<void>();

	private _session: IChat | undefined;
	get session(): IChat | undefined {
		return this._session;
	}

	private _welcomeMessage: ChatWelcomeMessageModel | undefined;
	get welcomeMessage(): ChatWelcomeMessageModel | undefined {
		return this._welcomeMessage;
	}

	private _providerState: any;
	get providerState(): any {
		return this._providerState;
	}

	// TODO to be clear, this is not the same as the id from the session object, which belongs to the provider.
	// It's easier to be able to identify this model before its async initialization is complete
	private _sessionId: string;
	get sessionId(): string {
		return this._sessionId;
	}

	get inputPlaceholder(): string | undefined {
		return this._session?.inputPlaceholder;
	}

	get requestInProgress(): boolean {
		const lastRequest = this._requests[this._requests.length - 1];
		return !!lastRequest && !!lastRequest.response && !lastRequest.response.isComplete;
	}

	private _creationDate: number;
	get creationDate(): number {
		return this._creationDate;
	}

	get requesterUsername(): string {
		return this._session?.requesterUsername ?? this.initialData?.requesterUsername ?? '';
	}

	get responderUsername(): string {
		return this._session?.responderUsername ?? this.initialData?.responderUsername ?? '';
	}

	private readonly _initialRequesterAvatarIconUri: URI | undefined;
	get requesterAvatarIconUri(): URI | undefined {
		return this._session?.requesterAvatarIconUri ?? this._initialRequesterAvatarIconUri;
	}

	private readonly _initialResponderAvatarIconUri: URI | undefined;
	get responderAvatarIconUri(): URI | undefined {
		return this._session?.responderAvatarIconUri ?? this._initialResponderAvatarIconUri;
	}

	get isInitialized(): boolean {
		return this._isInitializedDeferred.isSettled;
	}

	private _isImported = false;
	get isImported(): boolean {
		return this._isImported;
	}

	get title(): string {
		const firstRequestMessage = this._requests[0]?.message;
		const message = typeof firstRequestMessage === 'string' ? firstRequestMessage : firstRequestMessage?.message ?? '';
		return message.split('\n')[0].substring(0, 50);
	}

	constructor(
		public readonly providerId: string,
		private readonly initialData: ISerializableChatData | IExportableChatData | undefined,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._isImported = (!!initialData && !isSerializableSessionData(initialData)) || (initialData?.isImported ?? false);
		this._sessionId = (isSerializableSessionData(initialData) && initialData.sessionId) || generateUuid();
		this._requests = initialData ? this._deserialize(initialData) : [];
		this._providerState = initialData ? initialData.providerState : undefined;
		this._creationDate = (isSerializableSessionData(initialData) && initialData.creationDate) || Date.now();

		this._initialRequesterAvatarIconUri = initialData?.requesterAvatarIconUri && URI.revive(initialData.requesterAvatarIconUri);
		this._initialResponderAvatarIconUri = initialData?.responderAvatarIconUri && URI.revive(initialData.responderAvatarIconUri);
	}

	private _deserialize(obj: IExportableChatData): ChatRequestModel[] {
		const requests = obj.requests;
		if (!Array.isArray(requests)) {
			this.logService.error(`Ignoring malformed session data: ${obj}`);
			return [];
		}

		if (obj.welcomeMessage) {
			const content = obj.welcomeMessage.map(item => typeof item === 'string' ? new MarkdownString(item) : item);
			this._welcomeMessage = new ChatWelcomeMessageModel(this, content);
		}

		return requests.map((raw: ISerializableChatRequestData) => {
			const request = new ChatRequestModel(this, raw.message, raw.providerRequestId);
			if (raw.response || raw.responseErrorDetails) {
				request.response = new ChatResponseModel(raw.response ?? [new MarkdownString(raw.response)], this, true, raw.isCanceled, raw.vote, raw.providerRequestId, raw.responseErrorDetails, raw.followups);
			}
			return request;
		});
	}

	startReinitialize(): void {
		this._session = undefined;
		this._isInitializedDeferred = new DeferredPromise<void>();
	}

	initialize(session: IChat, welcomeMessage: ChatWelcomeMessageModel | undefined): void {
		if (this._session || this._isInitializedDeferred.isSettled) {
			throw new Error('ChatModel is already initialized');
		}

		this._session = session;
		if (!this._welcomeMessage) {
			// Could also have loaded the welcome message from persisted data
			this._welcomeMessage = welcomeMessage;
		}

		this._isInitializedDeferred.complete();

		if (session.onDidChangeState) {
			this._register(session.onDidChangeState(state => {
				this._providerState = state;
				this.logService.trace('ChatModel#acceptNewSessionState');
			}));
		}
		this._onDidChange.fire({ kind: 'initialize' });
	}

	setInitializationError(error: Error): void {
		if (!this._isInitializedDeferred.isSettled) {
			this._isInitializedDeferred.error(error);
		}
	}

	waitForInitialization(): Promise<void> {
		return this._isInitializedDeferred.p;
	}

	getRequests(): ChatRequestModel[] {
		return this._requests;
	}

	addRequest(message: string | IChatReplyFollowup): ChatRequestModel {
		if (!this._session) {
			throw new Error('addRequest: No session');
		}

		const request = new ChatRequestModel(this, message);
		request.response = new ChatResponseModel(new MarkdownString(''), this);

		this._requests.push(request);
		this._onDidChange.fire({ kind: 'addRequest', request });
		return request;
	}

	acceptResponseProgress(request: ChatRequestModel, progress: IChatProgress, quiet?: boolean): void {
		if (!this._session) {
			throw new Error('acceptResponseProgress: No session');
		}

		if (!request.response) {
			request.response = new ChatResponseModel(new MarkdownString(''), this);
		}

		if (request.response.isComplete) {
			throw new Error('acceptResponseProgress: Adding progress to a completed response');
		}

		if ('content' in progress) {
			request.response.updateContent(progress.content, quiet);
		} else if ('placeholder' in progress || isCompleteInteractiveProgressTreeData(progress)) {
			request.response.updateContent(progress, quiet);
		} else {
			request.setProviderRequestId(progress.requestId);
			request.response.setProviderResponseId(progress.requestId);
		}
	}

	removeRequest(requestId: string): void {
		const index = this._requests.findIndex(request => request.providerRequestId === requestId);
		const request = this._requests[index];
		if (!request.providerRequestId) {
			return;
		}

		if (index !== -1) {
			this._onDidChange.fire({ kind: 'removeRequest', requestId: request.providerRequestId, responseId: request.response?.providerResponseId });
			this._requests.splice(index, 1);
			request.response?.dispose();
		}
	}

	cancelRequest(request: ChatRequestModel): void {
		if (request.response) {
			request.response.cancel();
		}
	}

	setResponse(request: ChatRequestModel, rawResponse: IChatResponse): void {
		if (!this._session) {
			throw new Error('completeResponse: No session');
		}

		if (!request.response) {
			request.response = new ChatResponseModel(new MarkdownString(''), this);
		}

		request.response.setErrorDetails(rawResponse.errorDetails);
	}

	completeResponse(request: ChatRequestModel): void {
		if (!request.response) {
			throw new Error('Call setResponse before completeResponse');
		}

		request.response.complete();
	}

	setFollowups(request: ChatRequestModel, followups: IChatFollowup[] | undefined): void {
		if (!request.response) {
			// Maybe something went wrong?
			return;
		}

		request.response.setFollowups(followups);
	}

	setResponseModel(request: ChatRequestModel, response: ChatResponseModel): void {
		request.response = response;
		this._onDidChange.fire({ kind: 'addResponse', response });
	}

	toExport(): IExportableChatData {
		return {
			requesterUsername: this.requesterUsername,
			requesterAvatarIconUri: this.requesterAvatarIconUri,
			responderUsername: this.responderUsername,
			responderAvatarIconUri: this.responderAvatarIconUri,
			welcomeMessage: this._welcomeMessage?.content.map(c => {
				if (Array.isArray(c)) {
					return c;
				} else {
					return c.value;
				}
			}),
			requests: this._requests.map((r): ISerializableChatRequestData => {
				return {
					providerRequestId: r.providerRequestId,
					message: typeof r.message === 'string' ? r.message : r.message.message,
					response: r.response ? r.response.response.value : undefined,
					responseErrorDetails: r.response?.errorDetails,
					followups: r.response?.followups,
					isCanceled: r.response?.isCanceled,
					vote: r.response?.vote
				};
			}),
			providerId: this.providerId,
			providerState: this._providerState
		};
	}

	toJSON(): ISerializableChatData {
		return {
			...this.toExport(),
			sessionId: this.sessionId,
			creationDate: this._creationDate,
			isImported: this._isImported
		};
	}

	override dispose() {
		this._session?.dispose?.();
		this._requests.forEach(r => r.response?.dispose());
		this._onDidDispose.fire();
		if (!this._isInitializedDeferred.isSettled) {
			this._isInitializedDeferred.error(new Error('model disposed before initialization'));
		}

		super.dispose();
	}
}

export type IChatWelcomeMessageContent = IMarkdownString | IChatReplyFollowup[];

export interface IChatWelcomeMessageModel {
	readonly id: string;
	readonly content: IChatWelcomeMessageContent[];
	readonly username: string;
	readonly avatarIconUri?: URI;

}

export class ChatWelcomeMessageModel implements IChatWelcomeMessageModel {
	private static nextId = 0;

	private _id: string;
	public get id(): string {
		return this._id;
	}

	constructor(
		private readonly session: ChatModel,
		public readonly content: IChatWelcomeMessageContent[],
	) {
		this._id = 'welcome_' + ChatWelcomeMessageModel.nextId++;
	}

	public get username(): string {
		return this.session.responderUsername;
	}

	public get avatarIconUri(): URI | undefined {
		return this.session.responderAvatarIconUri;
	}
}

export function isCompleteInteractiveProgressTreeData(item: unknown): item is { treeData: IChatResponseProgressFileTreeData } {
	return typeof item === 'object' && !!item && 'treeData' in item;
}
